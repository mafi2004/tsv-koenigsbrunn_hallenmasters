// server/routes/matches.js
// -----------------------------------------------------------------------------
// Diese Datei steuert den Start und das Zurücksetzen des 3v3-Spielplans.
//
// Hauptaufgaben:
// - Alle Matches laden (GET /matches)
// - Eine Gruppe in Runde 1 starten (POST /matches/start/:groupName)
// - Den gesamten Spielplan zurücksetzen (DELETE /matches/reset)
// - Live-Events an Admin-UI und Viewer senden
// - Snapshots + Admin-Operationen protokollieren
//
// Die Datei arbeitet mit klassischen SQLite-Callbacks (kein Promise-Wrapper).
// -----------------------------------------------------------------------------

const express = require('express');
const db = require('../db');
const { appendOp, makeSnapshot } = require('../utils/recovery');

module.exports = (io3) => {
  const router = express.Router();

  // ---------------------------------------------------------------------------
  // addMinutesHHMM(hhmm, minutes)
  // Hilfsfunktion: Addiert Minuten zu einer HH:MM-Zeit (24h-Format).
  // Wird für die Startzeitberechnung verwendet.
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

  // ---------------------------------------------------------------------------
  // GET /matches
  // Liefert alle 3v3-Matches inkl. Teamnamen und plannedStart.
  // Wird vom Admin-Panel und Viewer genutzt.
  // ---------------------------------------------------------------------------
  router.get('/', (req, res) => {
    const sql = `
      SELECT m.id, m.groupName, m.round, m.field, m.plannedStart,
             t1.name AS teamA, t2.name AS teamB,
             m.teamA AS teamA_id, m.teamB AS teamB_id,
             m.scoreA, m.scoreB, m.winner
      FROM matches m
      LEFT JOIN teams t1 ON m.teamA = t1.id
      LEFT JOIN teams t2 ON m.teamB = t2.id
      WHERE m.mode='3v3'
      ORDER BY m.id ASC
    `;
    db.all(sql, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /matches/start/:groupName
  // Startet eine Gruppe in Runde 1.
  //
  // Ablauf:
  // 1) Schedule validieren (Startzeit, Dauer, Pause)
  // 2) Prüfen, ob Gruppe bereits gestartet wurde
  // 3) Alphabetische Gruppenliste bestimmen
  // 4) Startzeit berechnen: timeHHMM + gIndex * slotLen
  // 5) Teams der Gruppe laden (6 Teams erforderlich)
  // 6) 3 Spiele erzeugen (Feld 1–3)
  // 7) group_state auf Runde 1 setzen
  // 8) Events senden + Snapshot erzeugen
  // ---------------------------------------------------------------------------
  router.post('/start/:groupName', (req, res) => {
    const groupName = String(req.params.groupName || '').trim().toUpperCase();
    const schedule = req.body?.schedule || {};
    const timeHHMM = schedule.timeHHMM;
    const dur = Number(schedule.dur);
    const brk = Number(schedule.brk);

    // --- Validierung ---
    if (!timeHHMM || !/^\d{2}:\d{2}$/.test(timeHHMM)) {
      return res.status(400).json({ error: 'Ungültige Startzeit timeHHMM (HH:MM)' });
    }
    if (!Number.isFinite(dur) || dur <= 0 || !Number.isFinite(brk) || brk < 0) {
      return res.status(400).json({ error: 'Ungültige Dauer/Pause im Schedule' });
    }

    const slotLen = dur + brk;

    db.serialize(() => {
      // Prüfen, ob Gruppe bereits gestartet wurde
      db.get(
        `SELECT COUNT(*) AS cnt FROM matches WHERE UPPER(groupName)=? AND mode='3v3'`,
        [groupName],
        (e1, r1) => {
          if (e1) return res.status(500).json({ error: e1.message });
          if ((r1?.cnt || 0) > 0) {
            return res.status(400).json({ error: `Gruppe ${groupName} wurde bereits gestartet.` });
          }

          // --- Alphabetische Gruppenliste ---
          db.all(
            `
            SELECT DISTINCT UPPER(TRIM(groupName)) AS g
            FROM teams
            WHERE groupName IS NOT NULL AND TRIM(groupName) <> ''
            ORDER BY g ASC
            `,
            [],
            (eG, rowsG) => {
              if (eG) return res.status(500).json({ error: eG.message });

              const groups = rowsG.map(x => x.g);
              if (!groups.length) {
                return res.status(400).json({ error: 'Keine Gruppen gefunden (Teams leer?)' });
              }

              let gIndex = groups.indexOf(groupName);
              if (gIndex < 0) {
                groups.push(groupName);
                gIndex = groups.length - 1;
              }

              const plannedStart = addMinutesHHMM(timeHHMM, gIndex * slotLen);

              // --- Teams der Gruppe laden ---
              db.all(
                `SELECT * FROM teams WHERE UPPER(groupName)=? ORDER BY id ASC`,
                [groupName],
                (eT, teams) => {
                  if (eT) return res.status(500).json({ error: eT.message });
                  if (!teams || teams.length < 6) {
                    return res.status(400).json({ error: 'Es müssen 6 Teams sein' });
                  }

                  const pairs = [
                    [teams[0].id, teams[1].id],
                    [teams[2].id, teams[3].id],
                    [teams[4].id, teams[5].id]
                  ];

                  // --- Transaktion ---
                  db.run(`BEGIN IMMEDIATE`, async (eBegin) => {
                    if (eBegin) return res.status(500).json({ error: eBegin.message });

                    try {
                      // Spiele einfügen
                      for (let i = 0; i < pairs.length; i++) {
                        const p = pairs[i];
                        await new Promise((resolve, reject) => {
                          db.run(
                            `INSERT INTO matches
                              (teamA, teamB, groupName, round, field,
                               scoreA, scoreB, winner, plannedStart, mode)
                             VALUES (?, ?, ?, ?, ?, 0, 0, NULL, ?, '3v3')`,
                            [p[0], p[1], groupName, 1, i + 1, plannedStart],
                            (err) => (err ? reject(err) : resolve())
                          );
                        });
                      }

                      // group_state setzen
                      await new Promise((resolve, reject) => {
                        db.run(
                          `INSERT INTO group_state (groupName, lastRound)
                           VALUES (?, 1)
                           ON CONFLICT(groupName) DO UPDATE SET lastRound = 1`,
                          [groupName],
                          (err) => (err ? reject(err) : resolve())
                        );
                      });

                      db.run(`COMMIT`, () => {
                        io3.emit('group:started', { groupName, plannedStart });
                        io3.emit('resultUpdate', { type: 'startGroup', groupName });
                        res.json({ success: true, groupName, created: pairs.length, plannedStart });
                      });
                    } catch (err) {
                      db.run(`ROLLBACK`, () => {
                        res.status(500).json({ error: err.message });
                      });
                    }
                  });
                }
              );
            }
          );
        }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /matches/reset
  // Setzt das gesamte Turnier zurück.
  //
  // Löscht:
  // - matches
  // - group_state
  // - match_history
  //
  // Danach:
  // - appendOp + Snapshot
  // - Live-Events senden
  // ---------------------------------------------------------------------------
  router.delete('/reset', (req, res) => {
    db.run(`BEGIN IMMEDIATE`, (beginErr) => {
      if (beginErr) return res.status(500).json({ error: 'Transaktion fehlgeschlagen: ' + beginErr.message });

      db.run(`DELETE FROM matches WHERE mode='3v3'`, [], (err1) => {
        if (err1) return db.run(`ROLLBACK`, () => res.status(500).json({ error: err1.message }));

        db.run(`DELETE FROM group_state`, [], (err2) => {
          if (err2) return db.run(`ROLLBACK`, () => res.status(500).json({ error: err2.message }));

          db.run(`DELETE FROM match_history`, [], (err3) => {
            if (err3) return db.run(`ROLLBACK`, () => res.status(500).json({ error: err3.message }));

            db.run(`COMMIT`, async (commitErr) => {
              if (commitErr) return res.status(500).json({ error: 'Commit fehlgeschlagen: ' + commitErr.message });

              try {
                await appendOp(db, 'funino:reset', { wipe: ['matches','group_state','match_history'] });
                await makeSnapshot(db);
              } catch {}

              io3.emit('matches:reset');
              io3.emit('history:reset');
              io3.emit('resultUpdate', { type: 'reset' });

              res.json({ success: true, wiped: ['matches','group_state','match_history'] });
            });
          });
        });
      });
    });
  });

  return router;
};
