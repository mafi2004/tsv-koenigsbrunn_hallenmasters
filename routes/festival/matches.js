// server/routes/festival/matches.js
// -----------------------------------------------------------------------------
// Matches für das Outdoor-Festival.
// Extrem einfache Struktur:
// - Keine Gruppen
// - Keine Runden
// - Nur Felder + Teams
// - mode='festival'
// - Snapshot + Admin-Log + Socket-Events
// -----------------------------------------------------------------------------

const express = require('express');
const db = require('../../db');
const { appendOp, makeSnapshot } = require('../../utils/recovery');

module.exports = (ioF) => {
  const router = express.Router();

  // ---------------------------------------------------------------------------
  // GET /api/festival/matches
  // Liefert alle Festival-Matches.
  // ---------------------------------------------------------------------------
  router.get('/', (req, res) => {
    db.all(
      `
      SELECT m.id, m.field, m.teamA, m.teamB,
             t1.name AS teamA_name,
             t2.name AS teamB_name,
             m.scoreA, m.scoreB, m.winner
      FROM matches m
      LEFT JOIN teams t1 ON t1.id = m.teamA
      LEFT JOIN teams t2 ON t2.id = m.teamB
      WHERE m.mode='festival'
      ORDER BY m.field ASC, m.id ASC
      `,
      [],
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
      }
    );
  });

  // ---------------------------------------------------------------------------
  // POST /api/festival/matches/generate
  // Erzeugt neue Matches basierend auf:
  // - Teamliste
  // - Anzahl Felder
  //
  // Body:
  //   { fieldCount }
  //
  // Ablauf:
  // 1) Teams laden
  // 2) Teams mischen
  // 3) 2er-Paare bilden
  // 4) Matches erzeugen
  // ---------------------------------------------------------------------------
  router.post('/generate', (req, res) => {
    const fieldCount = Number(req.body?.fieldCount);
    if (!Number.isFinite(fieldCount) || fieldCount <= 0) {
      return res.status(400).json({ error: 'Ungültige Feldanzahl' });
    }

    db.all(
      `SELECT id, name FROM teams WHERE mode='festival' ORDER BY id ASC`,
      [],
      async (err, teams) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!teams.length) {
          return res.status(400).json({ error: 'Keine Teams vorhanden' });
        }

        // Teams mischen
        const shuffled = [...teams].sort(() => Math.random() - 0.5);

        // 2er-Paare bilden
        const pairs = [];
        for (let i = 0; i < shuffled.length - 1; i += 2) {
          pairs.push([shuffled[i].id, shuffled[i + 1].id]);
        }

        // Falls ungerade Anzahl → letztes Team hat Freilos
        const byeTeam = shuffled.length % 2 === 1 ? shuffled[shuffled.length - 1] : null;

        db.run(`BEGIN IMMEDIATE`, async (beginErr) => {
          if (beginErr) {
            return res.status(500).json({ error: 'Transaktion fehlgeschlagen: ' + beginErr.message });
          }

          try {
            // Alte Matches löschen
            await new Promise((resolve, reject) => {
              db.run(`DELETE FROM matches WHERE mode='festival'`, [], (e) => e ? reject(e) : resolve());
            });

            // Neue Matches einfügen
            for (let i = 0; i < pairs.length; i++) {
              const [teamA, teamB] = pairs[i];
              const field = (i % fieldCount) + 1;

              await new Promise((resolve, reject) => {
                db.run(
                  `
                  INSERT INTO matches
                    (teamA, teamB, field, scoreA, scoreB, winner, plannedStart, mode)
                  VALUES (?, ?, ?, 0, 0, NULL, NULL, 'festival')
                  `,
                  [teamA, teamB, field],
                  (e) => e ? reject(e) : resolve()
                );
              });
            }

            await new Promise((resolve) => db.run(`COMMIT`, resolve));

            // Logging + Snapshot
            try {
              await appendOp(db, 'festival:matches:generate', { fieldCount, pairs });
              await makeSnapshot(db);
            } catch {}

            ioF.emit('festival:matches:updated');

            res.json({
              ok: true,
              created: pairs.length,
              byeTeam: byeTeam ? { id: byeTeam.id, name: byeTeam.name } : null
            });

          } catch (innerErr) {
            db.run(`ROLLBACK`, () => {
              res.status(500).json({ error: innerErr.message });
            });
          }
        });
      }
    );
  });

  // ---------------------------------------------------------------------------
  // POST /api/festival/matches/winner
  // Sieger setzen (wie bei 3v3, aber ohne Runden).
  //
  // Body:
  //   { matchId, winner }
  // ---------------------------------------------------------------------------
  router.post('/winner', (req, res) => {
    const matchId = Number(req.body?.matchId);
    const winner = Number(req.body?.winner);

    if (!Number.isFinite(matchId) || !Number.isFinite(winner)) {
      return res.status(400).json({ error: 'Ungültige Daten' });
    }

    db.get(
      `SELECT id, teamA, teamB FROM matches WHERE id=? AND mode='festival'`,
      [matchId],
      (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Match nicht gefunden' });

        if (![row.teamA, row.teamB].includes(winner)) {
          return res.status(400).json({ error: 'Winner gehört nicht zu Team A/B' });
        }

        db.run(`BEGIN IMMEDIATE`, (beginErr) => {
          if (beginErr) {
            return res.status(500).json({ error: 'Transaktion fehlgeschlagen: ' + beginErr.message });
          }

          db.run(
            `UPDATE matches SET winner=? WHERE id=? AND mode='festival'`,
            [winner, matchId],
            async (updErr) => {
              if (updErr) {
                return db.run(`ROLLBACK`, () =>
                  res.status(500).json({ error: updErr.message })
                );
              }

              try {
                await appendOp(db, 'festival:results:winner', { matchId, winner });
                await makeSnapshot(db);
              } catch {}

              db.run(`COMMIT`, () => {
                ioF.emit('festival:matches:updated');
                res.json({ ok: true, matchId, winner });
              });
            }
          );
        });
      }
    );
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/festival/matches
  // Alle Festival-Matches löschen.
  // ---------------------------------------------------------------------------
  router.delete('/', (req, res) => {
    db.run(
      `DELETE FROM matches WHERE mode='festival'`,
      [],
      async function (err) {
        if (err) return res.status(500).json({ error: err.message });

        try {
          await appendOp(db, 'festival:matches:delAll', {});
          await makeSnapshot(db);
        } catch {}

        ioF.emit('festival:matches:updated');

        res.json({ ok: true, deletedAll: true });
      }
    );
  });

  return router;
};
