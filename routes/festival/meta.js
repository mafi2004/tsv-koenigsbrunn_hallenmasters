// server/routes/festival/meta.js
// -----------------------------------------------------------------------------
// Festival-Meta-Einstellungen.
// Aktuell:
//   - fieldCount (Anzahl Felder)
//
// Speicherung:
//   Wir nutzen tournament_meta.yearLabel als JSON-Container.
//   Beispiel:
//     yearLabel = '{"festival":{"fieldCount":12}}'
// -----------------------------------------------------------------------------

const express = require('express');
const db = require('../../db');
const { appendOp, makeSnapshot } = require('../../utils/recovery');

module.exports = (ioF) => {
  const router = express.Router();

  // ---------------------------------------------------------------------------
  // Hilfsfunktion: Festival-Meta aus DB lesen
  // ---------------------------------------------------------------------------
  function loadFestivalMeta() {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT yearLabel FROM tournament_meta WHERE id=1`,
        [],
        (err, row) => {
          if (err) return reject(err);

          let meta = {};
          try {
            meta = row?.yearLabel ? JSON.parse(row.yearLabel) : {};
          } catch {
            meta = {};
          }

          resolve(meta.festival || {});
        }
      );
    });
  }

  // ---------------------------------------------------------------------------
  // Hilfsfunktion: Festival-Meta speichern
  // ---------------------------------------------------------------------------
  function saveFestivalMeta(festivalMeta) {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT yearLabel FROM tournament_meta WHERE id=1`,
        [],
        (err, row) => {
          if (err) return reject(err);

          let meta = {};
          try {
            meta = row?.yearLabel ? JSON.parse(row.yearLabel) : {};
          } catch {
            meta = {};
          }

          meta.festival = festivalMeta;

          const now = new Date().toISOString();

          db.run(
            `
            INSERT INTO tournament_meta (id, yearLabel, updatedAt)
            VALUES (1, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              yearLabel = excluded.yearLabel,
              updatedAt = excluded.updatedAt
            `,
            [JSON.stringify(meta), now],
            (err2) => {
              if (err2) return reject(err2);
              resolve({ ok: true, updatedAt: now, festival: festivalMeta });
            }
          );
        }
      );
    });
  }

  // ---------------------------------------------------------------------------
  // GET /api/festival/meta
  // Liefert Festival-Meta (z.B. fieldCount)
  // ---------------------------------------------------------------------------
  router.get('/', async (req, res) => {
    try {
      const meta = await loadFestivalMeta();
      res.json({ ok: true, festival: meta });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/festival/meta
  // Setzt Festival-Meta.
  //
  // Body:
  //   { fieldCount }
  // ---------------------------------------------------------------------------
  router.post('/', async (req, res) => {
    try {
      const fieldCount = Number(req.body?.fieldCount);

      if (!Number.isFinite(fieldCount) || fieldCount <= 0) {
        return res.status(400).json({ error: 'Ungültige Feldanzahl' });
      }

      const festivalMeta = { fieldCount };

      const saved = await saveFestivalMeta(festivalMeta);

      try {
        await appendOp(db, 'festival:meta:update', festivalMeta);
        await makeSnapshot(db);
      } catch {}

      ioF.emit('festival:meta:updated', festivalMeta);

      res.json(saved);

    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
