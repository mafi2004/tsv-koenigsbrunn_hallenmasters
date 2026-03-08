// server/routes/reseedGroups.js
// -----------------------------------------------------------------------------
// Diese Datei steuert den kompletten Reseed-Prozess nach Runde 4.
//
// Hauptaufgaben:
// - Teams aus A/B/C laden
// - Prüfen, ob alle Gruppen Runde 4 erreicht haben
// - Neue Gruppenzuordnung für D/E/F anhand der Felder der Runde 4
// - Teams in DB auf neue Gruppen setzen
// - Alle alten Matches löschen
// - Neue Matches für D/E/F erzeugen (blockweise, 3 Felder pro Gruppe)
// - Startzeit der neuen Runde = aktuelle Uhrzeit + 3 Minuten
// - group_state aktualisieren
// - Snapshot + Admin-Operation
// - Live-Events an Viewer/Admin senden
//
// Diese Datei ist das Herzstück der Finalrunden-Logik.
// -----------------------------------------------------------------------------

const express = require('express');
const router = express.Router();
const { appendOp, makeSnapshot } = require('../utils/recovery');

/* -------------------------- SQLite Promise-Wrapper -------------------------- */
// all(db, sql, params) → mehrere Zeilen
// run(db, sql, params) → INSERT/UPDATE/DELETE
function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}
function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

/* ------------------------------- DB-Helfer -------------------------------- */
// Teams einer Gruppe laden
async function getTeamsByGroup(dbHandle, g) {
  return all(
    dbHandle,
    `SELECT id, name, groupName
     FROM teams
     WHERE UPPER(groupName) = UPPER(?) AND mode = '3v3'`,
    [String(g || '').trim()]
  );
}

// Matches einer Gruppe laden
async function getMatchesByGroup(dbHandle, g) {
  return all(
    dbHandle,
    `SELECT id,
            teamA AS teamA_id,
            teamB AS teamB_id,
            groupName,
            round,
            field,
            winner,
            plannedStart
     FROM matches
     WHERE UPPER(groupName) = UPPER(?) AND mode='3v3'`,
    [String(g || '').trim()]
  );
}

// Team in neue Gruppe verschieben
async function updateTeamGroup(dbHandle, teamId, newGroup) {
  return run(
    dbHandle,
    `UPDATE teams SET groupName = ? WHERE id = ?`,
    [String(newGroup || '').trim().toUpperCase(), Number(teamId)]
  );
}

// group_state aktualisieren
async function upsertGroupState(dbHandle, groupName, lastRound) {
  return run(
    dbHandle,
    `INSERT INTO group_state (groupName, lastRound)
     VALUES (?, ?)
     ON CONFLICT(groupName) DO UPDATE SET lastRound = excluded.lastRound`,
    [String(groupName || '').trim().toUpperCase(), Number(lastRound)]
  );
}

/* ------------------------------- Zeit-Utils ------------------------------- */
// HH:MM → Minuten
function hhmmToMin(hhmm) {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return NaN;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Minuten → HH:MM
function minToHHMM(total) {
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

// HH:MM + Minuten
function addMinutesHHMM(hhmm, plus) {
  const base = hhmmToMin(hhmm);
  if (!Number.isFinite(base)) return null;
  return minToHHMM(base + Number(plus));
}

/* ------------------------------ Paarbildung ------------------------------- */
// Wandelt Team-IDs in 2er-Paare um
function makePairs(teamIds) {
  const pairs = [];
  for (let i = 0; i + 1 < teamIds.length; i += 2) {
    pairs.push([teamIds[i], teamIds[i + 1]]);
  }
  return pairs;
}

/* --------------------------- letzte geplante Zeit -------------------------- */
// Ermittelt die kleinste geplante Zeit aus A/B/C
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
          if (cur < prev) last = ps;
        }
      }
    }
  });
  return last;
}

/* ----------------------- BLOCKWEISE Einfügen (D/E/F) ---------------------- */
// Erzeugt die neuen Matches für D/E/F blockweise (3 Felder pro Gruppe)
async function insertMatchesBlockwise(sqliteDb, pairsD, pairsE, pairsF, roundNumber, schedule, lastPlannedHHMM) {
  const dur = schedule && Number(schedule.dur);
  const brk = schedule && Number(schedule.brk);
  const slotMin = (dur && brk) ? (dur + brk) : null;

  // NEU: Startzeit = aktuelle Uhrzeit + 3 Minuten
  const now = new Date();
  now.setMinutes(now.getMinutes() + 3);

  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');

  // Erste Spielzeit nach Reseed
  let currentHHMM = `${hh}:${mm}`;

  let iD = 0, iE = 0, iF = 0;
  const hasLeft = () => (iD < pairsD.length) || (iE < pairsE.length) || (iF < pairsF.length);

  // Fügt bis zu 3 Spiele einer Gruppe ein
  async function insertGroupBlock(groupName, pairs, idxRef) {
    const startIdx = idxRef.idx;
    const countHere = Math.min(3, pairs.length - startIdx);
    if (countHere <= 0) return false;

    for (let k = 0; k < countHere; k++) {
      const [teamA, teamB] = pairs[startIdx + k];
      const field = k + 1;

      await run(
        sqliteDb,
        `INSERT INTO matches
          (teamA, teamB, groupName, round, field, scoreA, scoreB, winner, plannedStart, mode)
         VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, ?, '3v3')`,
        [
          Number(teamA),
          Number(teamB),
          String(groupName).toUpperCase(),
          Number(roundNumber),
          Number(field),
          currentHHMM
        ]
      );
    }

    idxRef.idx = startIdx + countHere;

    // Nächste Startzeit
    if (currentHHMM && Number.isFinite(Number(slotMin))) {
      currentHHMM = addMinutesHHMM(currentHHMM, Number(slotMin));
    }

    return true;
  }

  // Blockweise: D → E → F → D → E → F …
  while (hasLeft()) {
    await insertGroupBlock('D', pairsD, { get idx(){return iD;}, set idx(v){iD=v;} });
    await insertGroupBlock('E', pairsE, { get idx(){return iE;}, set idx(v){iE=v;} });
    await insertGroupBlock('F', pairsF, { get idx(){return iF;}, set idx(v){iF=v;} });
  }
}

