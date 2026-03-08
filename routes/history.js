// server/routes/history.js
// -----------------------------------------------------------------------------
// Diese Datei stellt API‑Routen für die Match‑History bereit.
//
// Hauptaufgaben:
// - Abrufen des zuletzt archivierten 3er‑Blocks einer Gruppe
// - Korrigieren eines Siegers in der History (Audit‑Log + Live‑Event)
// - Anzeigen einer Übersicht aller History‑Batches
// - Schreiben eines lokalen Admin‑Logs (admin.log)
// - Senden von Live‑Events an Admin‑UI und Viewer
//
// Die History ist ein zentrales Element der Turnier‑Recovery:
// Jede Runde wird archiviert, bevor sie überschrieben wird.
// Dadurch können Fehler korrigiert oder Runden wiederhergestellt werden.
// -----------------------------------------------------------------------------

const express = require('express');
const db = require('../db');
const fs = require('fs');
const path = require('path');

module.exports = (io3) => {
  const router = express.Router();

  // ---------------------------------------------------------------------------
  // Logging: admin.log
  // logLine(text)
  // Schreibt eine Zeile in logs/admin.log (wird automatisch angelegt).
  // Wird genutzt, wenn ein History‑Eintrag korrigiert wird.
  // ---------------------------------------------------------------------------
  const LOG_DIR = path.join(process.cwd(), 'logs');
  const LOG_FILE = path.join(LOG_DIR, 'admin.log');

  function logLine(line) {
    try {
      if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
      fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
    } catch {}
  }

  // ---------------------------------------------------------------------------
  // GET /api/history/latest/:group
  // Liefert den zuletzt archivierten 3er‑Block einer Gruppe.
  //
  // Ablauf:
  // 1) Neueste batchId der Gruppe bestimmen
  // 2) Alle History‑Einträge dieses Batches laden
  // 3) Teamnamen via LEFT JOIN ergänzen
  //
  // Rückgabe:
  //   { groupName, round, batchId, items: [...] }
  // ---------------------------------------------------------------------------
  router.get('/latest/:group', (req, res) => {
    const groupName = String(req.params.group || '').trim().toUpperCase();
    if (!groupName) return res.status(400).json({ error: 'group fehlt' });

    const sqlBatch = `
      SELECT batchId, MAX(archivedAt) AS ts, round
      FROM match_history
      WHERE UPPER(groupName) = ?
      GROUP BY batchId, round
      ORDER BY ts DESC
      LIMIT 1
    `;

    db.get(sqlBatch, [groupName], (eB, bRow) => {
      if (eB) return res.status(500).json({ error: eB.message });
      if (!bRow?.batchId) return res.json({ groupName, items: [] });

      const sqlItems = `
        SELECT h.id, h.batchId, h.groupName, h.round, h.field,
               h.teamA, h.teamB, h.winner, h.scoreA, h.scoreB,
               h.plannedStart, h.originalMatchId, h.archivedAt,
               t1.name AS teamA_name, t2.name AS teamB_name
        FROM match_history h
        LEFT JOIN teams t1 ON t1.id = h.teamA
        LEFT JOIN teams t2 ON t2.id = h.teamB
        WHERE h.batchId = ?
        ORDER BY h.field ASC
      `;

      db.all(sqlItems, [bRow.batchId], (eI, items) => {
        if (eI) return res.status(500).json({ error: eI.message });
        res.json({
          groupName,
          round: bRow.round,
          batchId: bRow.batchId,
          items: items || []
        });
      });
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH /api/history/:id/winner
  // Korrigiert den Sieger eines History‑Eintrags.
  //
  // Ablauf:
  // 1) History‑Eintrag laden
  // 2) Prüfen, ob winner zu Team A/B gehört
  // 3) Update durchführen
  // 4) Live‑Event senden
  // 5) Änderung in admin.log protokollieren
  //
  // Rückgabe:
  //   { ok: true, id, winner, groupName, round, field }
  // ---------------------------------------------------------------------------
  router.patch('/:id/winner', (req, res) => {
    const id = Number(req.params.id);
    const winner = Number(req.body?.winner);

    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Ungültige History-ID' });
    if (!Number.isFinite(winner)) return res.status(400).json({ error: 'Ungültiger winner' });

    db.get(`SELECT * FROM match_history WHERE id = ?`, [id], (eS, row) => {
      if (eS) return res.status(500).json({ error: eS.message });
      if (!row) return res.status(404).json({ error: 'History-Eintrag nicht gefunden' });

      const before = row.winner;

      // Validierung: Gewinner muss Team A oder Team B sein
      if (![Number(row.teamA), Number(row.teamB)].includes(winner)) {
        return res.status(400).json({ error: 'winner gehört nicht zu Team A/B dieses Matches' });
      }

      db.run(`UPDATE match_history SET winner = ? WHERE id = ?`, [winner, id], function (eU) {
        if (eU) return res.status(500).json({ error: eU.message });

        // Live‑Event
        io3.emit('history:updated', { id, winner });

        // Audit‑Log
        logLine(
          `[${new Date().toISOString()}] HISTORY_UPDATE id=${id} group=${row.groupName} round=${row.round} field=${row.field} before=${before} after=${winner}`
        );

        res.json({
          ok: true,
          id,
          winner,
          groupName: row.groupName,
          round: row.round,
          field: row.field
        });
      });
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/history/batches?group=A
  // Liefert eine kompakte Übersicht der letzten 50 History‑Batches.
  //
  // Optionaler Parameter:
  //   group=A → nur Batches dieser Gruppe
  //
  // Rückgabe:
  //   Array von { batchId, groupName, round, cnt, archivedAt }
  // ---------------------------------------------------------------------------
  router.get('/batches', (req, res) => {
    const groupName = String(req.query.group || '').trim().toUpperCase();
    const params = [];
    let where = '';

    if (groupName) {
      where = 'WHERE UPPER(groupName) = ?';
      params.push(groupName);
    }

    const sql = `
      SELECT batchId, groupName, round,
             COUNT(*) AS cnt,
             MAX(archivedAt) AS archivedAt
      FROM match_history
      ${where}
      GROUP BY batchId, groupName, round
      ORDER BY archivedAt DESC
      LIMIT 50
    `;

    db.all(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    });
  });

  return router;
};
