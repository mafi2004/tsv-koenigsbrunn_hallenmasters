
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

  // POST /matches/start/:groupName
  // Body: { schedule: { timeHHMM, dur, brk } }
  router.post('/start/:groupName', (req, res) => {
    const groupName = String(req.params.groupName || '').trim().toUpperCase();
    const schedule = req.body?.schedule || {};
    const timeHHMM = schedule.timeHHMM;
    const dur = Number(schedule.dur);
    const brk = Number(schedule.brk);

    if (!timeHHMM || !/^\d{2}:\d{2}$/.test(timeHHMM)) {
      return res.status(400).json({ error: 'Ungültige Startzeit timeHHMM (HH:MM) im Schedule' });
    }
    if (!Number.isFinite(dur) || dur <= 0 || !Number.isFinite(brk) || brk < 0) {
      return res.status(400).json({ error: 'Ungültige Dauer/Pause im Schedule' });
    }
    const slotLen = dur + brk;

    db.serialize(() => {
      // Gruppe darf noch nicht gestartet sein
      db.get(`SELECT COUNT(*) AS cnt FROM matches WHERE UPPER(groupName) = ?`, [groupName], (e1, r1) => {
        if (e1) return res.status(500).json({ error: e1.message });
        if ((r1?.cnt || 0) > 0) {
          return res.status(400).json({ error: `Gruppe ${groupName} wurde bereits gestartet.` });
        }

        // Alphabetische Gruppenliste aus TEAMS (damit B und C direkt einen Offset bekommen)
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

            const plannedStart = addMinutesHHMM(timeHHMM, gIndex * slotLen);

            // Teams bestimmen (6 Stück)
            db.all(`SELECT * FROM teams WHERE UPPER(groupName) = ? ORDER BY id ASC`, [groupName], (eT, teams) => {
              if (eT) return res.status(500).json({ error: eT.message });
              if (!Array.isArray(teams) || teams.length < 6) {
                return res.status(400).json({ error: 'Es müssen 6 Teams sein' });
              }

              const pairs = [
                [teams[0].id, teams[1].id],
                [teams[2].id, teams[3].id],
                [teams[4].id, teams[5].id]
              ];

              db.run(`BEGIN IMMEDIATE`, (eBegin) => {
                if (eBegin) return res.status(500).json({ error: 'Konnte Transaktion nicht starten: ' + eBegin.message });

                let hadErr = false;
                pairs.forEach((p, idx) => {
                  db.run(
                    `INSERT INTO matches (teamA, teamB, groupName, round, field, scoreA, scoreB, winner, plannedStart)
                     VALUES (?, ?, ?, ?, ?, 0, 0, NULL, ?)`,
                    [p[0], p[1], groupName, 1, idx + 1, plannedStart],
                    function (insErr) {
                      if (insErr && !hadErr) {
                        hadErr = true;
                        db.run(`ROLLBACK`, () => res.status(500).json({ error: 'Insert fehlgeschlagen: ' + insErr.message }));
                      }
                    }
                  );
                });

                if (!hadErr) {
                  // group_state upsert: lastRound=1
                  db.run(
                    `INSERT INTO group_state (groupName, lastRound)
                           VALUES (?, 1)
                      ON CONFLICT(groupName) DO UPDATE SET lastRound = excluded.lastRound`,
                    [groupName],
                    (eGS) => {
                      if (eGS) {
                        return db.run(`ROLLBACK`, () => res.status(500).json({ error: 'group_state Fehler: ' + eGS.message }));
                      }
                      db.run(`COMMIT`, (eCommit) => {
                        if (eCommit) return res.status(500).json({ error: 'Commit Fehler: ' + eCommit.message });

                        io.emit('group:started', { groupName, plannedStart });
                        io.emit('resultUpdate', { type: 'startGroup', groupName });
                        res.json({ success: true, groupName, created: pairs.length, plannedStart });
                      });
                    }
                  );
                }
              });
            });
          }
        );
      });
    });
  });

  // Reset
  router.delete('/reset', (req, res) => {
    db.run(`DELETE FROM matches`, [], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      db.run(`DELETE FROM group_state`, [], (err2) => {
        if (err2) return res.status(500).json({ error: err2.message });
        io.emit('matches:reset');
        io.emit('resultUpdate', { type: 'reset' });
        res.json({ success: true });
      });
    });
  });

  return router;
};
``
