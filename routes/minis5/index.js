// server/routes/minis5/index.js
// -----------------------------------------------------------------------------
// Mini-Router für den 5v5-Modus.
//
// Hauptaufgaben:
// - Beispiel-Endpunkt zum Speichern von 5v5-Matches
// - Senden eines eigenen Socket-Events ("matches:updated") nur für den 5v5-Viewer
//
// Diese Datei dient als Basis, um später echte 5v5-APIs zu ergänzen.
// -----------------------------------------------------------------------------

const express = require('express');

module.exports = function(io5) {
  const router = express.Router();

  // ---------------------------------------------------------------------------
  // POST /api/minis5/matches
  // Beispiel-Endpunkt:
  // - Speichert (in Zukunft) 5v5-Matches
  // - Sendet ein Socket-Event nur an den 5v5-Viewer
  //
  // Rückgabe:
  //   { ok: true }
  // ---------------------------------------------------------------------------
  router.post('/matches', (req, res) => {
    // Hier würden später echte DB-Operationen stehen.
    // Aktuell nur ein Beispiel-Endpunkt.

    io5.emit('matches:updated');   // nur 5v5-Viewer informieren

    res.json({ ok: true });
  });

  return router;
};
