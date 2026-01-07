// routes/minis5/matches.js

const express = require('express');
const router = express.Router();
const db = require('../../db');

// Generator importieren
const {
  generateScheduleForGroups
} = require('./generator');

/* -------------------------------------------------------
   GET /api/minis5/matches
   → Alle 5v5-Matches zurückgeben
------------------------------------------------------- */
router.get('/matches', (req, res) => {
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
   GET /api/minis5/teams
   → Alle 5v5-Teams zurückgeben
------------------------------------------------------- */
router.get('/teams', (req, res) => {
  db.all(
    `SELECT * FROM teams WHERE mode='5v5' ORDER BY groupName, id`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

/* -------------------------------------------------------
   DELETE /api/minis5/matches
   → Alle 5v5-Matches löschen
------------------------------------------------------- */
router.delete('/matches', (req, res) => {
  db.run(
    `DELETE FROM matches WHERE mode='5v5'`,
    function (err) {
      if (err) return res.status(500).json({ error: err.message });

      // Live-Update senden
      req.app.get('io').emit('matches:updated');

      res.json({ ok: true });
    }
  );
});

/* -------------------------------------------------------
   POST /api/minis5/generate
   → Spielplan erzeugen und in DB speichern
------------------------------------------------------- */
router.post('/generate', (req, res) => {
  const { timeHHMM, dur, brk } = req.body;

  if (!timeHHMM || !dur || !brk) {
    return res.status(400).json({ error: "Missing schedule parameters" });
  }

  // 5v5 Teams laden
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

      // Spielplan erzeugen
      const schedule = { timeHHMM, dur, brk };
      const matches = generateScheduleForGroups(groupA, groupB, schedule);

      // Alte 5v5-Matches löschen
      db.run(`DELETE FROM matches WHERE mode='5v5'`, (delErr) => {
        if (delErr) return res.status(500).json({ error: delErr.message });

        // Neue Matches einfügen
        const stmt = db.prepare(`
          INSERT INTO matches
          (teamA, teamB, groupName, round, field, scoreA, scoreB, winner, plannedStart, mode)
          VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, ?, '5v5')
        `);

        let roundCounterA = 1;
        let roundCounterB = 1;

        matches.forEach(m => {
          const round =
            m.group === 'A'
              ? roundCounterA
              : roundCounterB;

          stmt.run(
            m.teamA,
            m.teamB,
            m.group,
            round,
            m.field,
            m.plannedStart
          );

          // Nach 3 Spielen Runde erhöhen
          if (m.group === 'A') {
            if (matches.filter(x => x.group === 'A' && x.round === round).length === 3) {
              roundCounterA++;
            }
          } else {
            if (matches.filter(x => x.group === 'B' && x.round === round).length === 3) {
              roundCounterB++;
            }
          }
        });

        stmt.finalize();

        res.json({ ok: true, inserted: matches.length });
      });
    }
  );
});

/* -------------------------------------------------------
   POST /api/minis5/updateResult
   → Ergebnis eines Spiels speichern
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

      // Live-Update senden
      req.app.get('io').emit('matches:updated');

      res.json({ ok: true });
    }
  );
});

module.exports = router;
