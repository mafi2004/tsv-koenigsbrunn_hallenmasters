const express = require('express');
const router = express.Router();
const db = require('../db');

// Alle Spiele abrufen (inkl. Teamnamen)
router.get('/', (req, res) => {
  const sql = `
  SELECT m.id, m.groupName, m.round, m.field,
         t1.name AS teamA, t2.name AS teamB,
         m.teamA AS teamA_id, m.teamB AS teamB_id,
         m.scoreA, m.scoreB, m.winner
  FROM matches m
  LEFT JOIN teams t1 ON m.teamA = t1.id
  LEFT JOIN teams t2 ON m.teamB = t2.id
`;

  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Neues Spiel anlegen
router.post('/', (req, res) => {
  const { teamA, teamB, groupName, round, field } = req.body;
  db.run(
    "INSERT INTO matches (teamA, teamB, groupName, round, field, scoreA, scoreB, winner) VALUES (?, ?, ?, ?, ?, 0, 0, NULL)",
    [teamA, teamB, groupName, round, field],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, teamA, teamB, groupName, round, field, scoreA: 0, scoreB: 0, winner: null });
    }
  );
});

// Reset: alle Spiele löschen
router.delete('/reset', (req, res) => {
  db.run("DELETE FROM matches", [], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

module.exports = router;
