
// server/routes/reseedGroups.js
// -------------------------------------------------------------
// Re-Seeding nach 3 gespielten Runden in A/B/C:
//
// 1) Teams -> neue Gruppen D/E/F (Bildung anhand "nächstes Feld" 1/2/3)
// 2) SPIELPLAN LEEREN (DELETE FROM matches)
// 3) SOFORT neue Matches für D/E/F anlegen
//    - Runde = 4 (fix; ab hier zählt ihr weiter 5, 6, …)
//    - Feldbelegung BLOCKWEISE: D(1,2,3) → E(1,2,3) → F(1,2,3) → …,
//      bis alle Paarungen verbraucht sind (je Block max. 3 Paarungen / Felder 1..3)
//    - Zeitplanung: nach letztem Plan weiter,
//      Start = (letzte geplante Zeit + dur + 5 Minuten Pause),
//      pro Block Zeit + (dur + brk)
//
// Zusätzlich:
//  - group_state.lastRound für D/E/F auf 4 setzen (Upsert)
//  - Socket-Events: matches:reset, groups:reseeded, round:advanced (D/E/F), results:updated
//  - Alles atomar in einer Transaktion (BEGIN IMMEDIATE … COMMIT)
//
// Factory-Export: module.exports = (sqliteDb, io) => router
// -------------------------------------------------------------

const express = require('express');
const router = express.Router();

/* ---------------- SQLite Promise-Wrapper ---------------- */
function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}
function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this); // this.changes, lastID …
    });
  });
}

/* ---------------- DB-Helfer ---------------- */
async function getTeamsByGroup(dbHandle, g) {
  return all(
    dbHandle,
    `SELECT id, name, groupName
     FROM teams
     WHERE UPPER(groupName) = UPPER(?)`,
    [String(g || '').trim()]
  );
}

async function getMatchesByGroup(dbHandle, g) {
  return all(
    dbHandle,
    `SELECT id,
            teamA       AS teamA_id,
            teamB       AS teamB_id,
            groupName,
            round,
            field,
            winner,
            plannedStart
     FROM matches
     WHERE UPPER(groupName) = UPPER(?)`,
    [String(g || '').trim()]
  );
}

async function updateTeamGroup(dbHandle, teamId, newGroup) {
  return run(
    dbHandle,
    `UPDATE teams SET groupName = ? WHERE id = ?`,
    [String(newGroup || '').trim().toUpperCase(), Number(teamId)]
  );
}

async function upsertGroupState(dbHandle, groupName, lastRound) {
  return run(
    dbHandle,
    `INSERT INTO group_state (groupName, lastRound)
     VALUES (?, ?)
     ON CONFLICT(groupName) DO UPDATE SET lastRound = excluded.lastRound`,
    [String(groupName || '').trim().toUpperCase(), Number(lastRound)]
  );
}

/* ---------------- Turnier-Logik ---------------- */
function maxRoundPlayed(matches) {
  let max = 0;
  for (const m of matches || []) {
    if (Number.isFinite(Number(m.round))) {
      max = Math.max(max, Number(m.round));
    }
  }
  return max;
}
function lastFieldForTeam(teamId, matches) {
  const ms = (matches || [])
    .filter(
      (m) =>
        Number(m.teamA_id) === Number(teamId) ||
        Number(m.teamB_id) === Number(teamId)
    )
    .sort((a, b) => Number(b.round) - Number(a.round)); // absteigend nach Runde
  for (const m of ms) {
    if (m.field != null) return Number(m.field);
  }
  return NaN;
}
function nextFieldFromLastField(last) {
  const lf = Number(last);
  if (!Number.isFinite(lf) || lf < 1 || lf > 3) return NaN;
  return (lf % 3) + 1; // 1->2->3->1
}
function computeNextFieldForTeam(teamId, matchesUpToR3) {
  const lf = lastFieldForTeam(teamId, matchesUpToR3);
  return nextFieldFromLastField(lf); // kann NaN sein (keine Historie)
}

