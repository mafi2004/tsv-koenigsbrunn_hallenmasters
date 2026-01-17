const express = require('express');

module.exports = function(io5) {
  const router = express.Router();

  // Beispiel:
  router.post('/matches', (req, res) => {
    // ... speichern ...
    io5.emit('matches:updated');   // nur 5v5-Viewer
    res.json({ ok: true });
  });

  return router;
};
