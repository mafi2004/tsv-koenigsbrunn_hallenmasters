// server/routes/funino.js
// -----------------------------------------------------------------------------
// Diese Datei steuert den kompletten 3v3-Spielablauf (Funino-Modus).
//
// Hauptaufgaben:
// - Laden aller Matches für Admin/Viewer
// - Fortschalten einer Gruppe in die nächste Runde (nextRound)
// - Archivieren der alten Runde in match_history
// - Erzeugen der neuen Runde basierend auf Gewinner/Verlierer-Logik
// - Wiederherstellen einer Runde aus der vorherigen Runde oder History
// - Aktualisieren des group_state (welche Runde ist aktiv?)
// - Senden von Live-Events an Admin-UI und Viewer
//
// Die Datei arbeitet vollständig mit Promise-basierten SQLite-Wrappern
// und nutzt Transaktionen für atomare Updates.
// -----------------------------------------------------------------------------

const express = require('express');
const db = require('../db');
const { appendOp, makeSnapshot } = require('../utils/recovery');

module.exports = (io3) => {
  const router = express.Router();

  // ---------------------------------------------------------------------------
  // Promise-basierte SQLite-Wrapper
  // all(sql, params)  → liefert mehrere Zeilen
  // get(sql, params)  → liefert eine Zeile
  // run(sql, params)  → führt Statement aus (INSERT/UPDATE/DELETE)
  // ---------------------------------------------------------------------------
  const all = (sql, params = []) =>
    new Promise((resolve, reject) =>
      db.all(sql, params, (e, rows) => (e ? reject(e) : resolve(rows)))
    );

  const get = (sql, params = []) =>
    new Promise((resolve, reject) =>
      db.get(sql, params, (e, row) => (e ? reject(e) : resolve(row)))
    );

  const run = (sql, params = []) =>
    new Promise((resolve, reject) =>
      db.run(sql, params, function (e) { e ? reject(e) : resolve(this); })
    );

  // ---------------------------------------------------------------------------
  // addMinutesHHMM(hhmm, minutes)
  // Hilfsfunktion: Addiert Minuten zu einer HH:MM-Zeit (24h-Format).
  // ---------------------------------------------------------------------------
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
   * GET /api/funino/
   * Liefert alle 3v3-Matches für Admin/Viewer.
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
        WHERE m.mode='3v3'
        ORDER BY m.id ASC
      `);
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  /* =========================================================================
   * POST /api/funino/nextRound
   * Archiviert die aktuelle Runde einer Gruppe in match_history,
   * löscht sie aus matches und erzeugt die nächste Runde.
   *
   * Ablauf:
   * 1) Ergebnisse validieren
   * 2) Gewinner/Verlierer bestimmen
   * 3) Neue Paarungen erzeugen
   * 4) Zeitplanung berechnen (slotIndex)
   * 5) Transaktion:
   *      - alte Runde archivieren
   *      - alte Runde löschen
   *      - neue Runde einfügen
   *      - group_state aktualisieren
   * 6) Snapshot + Events
   * ========================================================================= */
  router.post('/nextRound', async (req, res) => {
    try {
      const { groupName: gRaw, results, schedule } = req.body;
      const groupName = String(gRaw || '').trim().toUpperCase();

      // --- Validierung ---
      if (!Array.isArray(results) || results.length !== 3) {
        return res.status(400).json({ error: 'Es müssen genau 3 Ergebnisse vorliegen.' });
      }

      const timeHHMM = schedule?.timeHHMM;
      const dur = Number(schedule?.dur);
      const brk = Number(schedule?.brk);

      if (!timeHHMM || !/^\d{2}:\d{2}$/.test(timeHHMM)) {
        return res.status(400).json({ error: 'Ungültige Startzeit timeHHMM.' });
      }
      if (!Number.isFinite(dur) || dur <= 0 || !Number.isFinite(brk) || brk < 0) {
        return res.status(400).json({ error: 'Ungültige Dauer/Pause.' });
      }

      const slotLen = dur + brk;

      // --- Gewinner/Verlierer sortieren ---
      const ordered = [...results].sort((a, b) => Number(a.field) - Number(b.field));
      const winners = ordered.map(r => Number(r.winnerId));
      const losers  = ordered.map(r => Number(r.loserId));

      const pairs = [
        { teamA: winners[0], teamB: winners[1], field: 1 },
        { teamA: winners[2], teamB: losers[0],  field: 2 },
        { teamA: losers[1],  teamB: losers[2],  field: 3 }
      ];

      // --- Gruppenliste alphabetisch ---
      const groups = (await all(`
        SELECT DISTINCT UPPER(TRIM(groupName)) AS g
        FROM teams
        WHERE groupName IS NOT NULL AND TRIM(groupName) <> ''
        ORDER BY g ASC
      `)).map(r => r.g);

      let gIndex = groups.indexOf(groupName);
      if (gIndex < 0) groups.push(groupName), gIndex = groups.length - 1;

      // --- Runde bestimmen ---
      const rowState = await get(`SELECT lastRound FROM group_state WHERE groupName = ?`, [groupName]);
      const lastRound = Number(rowState?.lastRound || 1);
      const nextRound = lastRound + 1;

      // Zeitplanung: slotIndex = (Runde-1) * Gruppenanzahl + Gruppenindex
      const slotIndex = (nextRound - 1) * (groups.length) + gIndex;
      const plannedStart = addMinutesHHMM(timeHHMM, slotIndex * slotLen);

      // --- Transaktion ---
      await run(`BEGIN IMMEDIATE`);
      try {
        // Alte Runde lesen
        const curRows = await all(`
          SELECT id AS originalMatchId, groupName, round, field, teamA, teamB,
                 scoreA, scoreB, winner, plannedStart
          FROM matches
          WHERE UPPER(groupName) = ? AND mode='3v3'
          ORDER BY field ASC, id ASC
        `, [groupName]);

        // Archivieren
        const batchId = `${groupName}-R${lastRound}-at-${Date.now()}`;
        for (const r of curRows) {
          await run(`
            INSERT INTO match_history
            (batchId, groupName, round, field, teamA, teamB,
             scoreA, scoreB, winner, plannedStart, originalMatchId, mode)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '3v3')
          `, [
            batchId, r.groupName, r.round, r.field,
            r.teamA, r.teamB,
            r.scoreA ?? null, r.scoreB ?? null,
            r.winner ?? null,
            r.plannedStart ?? null,
            r.originalMatchId
          ]);
        }

        // Alte Runde löschen
        await run(`DELETE FROM matches WHERE UPPER(groupName) = ? AND mode='3v3'`, [groupName]);

        // Neue Runde einfügen
        for (const p of pairs) {
          await run(`
            INSERT INTO matches
              (teamA, teamB, groupName, round, field,
               scoreA, scoreB, winner, plannedStart, mode)
            VALUES (?, ?, ?, ?, ?, 0, 0, NULL, ?, '3v3')
          `, [p.teamA, p.teamB, groupName, nextRound, p.field, plannedStart]);
        }

        // group_state aktualisieren
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
        io3.emit('history:archived', { groupName, round: lastRound, batchId, count: curRows.length });
        io3.emit('round:advanced',  { groupName, plannedStart, round: nextRound });
        io3.emit('resultUpdate',    { type: 'nextRound', groupName, round: nextRound });

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
   * Baut die aktuelle Runde R neu auf, basierend auf Runde R-1.
   *
   * Ablauf:
   * 1) lastRound bestimmen
   * 2) Versuchen, Runde R-1 aus matches zu laden
   * 3) Falls unvollständig → History-Fallback
   * 4) Gewinner/Verlierer bestimmen
   * 5) aktuelle Runde löschen und neu einfügen (mit gleicher plannedStart)
   * 6) Snapshot + Events
   * ========================================================================= */
  router.post('/rebuildCurrentRound', async (req, res) => {
    try {
      const groupName = String(req.body?.groupName || '').trim().toUpperCase();
      if (!groupName) return res.status(400).json({ error: 'groupName fehlt' });

      // lastRound bestimmen
      let lastRound = Number((await get(
        `SELECT lastRound FROM group_state WHERE UPPER(groupName) = ?`,
        [groupName]
      ))?.lastRound);

      if (!Number.isFinite(lastRound)) {
        const maxRow = await get(
          `SELECT MAX(round) AS r FROM matches WHERE UPPER(groupName) = ? AND mode='3v3'`,
          [groupName]
        );
        lastRound = Number(maxRow?.r);
      }

      if (!Number.isFinite(lastRound) || lastRound < 2) {
        return res.status(400).json({ error: 'Keine aktuelle Runde zum Neuaufbau.' });
      }

      const prevRound = lastRound - 1;

      // --- Versuche R-1 aus matches ---
      let prev = await all(`
        SELECT id, field, teamA AS teamA_id, teamB AS teamB_id, winner
        FROM matches
        WHERE UPPER(groupName) = ? AND round = ? AND mode='3v3'
        ORDER BY field ASC
      `, [groupName, prevRound]);

      let source = 'matches';
      let usedBatchId = null;

      // --- Fallback: History ---
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
          return res.status(400).json({ error: `Vorige Runde (${prevRound}) unvollständig und kein History-Batch gefunden.` });
        }

        const histPrev = await all(`
          SELECT id, field, teamA AS teamA_id, teamB AS teamB_id, winner
          FROM match_history
          WHERE batchId = ?
          ORDER BY field ASC
        `, [lastBatch.batchId]);

        if (!Array.isArray(histPrev) || histPrev.length !== 3 || histPrev.some(m => m.winner == null)) {
          return res.status(400).json({ error: `History-Batch zu Runde ${prevRound} unvollständig.` });
        }

        prev = histPrev;
        source = 'history';
        usedBatchId = lastBatch.batchId;
      }

      // Gewinner/Verlierer bestimmen
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
        SELECT plannedStart
        FROM matches
        WHERE UPPER(groupName) = ? AND round = ? AND mode='3v3'
        ORDER BY id ASC LIMIT 1
      `, [groupName, lastRound]))?.plannedStart || null;

      await run(`BEGIN IMMEDIATE`);
      try {
        // IDs der alten Runde merken
        const row = await get(`
          SELECT id FROM matches
          WHERE UPPER(groupName) = ? AND round = ? AND mode='3v3'
          ORDER BY id ASC LIMIT 1
        `, [groupName, lastRound]);

        const keepID = row?.id || null;

        // alte Runde löschen
        await run(`DELETE FROM matches WHERE UPPER(groupName) = ? AND round = ? AND mode='3v3'`, [groupName, lastRound]);

        // neue Runde einfügen (mit gleichen IDs)
        for (let i = 0; i < pairs.length; i++) {
          const p = pairs[i];

          await run(`
            INSERT INTO matches
              (id, teamA, teamB, groupName, round, field,
               scoreA, scoreB, winner, plannedStart, mode)
            VALUES (?, ?, ?, ?, ?, ?, 0, 0, NULL, ?, '3v3')
          `, [
            keepID + i,
            p.teamA,
            p.teamB,
            groupName,
            lastRound,
            p.field,
            keepPlanned
          ]);
        }

        await run(`COMMIT`);

        // Log + Snapshot
        try {
          await appendOp(db, 'funino:rebuildCurrentRound', {
            groupName,
            round: lastRound,
            source,
            batchId: usedBatchId
          });
          await makeSnapshot(db);
        } catch {}

        // Events
        io3.emit('round:rebuilt', { groupName, round: lastRound });
        io3.emit('resultUpdate',  { type: 'roundRebuilt', groupName, round: lastRound });

        res.json({
          ok: true,
          groupName,
          round: lastRound,
          rebuilt: 3,
          plannedStart: keepPlanned,
          source,
          batchId: usedBatchId
        });
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
