
const express = require('express');
const db = require('../db');
const fs = require('fs');
const path = require('path');

module.exports = (io) => {
  const router = express.Router();

  const LOG_DIR = path.join(process.cwd(), 'logs');
  const LOG_FILE = path.join(LOG_DIR, 'admin.log');
  function logLine(line) {
    try {
      if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
      fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
    } catch {}
  }

  function addMinutesHHMM(hhmm, minutes) {
    const [h, m] = String(hhmm).split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
    const DAY = 24 * 60;
    let total = (h * 60 + m + minutes) % DAY;
    if (total < 0) total += DAY;
    const nh = Math.floor(total / 60), nm = total % 60;
    return String(nh).padStart(2, '0') + ':' + String(nm).padStart(2, '0');
  }

  // GET alle Matches (inkl. plannedStart)
  router.get('/', (req, res) => {
    const sql = `
      SELECT m.id, m.groupName, m.round, m.field, m.plannedStart,
             t1.name AS teamA, t2.name AS teamB,
             m.teamA AS teamA_id, m.teamB AS teamB_id,
             m.scoreA, m.scoreB, m.winner
      FROM matches m
      LEFT JOIN teams t1 ON m.teamA = t1.id
      LEFT JOIN teams t2 ON m.teamB = t2.id
      ORDER BY m.id ASC
    `;
    db.all(sql, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  // POST /funino/nextRound
  // Body: { groupName, results:[{field,winnerId,loserId} x3], schedule:{timeHHMM,dur,brk} }
  // Beibehalt des bisherigen UI-Verhaltens:
  // 1) Vorhandene (gespielte) 3 Spiele der Gruppe ARCHIVIEREN
  // 2) Diese 3 Spiele aus matches LÖSCHEN
  // 3) Neue 3 Spiele (nächste Runde) UNTEN ANHÄNGEN
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
      db.all(`
        SELECT DISTINCT UPPER(TRIM(groupName)) AS g
        FROM teams
        WHERE groupName IS NOT NULL AND TRIM(groupName) <> ''
        ORDER BY g ASC
      `, [], (eG, rowsG) => {
        if (eG) return res.status(500).json({ error: eG.message });
        const groups = rowsG.map(x => x.g);
        if (!groups.length) return res.status(400).json({ error: 'Keine Gruppen gefunden (Teams leer?)' });
        let gIndex = groups.indexOf(groupName);
        if (gIndex < 0) groups.push(groupName), gIndex = groups.length - 1;

        // lastRound lesen, nextRound berechnen
        db.get(`SELECT lastRound FROM group_state WHERE groupName = ?`, [groupName], (eS, rowS) => {
          if (eS) return res.status(500).json({ error: eS.message });
          const lastRound = Number(rowS?.lastRound || 1);
          const nextRound = lastRound + 1;

          // globale Slotposition = (nextRound-1)*G + gIndex
          const slotIndex = (nextRound - 1) * (groups.length) + gIndex;
          const plannedStart = addMinutesHHMM(timeHHMM, slotIndex * slotLen);

          db.run(`BEGIN IMMEDIATE`, (eBegin) => {
            if (eBegin) return res.status(500).json({ error: 'Konnte Transaktion nicht starten: ' + eBegin.message });

            // 1) Aktuelle (gespielte) 3 Matches der Gruppe zum Archiv lesen
            db.all(`
              SELECT id AS originalMatchId, groupName, round, field, teamA, teamB, scoreA, scoreB, winner, plannedStart
              FROM matches
              WHERE UPPER(groupName) = ?
              ORDER BY id ASC
            `, [groupName], (selErr, curRows) => {
              if (selErr) {
                return db.run(`ROLLBACK`, () => res.status(500).json({ error: 'Lesen der aktuellen Spiele fehlgeschlagen: ' + selErr.message }));
              }

              // BatchId für Audit
              const batchId = `${groupName}-R${lastRound}-at-${Date.now()}`;

              const insertArchNext = (i) => {
                if (!curRows || i >= curRows.length) {
                  // 2) Jetzt die aktuellen Spiele löschen (bisheriges Verhalten)
                  db.run(`DELETE FROM matches WHERE UPPER(groupName) = ?`, [groupName], (delErr) => {
                    if (delErr) {
                      return db.run(`ROLLBACK`, () => res.status(500).json({ error: 'Löschen fehlgeschlagen: ' + delErr.message }));
                    }

                    // 3) Neue Runde einfügen
                    const createdIds = [];
                    const insNext = (k) => {
                      if (k >= pairs.length) {
                        // group_state updaten
                        db.run(`
                          INSERT INTO group_state (groupName, lastRound)
                          VALUES (?, ?)
                          ON CONFLICT(groupName) DO UPDATE SET lastRound = excluded.lastRound
                        `, [groupName, nextRound], (gsErr) => {
                          if (gsErr) {
                            return db.run(`ROLLBACK`, () => res.status(500).json({ error: 'group_state Fehler: ' + gsErr.message }));
                          }
                          db.run(`COMMIT`, (commitErr) => {
                            if (commitErr) return res.status(500).json({ error: 'Commit fehlgeschlagen: ' + commitErr.message });

                            // Events & Logging
                            io.emit('history:archived', { groupName, round: lastRound, batchId, count: curRows?.length || 0 });
                            io.emit('round:advanced', { groupName, plannedStart, round: nextRound });
                            io.emit('resultUpdate', { type: 'nextRound', groupName, round: nextRound });

                            logLine(`[${new Date().toISOString()}] ARCHIVE group=${groupName} round=${lastRound} batch=${batchId} size=${curRows?.length || 0}`);
                            logLine(`[${new Date().toISOString()}] NEXT_ROUND group=${groupName} round=${nextRound} planned=${plannedStart}`);

                            res.json({ success: true, created: pairs.length, createdIds, plannedStart, round: nextRound, archivedBatchId: batchId });
                          });
                        });
                      } else {
                        const p = pairs[k];
                        db.run(`
                          INSERT INTO matches (teamA, teamB, groupName, round, field, scoreA, scoreB, winner, plannedStart)
                          VALUES (?, ?, ?, ?, ?, 0, 0, NULL, ?)
                        `, [p.teamA, p.teamB, groupName, nextRound, p.field, plannedStart], function (insErr) {
                          if (insErr) {
                            return db.run(`ROLLBACK`, () => res.status(500).json({ error: 'Insert fehlgeschlagen (Feld ' + p.field + '): ' + insErr.message }));
                          }
                          if (typeof this.lastID !== 'undefined') createdIds.push(this.lastID);
                          insNext(k + 1);
                        });
                      }
                    };
                    insNext(0);
                  });

                  return;
                }

                const r = curRows[i];
                db.run(`
                  INSERT INTO match_history
                    (batchId, groupName, round, field, teamA, teamB, scoreA, scoreB, winner, plannedStart, originalMatchId)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                  batchId,
                  r.groupName, r.round, r.field,
                  r.teamA, r.teamB,
                  r.scoreA ?? null, r.scoreB ?? null,
                  r.winner ?? null,
                  r.plannedStart ?? null,
                  r.originalMatchId
                ], (insHErr) => {
                  if (insHErr) {
                    return db.run(`ROLLBACK`, () => res.status(500).json({ error: 'Archivieren fehlgeschlagen: ' + insHErr.message }));
                  }
                  insertArchNext(i + 1);
                });
              };
              insertArchNext(0);
            });
          });
        });
      });
    });
  });

  // NEU: Runde erneut aus vorheriger Runde berechnen/ersetzen (für Korrekturen)
  // POST /funino/rebuildCurrentRound  Body: { groupName }
  router.post('/rebuildCurrentRound', (req, res) => {
    const groupName = String(req.body?.groupName || '').trim().toUpperCase();
    if (!groupName) return res.status(400).json({ error: 'groupName fehlt' });

    // lastRound ermitteln
    db.get(`SELECT lastRound FROM group_state WHERE UPPER(groupName) = ?`, [groupName], (eS, sRow) => {
      if (eS) return res.status(500).json({ error: eS.message });
      let lastRound = Number(sRow?.lastRound);
      const useFallback = () => {
        db.get(`SELECT MAX(round) AS r FROM matches WHERE UPPER(groupName) = ?`, [groupName], (eM, mRow) => {
          if (eM) return res.status(500).json({ error: eM.message });
          proceed(Number(mRow?.r));
        });
      };
      const proceed = (lr) => {
        if (!Number.isFinite(lr) || lr < 2) return res.status(400).json({ error: 'Keine aktuelle Runde zum Neuaufbau' });
        lastRound = lr;
        const prevRound = lastRound - 1;

        db.all(`
          SELECT id, field, teamA AS teamA_id, teamB AS teamB_id, winner
          FROM match_history
          WHERE UPPER(groupName) = ? AND round = ?
          ORDER BY field ASC
        `, [groupName, prevRound], (eH, histRows) => {
          // Falls History dieser Runde leer ist (z.B. alte Daten), als Fallback aus matches lesen:
          const usePrevFromMatches = () => {
            db.all(`
              SELECT id, field, teamA AS teamA_id, teamB AS teamB_id, winner
              FROM matches
              WHERE UPPER(groupName) = ? AND round = ?
              ORDER BY field ASC
            `, [groupName, prevRound], build);
          };
          const build = (eP, prev) => {
            if (eP) return res.status(500).json({ error: eP.message });
            if (!Array.isArray(prev) || prev.length !== 3) return res.status(400).json({ error: `Vorige Runde (${prevRound}) unvollständig` });
            if (prev.some(m => m.winner == null)) return res.status(400).json({ error: `Nicht alle Sieger in Runde ${prevRound} gesetzt` });

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
            db.get(`
              SELECT plannedStart FROM matches
              WHERE UPPER(groupName) = ? AND round = ?
              ORDER BY id ASC LIMIT 1
            `, [groupName, lastRound], (ePS, psRow) => {
              const keepPlanned = psRow?.plannedStart || null;
              db.run(`BEGIN IMMEDIATE`, (eB) => {
                if (eB) return res.status(500).json({ error: eB.message });
                db.run(`DELETE FROM matches WHERE UPPER(groupName) = ? AND round = ?`, [groupName, lastRound], (eDel) => {
                  if (eDel) return db.run(`ROLLBACK`, () => res.status(500).json({ error: eDel.message }));
                  const insertNext = (i) => {
                    if (i >= pairs.length) {
                      return db.run(`COMMIT`, (eC) => {
                        if (eC) return res.status(500).json({ error: eC.message });
                        io.emit('round:rebuilt', { groupName, round: lastRound });
                        io.emit('resultUpdate', { type: 'roundRebuilt', groupName, round: lastRound });
                        logLine(`[${new Date().toISOString()}] REBUILD group=${groupName} round=${lastRound}`);
                        res.json({ ok: true, groupName, round: lastRound, rebuilt: 3, plannedStart: keepPlanned });
                      });
                    }
                    const p = pairs[i];
                    db.run(`
                      INSERT INTO matches (teamA, teamB, groupName, round, field, scoreA, scoreB, winner, plannedStart)
                      VALUES (?, ?, ?, ?, ?, 0, 0, NULL, ?)
                    `, [p.teamA, p.teamB, groupName, lastRound, p.field, keepPlanned], (eIns) => {
                      if (eIns) return db.run(`ROLLBACK`, () => res.status(500).json({ error: eIns.message }));
                      insertNext(i + 1);
                    });
                  };
                  insertNext(0);
                });
              });
            });
          };

          if (eH) return res.status(500).json({ error: eH.message });
          if (Array.isArray(histRows) && histRows.length === 3) {
            build(null, histRows);
          } else {
            usePrevFromMatches();
          }
        });
      };

      if (!Number.isFinite(lastRound)) useFallback();
      else proceed(lastRound);
    });
  });

  // Reset (bleibt unverändert)
  router.delete('/reset', (req, res) => {
    db.run(`DELETE FROM matches`, [], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      db.run(`DELETE FROM group_state`, [], (err2) => {
        if (err2) return res.status(500).json({ error: err2.message });
        io.emit('matches:reset');
        io.emit('resultUpdate', { type: 'reset' });
        logLine(`[${new Date().toISOString()}] RESET matches & group_state`);
        res.json({ success: true });
      });
    });
  });

  return router;
};
