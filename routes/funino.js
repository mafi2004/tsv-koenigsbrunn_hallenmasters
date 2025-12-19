
const express = require('express');
const db = require('../db');

module.exports = (io) => {
  const router = express.Router();

  function addMinutesHHMM(hhmm, minutes) {
    const [h, m] = String(hhmm).split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
    const DAY = 24 * 60;
    let total = (h * 60 + m + minutes) % DAY;
    if (total < 0) total += DAY;
    const nh = Math.floor(total / 60), nm = total % 60;
    return String(nh).padStart(2, '0') + ':' + String(nm).padStart(2, '0');
  }

  // POST /funino/nextRound
  // Body: { groupName, results:[{field,winnerId,loserId} x3], schedule:{timeHHMM,dur,brk} }
  router.post('/nextRound', (req, res) => {
    const { groupName: gRaw, results, schedule } = req.body;
    const groupName = String(gRaw || '').trim().toUpperCase();

    if (!Array.isArray(results) || results.length !== 3) {
      return res.status(400).json({ error: 'Es müssen genau 3 Ergebnisse vorliegen' });
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

    // Feldreihenfolge sicherstellen
    const haveField = results.every(r => typeof r.field === 'number');
    const ordered = haveField ? [...results].sort((a,b)=>a.field-b.field) : [...results];

    const winners = ordered.map(r => r.winnerId);
    const losers  = ordered.map(r => r.loserId);

    const pairs = [
      { teamA: winners[0], teamB: winners[1], field: 1 },
      { teamA: winners[2], teamB: losers[0],  field: 2 },
      { teamA: losers[1],  teamB: losers[2],  field: 3 }
    ];

    db.serialize(() => {
      // Alphabetische Gruppenliste aus TEAMS
      db.all(
        `SELECT DISTINCT UPPER(TRIM(groupName)) AS g
           FROM teams
          WHERE groupName IS NOT NULL AND TRIM(groupName) <> ''
          ORDER BY g ASC`,
        [],
        (eG, rowsG) => {
          if (eG) return res.status(500).json({ error: eG.message });
          const groups = rowsG.map(x => x.g);
          if (!groups.length) return res.status(400).json({ error: 'Keine Gruppen gefunden (Teams leer?)' });
          let gIndex = groups.indexOf(groupName);
          if (gIndex < 0) groups.push(groupName), gIndex = groups.length - 1;

          // lastRound lesen, nextRound berechnen
          db.get(`SELECT lastRound FROM group_state WHERE groupName = ?`, [groupName], (eS, rowS) => {
            if (eS) return res.status(500).json({ error: eS.message });
            const lastRound = Number(rowS?.lastRound || 1); // fallback: 1
            const nextRound = lastRound + 1;

            // globale Slotposition = (nextRound-1)*G + gIndex
            const slotIndex = (nextRound - 1) * (groups.length) + gIndex;
            const plannedStart = addMinutesHHMM(timeHHMM, slotIndex * slotLen);

            db.run(`BEGIN IMMEDIATE`, (eBegin) => {
              if (eBegin) return res.status(500).json({ error: 'Konnte Transaktion nicht starten: ' + eBegin.message });

              // Alte 3 Spiele der Gruppe entfernen (UI‑Verhalten beibehalten)
              db.run(`DELETE FROM matches WHERE groupName = ?`, [groupName], (eDel) => {
                if (eDel) {
                  return db.run(`ROLLBACK`, () => res.status(500).json({ error: 'Löschen fehlgeschlagen: ' + eDel.message }));
                }

                const createdIds = [];
                const insertNext = (i) => {
                  if (i >= pairs.length) {
                    // group_state updaten
                    db.run(
                      `INSERT INTO group_state (groupName, lastRound)
                             VALUES (?, ?)
                        ON CONFLICT(groupName) DO UPDATE SET lastRound = excluded.lastRound`,
                      [groupName, nextRound],
                      (eGS) => {
                        if (eGS) {
                          return db.run(`ROLLBACK`, () => res.status(500).json({ error: 'group_state Fehler: ' + eGS.message }));
                        }
                        return db.run(`COMMIT`, (eCommit) => {
                          if (eCommit) return res.status(500).json({ error: 'Commit fehlgeschlagen: ' + eCommit.message });

                          io.emit('round:advanced', { groupName, plannedStart });
                          io.emit('resultUpdate', { type: 'nextRound', groupName });
                          res.json({ success: true, created: pairs.length, createdIds, plannedStart, round: nextRound });
                        });
                      }
                    );
                  } else {
                    const p = pairs[i];
                    db.run(
                      `INSERT INTO matches (teamA, teamB, groupName, round, field, scoreA, scoreB, winner, plannedStart)
                       VALUES (?, ?, ?, ?, ?, 0, 0, NULL, ?)`,
                      [p.teamA, p.teamB, groupName, nextRound, p.field, plannedStart],
                      function (eIns) {
                        if (eIns) {
                          return db.run(`ROLLBACK`, () => res.status(500).json({ error: 'Insert fehlgeschlagen (Feld ' + p.field + '): ' + eIns.message }));
                        }
                        if (typeof this.lastID !== 'undefined') createdIds.push(this.lastID);
                        insertNext(i + 1);
                      }
                    );
                  }
                };
                insertNext(0);
              });
            });
          });
        }
      );
    });
  });

  return router;
};
