// routes/minis5/matches.js

const express = require('express');
const db = require('../../db');
const { generateScheduleForGroups } = require('./generator');

module.exports = function(io5) {
  const router = express.Router();

  /* -------------------------------------------------------
     GET /api/minis5/matches
  ------------------------------------------------------- */
  router.get('/', (req, res) => {
    db.all(
      `SELECT m.*, 
              ta.name AS teamA_name,
              tb.name AS teamB_name
       FROM matches m
       LEFT JOIN teams ta ON ta.id = m.teamA
       LEFT JOIN teams tb ON tb.id = m.teamB
       WHERE m.mode='5v5'
       ORDER BY m.plannedStart, m.field`,
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      }
    );
  });

  /* -------------------------------------------------------
     DELETE /api/minis5/matches
  ------------------------------------------------------- */
  router.delete('/', (req, res) => {
    db.run(
      `DELETE FROM matches WHERE mode='5v5'`,
      function (err) {
        if (err) return res.status(500).json({ error: err.message });

        io5.emit('matches:updated');
        res.json({ ok: true });
      }
    );
  });

  /* -------------------------------------------------------
     POST /api/minis5/matches/generate
  ------------------------------------------------------- */
  router.post('/generate', (req, res) => {
    const { timeHHMM, dur, brk } = req.body;

    if (!timeHHMM || !dur || !brk) {
      return res.status(400).json({ error: "Missing schedule parameters" });
    }

    db.all(
      `SELECT * FROM teams WHERE mode='5v5' ORDER BY groupName, id`,
      (err, teams) => {
        if (err) return res.status(500).json({ error: err.message });

        const groupA = teams.filter(t => t.groupName === 'A').map(t => t.id);
        const groupB = teams.filter(t => t.groupName === 'B').map(t => t.id);

        if (groupA.length !== 6 || groupB.length !== 6) {
          return res.status(400).json({
            error: "Für 5v5 müssen beide Gruppen exakt 6 Teams enthalten."
          });
        }

        const schedule = { timeHHMM, dur, brk };
        const matches = generateScheduleForGroups(groupA, groupB, schedule);

        db.run(`DELETE FROM matches WHERE mode='5v5'`, (delErr) => {
          if (delErr) return res.status(500).json({ error: delErr.message });

          const stmt = db.prepare(`
            INSERT INTO matches
            (teamA, teamB, groupName, round, field, scoreA, scoreB, winner, plannedStart, mode)
            VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, ?, '5v5')
          `);

          let roundCounterA = 1;
          let roundCounterB = 1;

          matches.forEach(m => {
            const round = m.groupName === 'A' ? roundCounterA : roundCounterB;

            stmt.run(
              m.teamA,
              m.teamB,
              m.groupName,
              round,
              m.field,
              m.plannedStart
            );

            if (m.groupName === 'A') {
              if (matches.filter(x => x.groupName === 'A' && x.round === round).length === 3) {
                roundCounterA++;
              }
            } else {
              if (matches.filter(x => x.groupName === 'B' && x.round === round).length === 3) {
                roundCounterB++;
              }
            }
          });

          stmt.finalize();

          io5.emit('matches:updated');
          res.json({ ok: true, inserted: matches.length });
        });
      }
    );
  });

  /* -------------------------------------------------------
     POST /api/minis5/matches/updateResult
  ------------------------------------------------------- */
  router.post('/updateResult', (req, res) => {
    const { id, scoreA, scoreB } = req.body;

    if (!id) return res.status(400).json({ error: "Missing match id" });

    let winner = null;
    if (scoreA != null && scoreB != null) {
      if (Number(scoreA) > Number(scoreB)) winner = 'A';
      if (Number(scoreB) > Number(scoreA)) winner = 'B';
    }

    db.run(
      `UPDATE matches
       SET scoreA=?, scoreB=?, winner=?
       WHERE id=? AND mode='5v5'`,
      [scoreA, scoreB, winner, id],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });

        io5.emit('matches:updated');
        res.json({ ok: true });
      }
    );
  });

  return router;
};
