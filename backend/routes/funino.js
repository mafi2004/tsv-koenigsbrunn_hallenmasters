const express = require('express');
const router = express.Router();
const db = require('../db');

// Nächste Runde generieren mit Gewinner/Verlierer-Rotation
// Erwartet: results = [
//   { winnerId, loserId }, // Match 1
//   { winnerId, loserId }, // Match 2
//   { winnerId, loserId }  // Match 3
// ]
router.post('/nextRound', (req, res) => {
  const { groupName, results } = req.body;
  if (!groupName || !Array.isArray(results) || results.length !== 3) {
    return res.status(400).json({ error: "Es müssen genau 3 Ergebnisse übergeben werden." });
  }

  const valid = results.every(r => Number.isInteger(r.winnerId) && Number.isInteger(r.loserId));
  if (!valid) {
    return res.status(400).json({ error: "winnerId und loserId müssen gültige Team-IDs sein." });
  }

  const r1 = results[0];
  const r2 = results[1];
  const r3 = results[2];

  const next = [
    { teamA: r1.winnerId, teamB: r2.winnerId, field: "Feld 1" },
    { teamA: r1.loserId,  teamB: r3.winnerId, field: "Feld 2" },
    { teamA: r2.loserId,  teamB: r3.loserId,  field: "Feld 3" }
  ];

  db.serialize(() => {
    // Alte Matches der Gruppe löschen
    db.run("DELETE FROM matches WHERE groupName = ?", [groupName], function(err) {
      if (err) return res.status(500).json({ error: err.message });

      // Neue Matches speichern
      const stmt = db.prepare(
        "INSERT INTO matches (teamA, teamB, groupName, round, field, scoreA, scoreB, winner) VALUES (?, ?, ?, ?, ?, 0, 0, NULL)"
      );
      for (const m of next) {
        stmt.run([m.teamA, m.teamB, groupName, "Next Round", m.field]);
      }
      stmt.finalize((err) => {
        if (err) return res.status(500).json({ error: err.message });
        return res.json({ success: true, created: next });
      });
    });
  });
});


module.exports = router;
