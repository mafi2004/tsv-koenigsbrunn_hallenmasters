const express = require('express');
const db = require('../db');

module.exports = (io) => {
  const router = express.Router();

  // Sieger setzen
  router.post('/winner', (req, res) => {
    const { matchId, winner } = req.body;
    if (!matchId || !winner) {
      return res.status(400).json({ error: "MatchId oder Sieger fehlt" });
    }

    db.run("UPDATE matches SET winner = ? WHERE id = ?", [winner, matchId], function(err) {
      if (err) return res.status(500).json({ error: err.message });

      // Broadcast an Viewer
      io.emit("resultUpdate", { matchId, winner });
      res.json({ success: true, matchId, winner });
    });
  });

  return router;
};
