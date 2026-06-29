// server/routes/festival/meta.js
// -----------------------------------------------------------------------------
// Festival-Meta-Einstellungen für g1 und g2.
// -----------------------------------------------------------------------------

const express = require('express');
const db = require('../../db');
const { appendOp, makeSnapshot } = require('../../utils/recovery');

module.exports = (ioF) => {
  const router = express.Router();

  // Festival-Meta laden
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

          if (!meta.festival) meta.festival = {};
          if (!meta.festival.g1) meta.festival.g1 = {};
          if (!meta.festival.g2) meta.festival.g2 = {};

          resolve(meta);
        }
      );
    });
  }

  // Festival-Meta speichern
  function saveFestivalMeta(meta) {
    return new Promise((resolve, reject) => {
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
          resolve({ ok: true, updatedAt: now, festival: meta.festival });
        }
      );
    });
  }

  // Modus aus Base-URL extrahieren (g1 oder g2)
  function getMode(req) {
    return req.baseUrl.split('/').pop();
  }

  // GET /api/festival/g1/meta
  router.get('/meta', async (req, res) => {
    try {
      const mode = getMode(req);
      const meta = await loadFestivalMeta();

      res.json({
        ok: true,
        festival: meta.festival[mode] || {}
      });

    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/festival/g1/meta
  router.post('/meta', async (req, res) => {
    try {
      const mode = getMode(req);
      const fieldCount = Number(req.body?.fieldCount);
      const gameType = req.body?.gameType;
      const startTime    = req.body?.startTime;     // "HH:MM"
      const gameDuration = Number(req.body?.gameDuration); // Minuten
      const gameCount    = Number(req.body?.gameCount);    // Anzahl Spiele

      const newMeta = {};

      // Feldanzahl aktualisieren
      if (Number.isFinite(fieldCount) && fieldCount > 0) {
        newMeta.fieldCount = fieldCount;
      }

      // Spieltyp aktualisieren
      if (gameType === "3v3" || gameType === "5v5") {
        newMeta.gameType = gameType;
      }

      if (typeof startTime === "string" && startTime.length >= 4)
      newMeta.startTime = startTime;

      if (Number.isFinite(gameDuration) && gameDuration > 0)
        newMeta.gameDuration = gameDuration;

      if (Number.isFinite(gameCount) && gameCount > 0)
        newMeta.gameCount = gameCount;

      if (!Object.keys(newMeta).length) {
        return res.status(400).json({ error: 'Keine gültigen Meta-Daten' });
      }

      const meta = await loadFestivalMeta();
      meta.festival[mode] = {
        ...meta.festival[mode],
        ...newMeta
      };

      const saved = await saveFestivalMeta(meta);

      try {
        await appendOp(db, `festival:${mode}:meta:update`, newMeta);
        await makeSnapshot(db);
      } catch {}

      ioF.emit('festival:meta:updated', { mode, ...newMeta });

      res.json(saved);

    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