/* ---------------- Zeit-Utilities ---------------- */
function hhmmToMin(hhmm) {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return NaN;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
function minToHHMM(total) {
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
function addMinutesHHMM(hhmm, plus) {
  const base = hhmmToMin(hhmm);
  if (!Number.isFinite(base)) return null;
  return minToHHMM(base + Number(plus));
}

/* ---------------- Paarbildung ---------------- */
function makePairs(teamIds) {
  const pairs = [];
  for (let i = 0; i + 1 < teamIds.length; i += 2) {
    pairs.push([teamIds[i], teamIds[i + 1]]);
  }
  return pairs; // BYE: letztes Team bleibt ohne Paarung
}

/* ---------------- letzte geplante Zeit über A/B/C ---------------- */
function minPlannedHHMMAcrossABC(matchesByG) {
  let last = null;
  ['A', 'B', 'C'].forEach((g) => {
    for (const m of matchesByG[g] || []) {
      const ps = m.plannedStart;
      if (ps && /^\d{2}:\d{2}$/.test(ps)) {
        if (last == null) last = ps;
        else {
          const cur = hhmmToMin(ps);
          const prev = hhmmToMin(last);
          if (Number.isFinite(cur) && Number.isFinite(prev) && cur < prev) last = ps;
        }
      }
    }
  });
  return last; // HH:MM oder null
}

/* ---------------- BLOCKWEISE Einfügen ---------------- */
/**
 * Blockweise Felder:
 *   Block: Gruppe X (D/E/F) auf Feldern 1, 2, 3 mit bis zu 3 Paarungen gleichzeitig
 * Reihenfolge der Blöcke: D -> E -> F -> D -> E -> F … bis alle Paarungen verbraucht sind.
 *
 * Zeit:
 *   currentHHMM initial:
 *     - wenn lastPlannedHHMM vorhanden und schedule.dur: lastPlannedHHMM + dur + 5
 *     - sonst: schedule.timeHHMM + 5 (falls vorhanden)
 *   nach jedem Block: currentHHMM += (dur + brk)
 */
async function insertMatchesBlockwise(sqliteDb, pairsD, pairsE, pairsF, roundNumber, schedule, lastPlannedHHMM) {
  const dur = schedule && Number.isFinite(Number(schedule.dur)) ? Number(schedule.dur) : null;
  const brk = schedule && Number.isFinite(Number(schedule.brk)) ? Number(schedule.brk) : null;
  const slotMin = (dur && brk) ? (dur + brk) : null;

  let currentHHMM = null;
  if (lastPlannedHHMM && dur) {
    currentHHMM = addMinutesHHMM(lastPlannedHHMM, 0);
    if (!currentHHMM && schedule && schedule.timeHHMM) currentHHMM = addMinutesHHMM(schedule.timeHHMM, 5);
  } else if (schedule && schedule.timeHHMM) {
    currentHHMM = addMinutesHHMM(schedule.timeHHMM, 5);
  }

  let iD = 0, iE = 0, iF = 0;
  const hasLeft = () => (iD < pairsD.length) || (iE < pairsE.length) || (iF < pairsF.length);

  async function insertGroupBlock(groupName, pairs, idxRef) {
    const startIdx = idxRef.idx;
    const countHere = Math.min(3, pairs.length - startIdx);
    if (countHere <= 0) return false;

    // Felder 1,2,3
    for (let k = 0; k < countHere; k++) {
      const [teamA, teamB] = pairs[startIdx + k];
      const field = k + 1;
      await run(
        sqliteDb,
        `INSERT INTO matches (teamA, teamB, groupName, round, field, scoreA, scoreB, winner, plannedStart)
         VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, ?)`,
        [Number(teamA), Number(teamB), String(groupName).toUpperCase(), Number(roundNumber), Number(field), currentHHMM]
      );
    }
    idxRef.idx = startIdx + countHere;

    // Zeit nach dem Block weiterzählen
    if (currentHHMM && Number.isFinite(Number(slotMin))) {
      currentHHMM = addMinutesHHMM(currentHHMM, Number(slotMin));
    }
    return true;
  }

  while (hasLeft()) {
    await insertGroupBlock('D', pairsD, { get idx(){return iD;}, set idx(v){iD=v;} });
    await insertGroupBlock('E', pairsE, { get idx(){return iE;}, set idx(v){iE=v;} });
    await insertGroupBlock('F', pairsF, { get idx(){return iF;}, set idx(v){iF=v;} });
  }
}

/* ---------------- Route: POST /reseedGroups ---------------- */
module.exports = (sqliteDb, io /* optional */) => {
  router.post('/reseedGroups', async (req, res) => {
    try {
      const schedule = req.body && req.body.schedule ? req.body.schedule : null;

      // 1) Daten für A/B/C laden
      const groupsABC = ['A', 'B', 'C'];
      const matchesByG = {};
      const teamsByG = {};
      for (const g of groupsABC) {
        teamsByG[g]   = await getTeamsByGroup(sqliteDb, g);
        matchesByG[g] = await getMatchesByGroup(sqliteDb, g);
      }

      // 2) Jede Gruppe muss >= 3 Runden haben
      const okAll = groupsABC.every((g) => maxRoundPlayed(matchesByG[g]) >= 3);
      if (!okAll) {
        return res.status(400).json({ ok:false, msg:'Nicht alle Gruppen haben mindestens 3 Runden gespielt.' });
      }

      // 3) Buckets D/E/F nach "nächstem Feld"
      const bucketD = []; const bucketE = []; const bucketF = []; const bucketU = [];
      for (const g of groupsABC) {
        const matchesUpToR3 = (matchesByG[g] || []).filter((m) => Number(m.round) <= 3);
        for (const t of teamsByG[g] || []) {
          const nf = computeNextFieldForTeam(t.id, matchesUpToR3);
          if (nf === 1) bucketD.push(t);
          else if (nf === 2) bucketE.push(t);
          else if (nf === 3) bucketF.push(t);
          else bucketU.push(t);
        }
      }
      // Fallback gleichmäßig verteilen
      for (let i = 0; i < bucketU.length; i++) {
        const t = bucketU[i];
        const mod = i % 3;
        if (mod === 0) bucketD.push(t);
        else if (mod === 1) bucketE.push(t);
        else bucketF.push(t);
      }

      // 4) letzte geplante Zeit (über alle A/B/C)
      const lastPlannedABC = minPlannedHHMMAcrossABC(matchesByG);

      // --- Transaktion starten ---
      await run(sqliteDb, 'BEGIN IMMEDIATE');

      try {
        // 5) Teams auf D/E/F setzen
        for (const t of bucketD) await updateTeamGroup(sqliteDb, t.id, 'D');
        for (const t of bucketE) await updateTeamGroup(sqliteDb, t.id, 'E');
        for (const t of bucketF) await updateTeamGroup(sqliteDb, t.id, 'F');

        // 6) SPIELPLAN LEEREN
        await run(sqliteDb, `DELETE FROM matches`, []);

        // 7) Paarungen bilden
        const toIds = (rows) => rows.map((t) => Number(t.id));
        const gDTeams = await getTeamsByGroup(sqliteDb, 'D');
        const gETeams = await getTeamsByGroup(sqliteDb, 'E');
        const gFTeams = await getTeamsByGroup(sqliteDb, 'F');

        const pairsD = makePairs(toIds(gDTeams));
        const pairsE = makePairs(toIds(gETeams));
        const pairsF = makePairs(toIds(gFTeams));

        // 8) BLOCKWEISE einfügen — Runde FIX = 4
        await insertMatchesBlockwise(
          sqliteDb,
          pairsD, pairsE, pairsF,
          /* roundNumber */ 4,
          schedule,
          /* lastPlannedHHMM */ lastPlannedABC
        );

        // 9) group_state.lastRound für D/E/F auf 4 setzen (Upsert)
        await upsertGroupState(sqliteDb, 'D', 4);
        await upsertGroupState(sqliteDb, 'E', 4);
        await upsertGroupState(sqliteDb, 'F', 4);

        // --- Commit ---
        await run(sqliteDb, 'COMMIT');

        // 10) Events für Live-UI (erst NACH Commit)
        if (io && typeof io.emit === 'function') {
          io.emit('matches:reset'); // Spielplan wurde geleert
          io.emit('groups:reseeded', {
            D: gDTeams.length, E: gETeams.length, F: gFTeams.length,
            created: { D: pairsD.length, E: pairsE.length, F: pairsF.length },
            round: 4
          });
          io.emit('round:advanced', { groupName: 'D', round: 4 });
          io.emit('round:advanced', { groupName: 'E', round: 4 });
          io.emit('round:advanced', { groupName: 'F', round: 4 });
          io.emit('results:updated');
        }

        // 11) Antwort
        return res.json({
          ok: true,
          msg: 'Gruppen neu zusammengestellt, Spielplan geleert, und Runde 4 für D/E/F BLOCKWEISE angelegt (Felder 1/2/3, Zeit fortlaufend mit 5 Min Pause).',
          result: {
            round: 4,
            D: gDTeams.map((t) => ({ id: t.id, name: t.name })),
            E: gETeams.map((t) => ({ id: t.id, name: t.name })),
            F: gFTeams.map((t) => ({ id: t.id, name: t.name })),
            matchesCreated: { D: pairsD.length, E: pairsE.length, F: pairsF.length },
            lastPlannedBeforeReseed: lastPlannedABC
          }
        });
      } catch (innerErr) {
        // Rollback bei Fehlern in der Transaktion
        try { await run(sqliteDb, 'ROLLBACK'); } catch {}
        throw innerErr;
      }
    } catch (e) {
      console.error('reseedGroups Fehler:', e);
      return res.status(500).json({ ok: false, msg: 'Interner Fehler: ' + e.message });
    }
  });

  return router;
};
