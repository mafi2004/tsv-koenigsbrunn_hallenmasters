
const express = require('express');
const db = require('../db');

module.exports = (io) => {
  const router = express.Router();

  // Aktuelle Settings abrufen
  router.get('/', (req, res) => {
    db.all('SELECT key, value FROM settings', [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      const settings = {};
      rows.forEach(r => settings[r.key] = r.value);
      res.json(settings);
    });
  });

  // Settings setzen (Startzeit, Dauer, Pause)
  router.post('/', (req, res) => {
    const { startTimeEpochMs, matchDurationMin, pauseMin } = req.body;
    const ops = [
      ['startTimeEpochMs', String(startTimeEpochMs ?? '')],
      ['matchDurationMin', String(matchDurationMin ?? '')],
      ['pauseMin', String(pauseMin ?? '')]
    ];
    let pending = ops.length; let hadError = false;
    ops.forEach(([key, value]) => {
      db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, value], (err) => {
        if (err && !hadError) { hadError = true; return res.status(500).json({ error: err.message }); }
        if (--pending === 0 && !hadError) {
          io.emit('scheduleUpdate', { type: 'settingsChanged' });
          res.json({ success: true });
        }
      });
    });
  });

  // Den kompletten Zeitplan abrufen
  router.get('/schedule', (req, res) => {
    db.all('SELECT slotIndex, groupName, startTime FROM schedule ORDER BY slotIndex ASC', [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  // Zeitplan zurücksetzen (optional)
  router.delete('/schedule', (req, res) => {
    db.run('DELETE FROM schedule', [], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      io.emit('scheduleUpdate', { type: 'scheduleReset' });
      res.json({ success: true });
    });
  });

  return router;
};
