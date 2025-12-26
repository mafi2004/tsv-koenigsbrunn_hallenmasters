
// server/routes/meta.js
const express = require('express');
const db = require('../db');

module.exports = (io /* optional */) => {
  const router = express.Router();

  // GET /api/meta -> { yearLabel, schedule: { timeHHMM, dur, brk }, updatedAt }
  router.get('/', (req, res) => {
    db.get(`SELECT yearLabel, timeHHMM, dur, brk, updatedAt FROM tournament_meta WHERE id = 1`, [], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      const meta = {
        yearLabel: row?.yearLabel ?? null,
        schedule: {
          timeHHMM: row?.timeHHMM ?? null,
          dur: Number.isFinite(Number(row?.dur)) ? Number(row.dur) : null,
          brk: Number.isFinite(Number(row?.brk)) ? Number(row.brk) : null
        },
        updatedAt: row?.updatedAt ?? null
      };
      res.json(meta);
    });
  });

  // POST /api/meta Body: { yearLabel, schedule: { timeHHMM, dur, brk } }
  // Persistiert Label + Plan; sendet Socket-Event 'meta:updated'
  router.post('/', (req, res) => {
    const yearLabel = (req.body?.yearLabel ?? '').toString().trim() || null;
    const s = req.body?.schedule ?? {};
    const timeHHMM = typeof s.timeHHMM === 'string' && /^\d{2}:\d{2}$/.test(s.timeHHMM) ? s.timeHHMM : null;
    const dur = Number(s.dur);
    const brk = Number(s.brk);

    if (timeHHMM && (!Number.isFinite(dur) || dur <= 0 || !Number.isFinite(brk) || brk < 0)) {
      return res.status(400).json({ error: 'Ungültige Dauer/Pause im Schedule' });
    }

    const now = new Date().toISOString();
    db.run(
      `
      INSERT INTO tournament_meta (id, yearLabel, timeHHMM, dur, brk, updatedAt)
      VALUES (1, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        yearLabel = excluded.yearLabel,
        timeHHMM  = excluded.timeHHMM,
        dur       = excluded.dur,
        brk       = excluded.brk,
        updatedAt = excluded.updatedAt
      `,
      [yearLabel, timeHHMM, Number.isFinite(dur) ? dur : null, Number.isFinite(brk) ? brk : null, now],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        try { io?.emit?.('meta:updated', { yearLabel, schedule: { timeHHMM, dur, brk }, updatedAt: now }); } catch {}
        res.json({ ok: true, yearLabel, schedule: { timeHHMM, dur, brk }, updatedAt: now });
      }
    );
  });

  return router;
};
