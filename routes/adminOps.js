
// server/routes/adminOps.js
const express = require('express');
const db = require('../db');
const fs = require('fs');
const { restoreFromSnapshot, makeSnapshot } = require('../utils/recovery');

module.exports = (io) => {
  const router = express.Router();

  // GET /api/adminOps/ops?limit=200
  router.get('/ops', (req, res) => {
    const limit = Math.min(Number(req.query.limit || 200), 2000);
    db.all(
      `SELECT id, ts, op, payload, status FROM admin_ops ORDER BY id ASC LIMIT ?`,
      [limit],
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
      }
    );
  });

  // GET /api/adminOps/snapshots
  router.get('/snapshots', (req, res) => {
    db.all(
      `SELECT id, ts, path FROM admin_snapshots ORDER BY id DESC LIMIT 200`,
      [],
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
      }
    );
  });

  // POST /api/adminOps/snapshot  (manuell Snapshot anlegen)
  router.post('/snapshot', async (req, res) => {
    try {
      const snap = await makeSnapshot(db);
      io.emit?.('snapshot:created', snap);
      res.json({ ok: true, ...snap });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // POST /api/adminOps/recover  (vom neuesten Snapshot)
  router.post('/recover', async (req, res) => {
    try {
      db.get(
        `SELECT id, ts, path FROM admin_snapshots ORDER BY id DESC LIMIT 1`,
        [],
        async (err, row) => {
          if (err) return res.status(500).json({ error: err.message });
          if (!row?.path || !fs.existsSync(row.path)) {
            return res.status(404).json({ error: 'Kein Snapshot gefunden.' });
          }
          await restoreFromSnapshot(db, row.path);
          io.emit?.('recovery:done', { id: row.id, ts: row.ts });
          res.json({ ok: true, snapshotId: row.id, ts: row.ts });
        }
      );
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // POST /api/adminOps/recover/:id  (konkreten Snapshot wiederherstellen)
  router.post('/recover/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'Ungültige Snapshot-ID' });
      db.get(
        `SELECT id, ts, path FROM admin_snapshots WHERE id = ?`,
        [id],
        async (err, row) => {
          if (err) return res.status(500).json({ error: err.message });
          if (!row?.path || !fs.existsSync(row.path)) {
            return res.status(404).json({ error: 'Snapshot nicht gefunden.' });
          }
          await restoreFromSnapshot(db, row.path);
          io.emit?.('recovery:done', { id: row.id, ts: row.ts });
          res.json({ ok: true, snapshotId: row.id, ts: row.ts });
        }
      );
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  return router;
};
``
