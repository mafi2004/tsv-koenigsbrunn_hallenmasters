const express = require('express');
const router = express.Router();

router.post('/validate', (req, res) => {
  const { timeHHMM, dur, brk } = req.body || {};
  if (!/^\d{2}:\d{2}$/.test(timeHHMM)) {
    return res.status(400).json({ error: 'Ungültige Startzeit HH:MM' });
  }
  const d = Number(dur), b = Number(brk);
  if (!Number.isFinite(d) || d <= 0 || !Number.isFinite(b) || b < 0) {
    return res.status(400).json({ error: 'Ungültige Dauer/Pause' });
  }
  res.json({ ok: true, schedule: { timeHHMM, dur: d, brk: b } });
});

module.exports = router;