/* --------------------- Route: POST /reseedGroups -------------------------- */
// Führt den kompletten Reseed durch
module.exports = (sqliteDb, io3) => {
  router.post('/reseedGroups', async (req, res) => {
    try {
      const schedule = req.body?.schedule ?? null;

      const groupsABC = ['A', 'B', 'C'];
      const matchesByG = {};
      const teamsByG = {};

      // Teams + Matches aus A/B/C laden
      for (const g of groupsABC) {
        teamsByG[g] = await getTeamsByGroup(sqliteDb, g);
        matchesByG[g] = await getMatchesByGroup(sqliteDb, g);
      }

      // Prüfen, ob alle Gruppen Runde 4 erreicht haben
      const okAll = groupsABC.every((g) =>
        (matchesByG[g] || []).some(m => Number(m.round) >= 4)
      );

      if (!okAll) {
        return res.status(400).json({ ok:false, msg:'Nicht alle Gruppen haben Runde 4 erreicht.' });
      }

      const bucketD = [], bucketE = [], bucketF = [];

      // -------------------------
      // NEUE SETZLOGIK (Runde 4)
      // -------------------------
      for (const g of groupsABC) {
        const teams = teamsByG[g] || [];
        const matches = matchesByG[g] || [];

        const r4 = matches.filter(m => Number(m.round) === 4);

        for (const m of r4) {
          const t1 = teams.find(t => t.id === Number(m.teamA_id));
          const t2 = teams.find(t => t.id === Number(m.teamB_id));

          if (!t1 || !t2) continue;

          if (m.field === 1) {
            bucketD.push(t1, t2);
          } else if (m.field === 2) {
            bucketE.push(t1, t2);
          } else if (m.field === 3) {
            bucketF.push(t1, t2);
          }
        }
      }

      const lastPlannedABC = minPlannedHHMMAcrossABC(matchesByG);

      await run(sqliteDb, 'BEGIN IMMEDIATE');
      try {
        // Teams in neue Gruppen verschieben
        for (const t of bucketD) await updateTeamGroup(sqliteDb, t.id, 'D');
        for (const t of bucketE) await updateTeamGroup(sqliteDb, t.id, 'E');
        for (const t of bucketF) await updateTeamGroup(sqliteDb, t.id, 'F');

        // Alte Matches löschen
        await run(sqliteDb, `DELETE FROM matches WHERE mode='3v3'`);

        const toIds = rows => rows.map(t => Number(t.id));

        // Teams der neuen Gruppen laden
        const gDTeams = await getTeamsByGroup(sqliteDb, 'D');
        const gETeams = await getTeamsByGroup(sqliteDb, 'E');
        const gFTeams = await getTeamsByGroup(sqliteDb, 'F');

        // Paarungen erzeugen
        const pairsD = makePairs(toIds(gDTeams));
        const pairsE = makePairs(toIds(gETeams));
        const pairsF = makePairs(toIds(gFTeams));

        // Neue Matches einfügen
        await insertMatchesBlockwise(
          sqliteDb,
          pairsD, pairsE, pairsF,
          4,
          schedule,
          lastPlannedABC
        );

        // group_state aktualisieren
        await upsertGroupState(sqliteDb, 'D', 4);
        await upsertGroupState(sqliteDb, 'E', 4);
        await upsertGroupState(sqliteDb, 'F', 4);

        await run(sqliteDb, 'COMMIT');

        // Log + Snapshot
        try {
          await appendOp(sqliteDb, 'reseed:groups', { schedule });
          await makeSnapshot(sqliteDb);
        } catch {}

        // Events
        if (io3 && typeof io3.emit === 'function') {
          io3.emit('matches:reset');
          io3.emit('groups:reseeded', {
            D: gDTeams.length, E: gETeams.length, F: gFTeams.length,
            created: { D: pairsD.length, E: pairsE.length, F: pairsF.length },
            round: 4
          });
          io3.emit('round:advanced', { groupName: 'D', round: 5 });
          io3.emit('round:advanced', { groupName: 'E', round: 5 });
          io3.emit('round:advanced', { groupName: 'F', round: 5 });
          io3.emit('results:updated');
        }

        return res.json({
          ok: true,
          msg: 'Gruppen neu zusammengestellt und Runde 4 für D/E/F angelegt.',
          result: {
            round: 4,
            D: gDTeams.map(t => ({ id: t.id, name: t.name })),
            E: gETeams.map(t => ({ id: t.id, name: t.name })),
            F: gFTeams.map(t => ({ id: t.id, name: t.name })),
            matchesCreated: { D: pairsD.length, E: pairsE.length, F: pairsF.length },
            lastPlannedBeforeReseed: lastPlannedABC
          }
        });

      } catch (innerErr) {
        try { await run(sqliteDb, 'ROLLBACK'); } catch {}
        throw innerErr;
      }

    } catch (e) {
      console.error('reseedGroups Fehler:', e);
      return res.status(500).json({ ok:false, msg:'Interner Fehler: ' + e.message });
    }
  });

  return router;
};
