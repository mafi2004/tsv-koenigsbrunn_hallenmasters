// server/routes/scheduleValidate.js
// -----------------------------------------------------------------------------
// Validierungs-Endpoint für Zeitplan-Eingaben.
//
// Hauptaufgabe:
// - Prüft, ob ein Schedule-Objekt gültig ist:
//     * timeHHMM im Format HH:MM
//     * dur > 0
//     * brk >= 0
//
// Wird vom Admin-Panel genutzt, um Eingaben vor der Speicherung zu prüfen.
// -----------------------------------------------------------------------------

const express = require('express');
const router = express.Router();

/**
 * POST /api/schedule/validate
 *
 * Body:
 *   { timeHHMM, dur, brk }
 *
 * Validierung:
 *   - timeHHMM muss HH:MM sein
 *   - dur muss > 0 sein
 *   - brk muss >= 0 sein
 *
 * Rückgabe:
 *   { ok: true, schedule: { timeHHMM, dur, brk } }
 */
router.post('/validate', (req, res) => {
  const { timeHHMM, dur, brk } = req.body || {};

  // Startzeit prüfen
  if (!/^\d{2}:\d{2}$/.test(timeHHMM)) {
    return res.status(400).json({ error: 'Ungültige Startzeit HH:MM' });
  }

  // Dauer + Pause prüfen
  const d = Number(dur);
  const b = Number(brk);

  if (!Number.isFinite(d) || d <= 0 || !Number.isFinite(b) || b < 0) {
    return res.status(400).json({ error: 'Ungültige Dauer/Pause' });
  }

  res.json({
    ok: true,
    schedule: { timeHHMM, dur: d, brk: b }
  });
});

module.exports = router;
