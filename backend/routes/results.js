const express = require('express');
const router = express.Router();
const db = require('../db');

// Ergebnis eintragen + Broadcast
router.post('/', (req, res) => {
  const { matchId, scoreA, scoreB } = req.body;
  db.run("UPDATE matches SET scoreA = ?, scoreB = ? WHERE id = ?",
    [scoreA, scoreB, matchId], function(err) {
      if (err) return res.status(500).json({ error: err.message });

      // Broadcast an alle Clients
      const io = req.app.get('io');
      io.emit('resultUpdate', { matchId, scoreA, scoreB });

      res.json({ success: true, matchId, scoreA, scoreB });
    });
});

module.exports = router;
