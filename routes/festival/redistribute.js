// server/routes/festival/redistribute.js
// -----------------------------------------------------------------------------
// Festival-Neuverteilung der Teams auf Felder (g1 / g2).
// Immer 2 Teams pro Feld.
// -----------------------------------------------------------------------------

const express = require('express');
const { appendOp, makeSnapshot } = require('../../utils/recovery');

module.exports = (db, ioF) => {
  const router = express.Router();

  // Modus aus Base-URL extrahieren (g1 oder g2)
  function getMode(req) {
    return req.baseUrl.split('/').pop(); // "g1" oder "g2"
  }

  // ---------------------------------------------------------------------------
  // POST /api/festival/g1/redistribute
  // Body: { fieldCount }
  // ---------------------------------------------------------------------------
  router.post('/redistribute', async (req, res) => {
    try {
      const mode = getMode(req);
      const fieldCount = Number(req.body?.fieldCount);

      if (!Number.isFinite(fieldCount) || fieldCount <= 0) {
        return res.status(400).json({ error: 'Ungültige Feldanzahl' });
      }

      // Teams laden
      const teams = await new Promise((resolve, reject) => {
        db.all(
          `SELECT id, name, wins 
           FROM teams 
           WHERE mode=? 
           ORDER BY wins DESC, id ASC`,
          [mode],
          (err, rows) => {
            if (err) return reject(err);
            resolve(rows || []);
          }
        );
      });

      if (!teams.length) {
        return res.json({ ok: true, message: 'Keine Teams vorhanden.' });
      }

      // -----------------------------------------------------------------------
      // BLOCKWEISE ZUWEISUNG: IMMER 2 TEAMS PRO FELD
      // -----------------------------------------------------------------------
      let fieldIndex = 1;

      for (let i = 0; i < teams.length; i++) {
        const t = teams[i];

        await new Promise((resolve, reject) => {
          db.run(
            `UPDATE teams SET field=? WHERE id=? AND mode=?`,
            [fieldIndex, t.id, mode],
            (err) => {
              if (err) return reject(err);
              resolve();
            }
          );
        });

        // Nach jedem zweiten Team Feld wechseln
        if ((i + 1) % 2 === 0) {
          fieldIndex++;
          if (fieldIndex > fieldCount) fieldIndex = 1;
        }
      }

      // Admin-Log + Snapshot
      try {
        await appendOp(db, `festival:${mode}:redistribute`, { fieldCount });
        await makeSnapshot(db);
      } catch {}

      // Live-Update
      ioF.emit('festival:teams:updated');

      res.json({
        ok: true,
        fieldCount,
        teamsAssigned: teams.length
      });

    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
