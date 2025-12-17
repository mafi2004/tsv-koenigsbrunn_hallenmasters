const express = require('express');
const db = require('../db');

module.exports = (io) => {
  const router = express.Router();

  // Alle Matches abrufen – sauber sortiert
  router.get('/', (req, res) => {
    const sql = `
      SELECT m.id, m.groupName, m.round, m.field,
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

  // Gruppe starten – 3 Spiele Feld 1,2,3
  router.post('/start/:groupName', (req, res) => {
    const groupName = req.params.groupName;
    db.all("SELECT * FROM teams WHERE groupName = ?", [groupName], (err, teams) => {
      if (err) return res.status(500).json({ error: err.message });
      if (teams.length < 6) return res.status(400).json({ error: "Es müssen 6 Teams sein" });

      const pairs = [
        [teams[0].id, teams[1].id], // Feld 1
        [teams[2].id, teams[3].id], // Feld 2
        [teams[4].id, teams[5].id]  // Feld 3
      ];

      pairs.forEach((p, idx) => {
        db.run(
          "INSERT INTO matches (teamA, teamB, groupName, round, field, scoreA, scoreB, winner) VALUES (?, ?, ?, 1, ?, 0, 0, NULL)",
          [p[0], p[1], groupName, idx+1],
          function(err){ if (err) console.error(err.message); }
        );
      });

      io.emit("resultUpdate", { type: "startGroup", groupName });
      res.json({ success: true });
    });
  });

  // Matches zurücksetzen
  router.delete('/reset', (req, res) => {
    db.run("DELETE FROM matches", [], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      io.emit("resultUpdate", { type: "reset" });
      res.json({ success: true });
    });
  });

  return router;
};
