// server/routes/minis5/matches.js (5v5)
const express = require('express');
const router = express.Router();
const db = require('../../db');

const {
  generateRoundRobin,
  interleaveGroups,
  assignFieldsAndTimesInterleaved
} = require('./generator');

// Socket helper
function getIO(req) {
  try { return req.app.get('io'); } catch { return null; }
}

/* -------------------------------------------------------
   GET /api/minis5/matches  (nur 5v5)
------------------------------------------------------- */
router.get('/', (req, res) => {
  db.all(`
    SELECT m.*, 
           t1.name AS teamA_name,
           t2.name AS teamB_name
    FROM matches m
    LEFT JOIN teams t1 ON t1.id = m.teamA
    LEFT JOIN teams t2 ON t2.id = m.teamB
    WHERE m.mode = '5v5'
    ORDER BY m.plannedStart ASC, m.field ASC, m.id ASC
  `, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

/* -------------------------------------------------------
   POST /api/minis5/matches/generateAll
------------------------------------------------------- */
router.post('/generateAll', (req, res) => {
  const schedule = req.body.schedule;

  if (!schedule || !/^\d{2}:\d{2}$/.test(schedule.timeHHMM)) {
    return res.status(400).json({ error: 'Ungültiger Schedule (Startzeit HH:MM)' });
  }

  db.all(`
    SELECT id, groupName 
    FROM teams 
    WHERE mode = '5v5'
    ORDER BY id ASC
  `, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const groupA = rows.filter(r => r.groupName === 'A').map(r => r.id);
    const groupB = rows.filter(r => r.groupName === 'B').map(r => r.id);

    if (groupA.length !== 6 || groupB.length !== 6) {
      return res.status(400).json({
        error: 'Für Gruppen A und B müssen jeweils genau 6 Teams vorhanden sein.'
      });
    }

    const gamesA = generateRoundRobin(groupA);
    const gamesB = generateRoundRobin(groupB);
    const interleaved = interleaveGroups(gamesA, gamesB);
    const planned = assignFieldsAndTimesInterleaved(interleaved, schedule);

    db.run(`BEGIN IMMEDIATE`, (eBegin) => {
      if (eBegin) return res.status(500).json({ error: eBegin.message });

      db.run(`DELETE FROM matches WHERE mode = '5v5'`, [], (eDel) => {
        if (eDel) return db.run(`ROLLBACK`, () => res.status(500).json({ error: eDel.message }));

        const stmt = db.prepare(`
          INSERT INTO matches 
            (teamA, teamB, groupName, round, field, scoreA, scoreB, winner, plannedStart, mode)
          VALUES (?, ?, ?, 1, ?, NULL, NULL, NULL, ?, '5v5')
        `);

        let hadErr = false;

        for (const m of planned) {
          stmt.run(
            [m.teamA, m.teamB, m.group, m.field, m.plannedStart],
            (eIns) => {
              if (eIns && !hadErr) {
                hadErr = true;
                db.run(`ROLLBACK`, () =>
                  res.status(500).json({ error: eIns.message })
                );
              }
            }
          );
        }

        stmt.finalize((eFin) => {
          if (hadErr) return;
          if (eFin) return db.run(`ROLLBACK`, () => res.status(500).json({ error: eFin.message }));

          db.run(`COMMIT`, (eCom) => {
            if (eCom) return res.status(500).json({ error: eCom.message });

            getIO(req)?.emit('matches:updated');
            res.json({ ok: true, created: planned.length });
          });
        });
      });
    });
  });
});

/* -------------------------------------------------------
   POST /api/minis5/matches/winner
------------------------------------------------------- */
router.post('/winner', (req, res) => {
  const { matchId, winner } = req.body;

  db.get(`SELECT teamA, teamB FROM matches WHERE id = ? AND mode = '5v5'`,
    [matchId],
    (eSel, row) => {
      if (eSel) return res.status(500).json({ error: eSel.message });
      if (!row) return res.status(404).json({ error: 'Match nicht gefunden' });

      if (![row.teamA, row.teamB].includes(winner)) {
        return res.status(400).json({ error: 'Sieger gehört nicht zu diesem Spiel' });
      }

      db.run(`UPDATE matches SET winner = ? WHERE id = ? AND mode = '5v5'`,
        [winner, matchId],
        (eUp) => {
          if (eUp) return res.status(500).json({ error: eUp.message });

          getIO(req)?.emit('winner:updated');
          res.json({ ok: true });
        });
    });
});

/* -------------------------------------------------------
   DELETE /api/minis5/matches/reset
------------------------------------------------------- */
router.delete('/reset', (req, res) => {
  db.run(`DELETE FROM matches WHERE mode = '5v5'`, [], (err) => {
    if (err) return res.status(500).json({ error: err.message });

    getIO(req)?.emit('matches:updated');
    res.json({ ok: true });
  });
});

module.exports = router;
