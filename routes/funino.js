
// server/routes/funino.js
const express = require('express');
const db = require('../db');
const { appendOp, makeSnapshot } = require('../utils/recovery');

module.exports = (io) => {
  const router = express.Router();

  // Helpers (Promise-Wrapper)
  const all = (sql, params = []) =>
    new Promise((resolve, reject) => db.all(sql, params, (e, rows) => (e ? reject(e) : resolve(rows))));
  const get = (sql, params = []) =>
    new Promise((resolve, reject) => db.get(sql, params, (e, row) => (e ? reject(e) : resolve(row))));
  const run = (sql, params = []) =>
    new Promise((resolve, reject) => db.run(sql, params, function (e) { e ? reject(e) : resolve(this); }));

  function addMinutesHHMM(hhmm, minutes) {
    const [h, m] = String(hhmm).split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
    const DAY = 24 * 60;
    let total = (h * 60 + m + minutes) % DAY;
    if (total < 0) total += DAY;
    const nh = Math.floor(total / 60), nm = total % 60;
    return String(nh).padStart(2, '0') + ':' + String(nm).padStart(2, '0');
  }

  /* =========================================================================
   * GET /api/funino/   → Matches (für Admin-View)
   * ========================================================================= */
  router.get('/', async (req, res) => {
    try {
      const rows = await all(`
        SELECT m.id, m.groupName, m.round, m.field, m.plannedStart,
               t1.name AS teamA, t2.name AS teamB,
               m.teamA AS teamA_id, m.teamB AS teamB_id,
               m.scoreA, m.scoreB, m.winner
        FROM matches m
        LEFT JOIN teams t1 ON m.teamA = t1.id
        LEFT JOIN teams t2 ON m.teamB = t2.id
        ORDER BY m.id ASC
      `);
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  /* =========================================================================
   * POST /api/funino/nextRound
   * Archiviert die aktuelle 3er-Gruppe einer Gruppe in match_history,
   * löscht sie aus matches und hängt die neue Runde unten an (Zeitplanung via schedule).
   * ========================================================================= */
  router.post('/nextRound', async (req, res) => {
    try {
      const { groupName: gRaw, results, schedule } = req.body;
      const groupName = String(gRaw || '').trim().toUpperCase();

      if (!Array.isArray(results) || results.length !== 3) {
        return res.status(400).json({ error: 'Es müssen genau 3 Ergebnisse vorliegen (3 Spiele einer Gruppe).' });
      }
      const timeHHMM = schedule?.timeHHMM;
      const dur = Number(schedule?.dur);
      const brk = Number(schedule?.brk);
      if (!timeHHMM || !/^\d{2}:\d{2}$/.test(timeHHMM)) {
        return res.status(400).json({ error: 'Ungültige Startzeit timeHHMM (HH:MM) im Schedule' });
      }
      if (!Number.isFinite(dur) || dur <= 0 || !Number.isFinite(brk) || brk < 0) {
        return res.status(400).json({ error: 'Ungültige Dauer/Pause im Schedule' });
      }
      const slotLen = dur + brk;

      // Feldsortierung
      const ordered = [...results].sort((a, b) => Number(a.field) - Number(b.field));
      const winners = ordered.map(r => Number(r.winnerId));
      const losers  = ordered.map(r => Number(r.loserId));
      const pairs = [
        { teamA: winners[0], teamB: winners[1], field: 1 },
        { teamA: winners[2], teamB: losers[0],  field: 2 },
        { teamA: losers[1],  teamB: losers[2],  field: 3 }
      ];

      // Gruppenliste (alphabetisch)
      const groups = (await all(`
        SELECT DISTINCT UPPER(TRIM(groupName)) AS g
        FROM teams
        WHERE groupName IS NOT NULL AND TRIM(groupName) <> ''
        ORDER BY g ASC
      `)).map(r => r.g);
      let gIndex = groups.indexOf(groupName);
      if (gIndex < 0) groups.push(groupName), gIndex = groups.length - 1;

      const rowState = await get(`SELECT lastRound FROM group_state WHERE groupName = ?`, [groupName]);
      const lastRound = Number(rowState?.lastRound || 1);
      const nextRound = lastRound + 1;

      const slotIndex = (nextRound - 1) * (groups.length) + gIndex;
      const plannedStart = addMinutesHHMM(timeHHMM, slotIndex * slotLen);

      // Transaktion
      await run(`BEGIN IMMEDIATE`);
      try {
        // Aktuelle Spiele der Gruppe lesen
        const curRows = await all(`
          SELECT id AS originalMatchId, groupName, round, field, teamA, teamB, scoreA, scoreB, winner, plannedStart
          FROM matches
          WHERE UPPER(groupName) = ?
          ORDER BY field ASC, id ASC
        `, [groupName]);

        // History-Archiv
        const batchId = `${groupName}-R${lastRound}-at-${Date.now()}`;
        for (const r of curRows) {
          await run(`
            INSERT INTO match_history
            (batchId, groupName, round, field, teamA, teamB, scoreA, scoreB, winner, plannedStart, originalMatchId)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            batchId, r.groupName, r.round, r.field,
            r.teamA, r.teamB,
            r.scoreA ?? null, r.scoreB ?? null,
            r.winner ?? null,
            r.plannedStart ?? null,
            r.originalMatchId
          ]);
        }

        // Alte Spiele löschen
        await run(`DELETE FROM matches WHERE UPPER(groupName) = ?`, [groupName]);

        // Neue Runde einfügen
        for (const p of pairs) {
          await run(`
            INSERT INTO matches (teamA, teamB, groupName, round, field, scoreA, scoreB, winner, plannedStart)
            VALUES (?, ?, ?, ?, ?, 0, 0, NULL, ?)
          `, [p.teamA, p.teamB, groupName, nextRound, p.field, plannedStart]);
        }

        // group_state updaten
        await run(`
          INSERT INTO group_state (groupName, lastRound)
          VALUES (?, ?)
          ON CONFLICT(groupName) DO UPDATE SET lastRound = excluded.lastRound
        `, [groupName, nextRound]);

        await run(`COMMIT`);

        // Log + Snapshot
        try {
          await appendOp(db, 'funino:nextRound', { groupName, results, schedule, round: nextRound });
          await makeSnapshot(db);
        } catch {}

        // Events
        io.emit('history:archived', { groupName, round: lastRound, batchId, count: curRows.length });
        io.emit('round:advanced',  { groupName, plannedStart, round: nextRound });
        io.emit('resultUpdate',    { type: 'nextRound', groupName, round: nextRound });

        res.json({ success: true, plannedStart, round: nextRound, archivedBatchId: batchId });
      } catch (inner) {
        await run(`ROLLBACK`);
        throw inner;
      }
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  /* =========================================================================
   * POST /api/funino/rebuildCurrentRound
   * Rebuild der aktuellen Runde R aus der vorigen Runde R-1.
   * FALLBACK: Wenn R-1 in matches unvollständig/ohne Sieger ist, wird der
   * zuletzt passende History-Batch (round=R-1) verwendet.
   * ========================================================================= */
  router.post('/rebuildCurrentRound', async (req, res) => {
    try {
      const groupName = String(req.body?.groupName || '').trim().toUpperCase();
      if (!groupName) return res.status(400).json({ error: 'groupName fehlt' });

      // lastRound feststellen (primär group_state, sekundär matches)
      let lastRound = Number((await get(
        `SELECT lastRound FROM group_state WHERE UPPER(groupName) = ?`,
        [groupName]
      ))?.lastRound);

      if (!Number.isFinite(lastRound)) {
        const maxRow = await get(
          `SELECT MAX(round) AS r FROM matches WHERE UPPER(groupName) = ?`,
          [groupName]
        );
        lastRound = Number(maxRow?.r);
      }

      if (!Number.isFinite(lastRound) || lastRound < 2) {
        return res.status(400).json({ error: 'Keine aktuelle Runde zum Neuaufbau (lastRound < 2?)' });
      }

      const prevRound = lastRound - 1;

      // 1) Versuche R-1 aus matches zu laden
      let prev = await all(`
        SELECT id, field, teamA AS teamA_id, teamB AS teamB_id, winner
        FROM matches
        WHERE UPPER(groupName) = ? AND round = ?
        ORDER BY field ASC
      `, [groupName, prevRound]);

      let source = 'matches';
      let usedBatchId = null;

      // 2) FALLBACK: R-1 aus History-Batch, wenn unvollständig/ohne Sieger
      const prevIncomplete = (!Array.isArray(prev) || prev.length !== 3 || prev.some(m => m.winner == null));
      if (prevIncomplete) {
        const lastBatch = await get(`
          SELECT batchId, MAX(archivedAt) AS ts
          FROM match_history
          WHERE UPPER(groupName) = ? AND round = ?
          GROUP BY batchId
          ORDER BY ts DESC
          LIMIT 1
        `, [groupName, prevRound]);

        if (!lastBatch?.batchId) {
          return res.status(400).json({ error: `Vorige Runde (${prevRound}) unvollständig (3 Spiele erwartet) und kein passender History-Batch gefunden.` });
        }

        const histPrev = await all(`
          SELECT field, teamA AS teamA_id, teamB AS teamB_id, winner
          FROM match_history
          WHERE batchId = ?
          ORDER BY field ASC
        `, [lastBatch.batchId]);

        if (!Array.isArray(histPrev) || histPrev.length !== 3 || histPrev.some(m => m.winner == null)) {
          return res.status(400).json({ error: `History-Batch zu Runde ${prevRound} unvollständig/ohne Sieger.` });
        }

        prev = histPrev;
        source = 'history';
        usedBatchId = lastBatch.batchId;
      }

      // Gewinner/Verlierer aus prev ableiten
      const winners = prev.map(m => Number(m.winner));
      const losers  = prev.map(m => {
        const a = Number(m.teamA_id), b = Number(m.teamB_id), w = Number(m.winner);
        return (w === a) ? b : a;
      });
      const pairs = [
        { teamA: winners[0], teamB: winners[1], field: 1 },
        { teamA: winners[2], teamB: losers[0],  field: 2 },
        { teamA: losers[1],  teamB: losers[2],  field: 3 }
      ];

      // geplante Zeit der aktuellen Runde beibehalten
      const keepPlanned = (await get(`
        SELECT plannedStart FROM matches
        WHERE UPPER(groupName) = ? AND round = ?
        ORDER BY id ASC LIMIT 1
      `, [groupName, lastRound]))?.plannedStart || null;

      await run(`BEGIN IMMEDIATE`);
      try {
        // aktuelle Runde R löschen …
        await run(`DELETE FROM matches WHERE UPPER(groupName) = ? AND round = ?`, [groupName, lastRound]);
        // … und neu einfügen (mit gleicher plannedStart)
        for (const p of pairs) {
          await run(`
            INSERT INTO matches (teamA, teamB, groupName, round, field, scoreA, scoreB, winner, plannedStart)
            VALUES (?, ?, ?, ?, ?, 0, 0, NULL, ?)
          `, [p.teamA, p.teamB, groupName, lastRound, p.field, keepPlanned]);
        }

        await run(`COMMIT`);

        // Log + Snapshot
        try {
          await appendOp(db, 'funino:rebuildCurrentRound', { groupName, round: lastRound, source, batchId: usedBatchId });
          await makeSnapshot(db);
        } catch {}

        // Events
        io.emit('round:rebuilt', { groupName, round: lastRound });
        io.emit('resultUpdate',  { type: 'roundRebuilt', groupName, round: lastRound });

        res.json({ ok: true, groupName, round: lastRound, rebuilt: 3, plannedStart: keepPlanned, source, batchId: usedBatchId });
      } catch (inner) {
        await run(`ROLLBACK`);
        throw inner;
      }
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
