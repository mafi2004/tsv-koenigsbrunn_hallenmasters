// server/routes/adminOps.js
// -----------------------------------------------------------------------------
// Diese Datei stellt alle Admin-Funktionen bereit, die mit Backups (Snapshots),
// Wiederherstellung (Recovery) und dem Auslesen der Admin-Operationen zu tun haben.
//
// Grundidee:
// - Jede wichtige Admin-Aktion wird in admin_ops protokolliert.
// - Snapshots werden in admin_snapshots gespeichert.
// - Über diese API kann der Admin Snapshots erstellen, anzeigen und wiederherstellen.
// - Nach jeder Aktion werden passende Socket-Events an alle verbundenen Clients gesendet.
// -----------------------------------------------------------------------------

const express = require('express');
const db = require('../db');
const fs = require('fs');
const { restoreFromSnapshot, makeSnapshot } = require('../utils/recovery');

module.exports = (io3) => {
  const router = express.Router();

  // ---------------------------------------------------------------------------
  // GET /api/adminOps/ops?limit=200
  // Liefert die letzten Admin-Operationen aus der Tabelle admin_ops.
  // Parameter:
  //   limit (optional): Anzahl der zurückzugebenden Einträge (max. 2000)
  // Rückgabe:
  //   Array von { id, ts, op, payload, status }
  // ---------------------------------------------------------------------------
  router.get('/ops', (req, res) => {
    const limit = Math.min(Number(req.query.limit || 200), 2000);
    db.all(
      `SELECT id, ts, op, payload, status
       FROM admin_ops
       ORDER BY id ASC
       LIMIT ?`,
      [limit],
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
      }
    );
  });

  // ---------------------------------------------------------------------------
  // GET /api/adminOps/snapshots
  // Liefert die letzten 200 Snapshots aus admin_snapshots.
  // Rückgabe:
  //   Array von { id, ts, path }
  // ---------------------------------------------------------------------------
  router.get('/snapshots', (req, res) => {
    db.all(
      `SELECT id, ts, path
       FROM admin_snapshots
       ORDER BY id DESC
       LIMIT 200`,
      [],
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
      }
    );
  });

  // ---------------------------------------------------------------------------
  // POST /api/adminOps/snapshot
  // Erstellt manuell einen neuen Snapshot der gesamten Datenbank.
  // Verwendet makeSnapshot(db) aus utils/recovery.
  // Socket-Event:
  //   snapshot:created
  // Rückgabe:
  //   { ok: true, id, ts, path }
  // ---------------------------------------------------------------------------
  router.post('/snapshot', async (req, res) => {
    try {
      const snap = await makeSnapshot(db);
      io3.emit?.('snapshot:created', snap);
      res.json({ ok: true, ...snap });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/adminOps/recover
  // Stellt die Datenbank vom neuesten Snapshot wieder her.
  // Schritte:
  //   1) Neuesten Snapshot aus admin_snapshots lesen
  //   2) Prüfen, ob Datei existiert
  //   3) restoreFromSnapshot(db, path) ausführen
  // Socket-Event:
  //   recovery:done
  // Rückgabe:
  //   { ok: true, snapshotId, ts }
  // ---------------------------------------------------------------------------
  router.post('/recover', async (req, res) => {
    try {
      db.get(
        `SELECT id, ts, path
         FROM admin_snapshots
         ORDER BY id DESC
         LIMIT 1`,
        [],
        async (err, row) => {
          if (err) return res.status(500).json({ error: err.message });
          if (!row?.path || !fs.existsSync(row.path)) {
            return res.status(404).json({ error: 'Kein Snapshot gefunden.' });
          }

          await restoreFromSnapshot(db, row.path);
          io3.emit?.('recovery:done', { id: row.id, ts: row.ts });

          res.json({ ok: true, snapshotId: row.id, ts: row.ts });
        }
      );
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/adminOps/recover/:id
  // Stellt einen bestimmten Snapshot anhand seiner ID wieder her.
  // Parameter:
  //   :id → Snapshot-ID
  // Socket-Event:
  //   recovery:done
  // Rückgabe:
  //   { ok: true, snapshotId, ts }
  // ---------------------------------------------------------------------------
  router.post('/recover/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: 'Ungültige Snapshot-ID' });
      }

      db.get(
        `SELECT id, ts, path
         FROM admin_snapshots
         WHERE id = ?`,
        [id],
        async (err, row) => {
          if (err) return res.status(500).json({ error: err.message });
          if (!row?.path || !fs.existsSync(row.path)) {
            return res.status(404).json({ error: 'Snapshot nicht gefunden.' });
          }

          await restoreFromSnapshot(db, row.path);
          io3.emit?.('recovery:done', { id: row.id, ts: row.ts });

          res.json({ ok: true, snapshotId: row.id, ts: row.ts });
        }
      );
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  return router;
};
