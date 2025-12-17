const express = require('express');
const db = require('../db');

module.exports = (io) => {
  const router = express.Router();

  // Nächste Runde generieren – alte Spiele der Gruppe raus, neue unten angehängt
  router.post('/nextRound', (req, res) => {
    const { groupName, results } = req.body;

    if (!Array.isArray(results) || results.length !== 3) {
      return res.status(400).json({ error: "Es müssen genau 3 Ergebnisse vorliegen" });
    }

    // Alte Spiele der Gruppe löschen
    db.run("DELETE FROM matches WHERE groupName = ?", [groupName], (err) => {
      if (err) return res.status(500).json({ error: err.message });

      const winners = results.map(r => r.winnerId);
      const losers  = results.map(r => r.loserId);

      const pairs = [
        [winners[0], winners[1]],  // Feld 1
        [winners[2], losers[0]],   // Feld 2
        [losers[1],  losers[2]]    // Feld 3
      ];

      let pending = pairs.length, hadError = false;
      pairs.forEach((p, idx) => {
        db.run(
          "INSERT INTO matches (teamA, teamB, groupName, round, field, scoreA, scoreB, winner) VALUES (?, ?, ?, 1, ?, 0, 0, NULL)",
          [p[0], p[1], groupName, idx+1],
          function(err){
            if (err && !hadError) { hadError = true; return res.status(500).json({ error: err.message }); }
            if (--pending === 0 && !hadError) {
              io.emit("resultUpdate", { type: "nextRound", groupName });
              res.json({ success: true, created: pairs.length });
            }
          }
        );
      });
    });
  });

  return router;
};
