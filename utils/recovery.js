// server/utils/recovery.js
// -----------------------------------------------------------------------------
// Diese Datei stellt alle Funktionen bereit, die für das Recovery-System
// des Turniers verantwortlich sind.
//
// Hauptaufgaben:
// - appendOp:   Admin-Operationen in admin_ops protokollieren
// - makeSnapshot: vollständigen Snapshot der DB erzeugen (teams, matches, group_state)
// - restoreFromSnapshot: Snapshot wiederherstellen (atomar, mit Transaktion)
// - SNAP_DIR: Speicherort aller Snapshots
//
// Snapshots werden als JSON-Dateien abgelegt und enthalten alle relevanten
// Turnierdaten, um den Zustand exakt wiederherstellen zu können.
// -----------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

const SNAP_DIR = path.join(process.cwd(), 'logs', 'snapshots');

// ---------------------------------------------------------------------------
// ensureDir(path)
// Legt ein Verzeichnis rekursiv an, falls es nicht existiert.
// ---------------------------------------------------------------------------
function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

// ---------------------------------------------------------------------------
// appendOp(db, op, payloadObj)
// Protokolliert eine Admin-Operation in admin_ops.
//
// Parameter:
// - op: Name der Operation (z. B. "team:add", "funino:reset")
// - payloadObj: beliebige Zusatzdaten (werden als JSON gespeichert)
//
// Rückgabe: Promise mit lastID des Eintrags
// ---------------------------------------------------------------------------
function appendOp(db, op, payloadObj) {
  return new Promise((resolve, reject) => {
    const ts = new Date().toISOString();
    const payload = JSON.stringify(payloadObj || {});
    db.run(
      `INSERT INTO admin_ops (ts, op, payload, status)
       VALUES (?, ?, ?, 'COMMITTED')`,
      [ts, op, payload],
      function (err) {
        if (err) return reject(err);
        resolve(this.lastID);
      }
    );
  });
}

// ---------------------------------------------------------------------------
// makeSnapshot(db)
// Erzeugt einen vollständigen Snapshot der Turnierdaten.
//
// Snapshot enthält:
// - teams
// - matches
// - group_state
//
// Ablauf:
// 1) Snapshot-Verzeichnis sicherstellen
// 2) Daten aus DB lesen
// 3) JSON-Datei schreiben
// 4) Eintrag in admin_snapshots erzeugen
//
// Rückgabe: { path, ts }
// ---------------------------------------------------------------------------
async function makeSnapshot(db) {
  ensureDir(SNAP_DIR);

  const tsIso = new Date().toISOString();
  const safeTs = tsIso.replace(/[:.]/g, '-');
  const filePath = path.join(SNAP_DIR, `snapshot-${safeTs}.json`);

  const readAll = (sql) =>
    new Promise((resolve, reject) =>
      db.all(sql, [], (err, rows) => (err ? reject(err) : resolve(rows)))
    );

  const data = {
    ts: tsIso,
    teams:       await readAll(`SELECT * FROM teams ORDER BY id ASC`),
    matches:     await readAll(`SELECT * FROM matches ORDER BY id ASC`),
    group_state: await readAll(`SELECT * FROM group_state ORDER BY groupName ASC`)
  };

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');

  await new Promise((resolve, reject) =>
    db.run(
      `INSERT INTO admin_snapshots (ts, path) VALUES (?, ?)`,
      [tsIso, filePath],
      function (err) {
        if (err) return reject(err);
        resolve(this.lastID);
      }
    )
  );

  return { path: filePath, ts: tsIso };
}

// ---------------------------------------------------------------------------
// restoreFromSnapshot(db, snapPath)
// Stellt einen Snapshot vollständig wieder her.
//
// Ablauf (atomar):
// 1) BEGIN IMMEDIATE
// 2) Tabellen löschen: teams, matches, group_state
// 3) Daten aus Snapshot einfügen (mit festen IDs!)
// 4) COMMIT
//
// Bei Fehler: ROLLBACK
// ---------------------------------------------------------------------------
async function restoreFromSnapshot(db, snapPath) {
  const raw = fs.readFileSync(snapPath, 'utf8');
  const data = JSON.parse(raw);

  const begin    = () => new Promise((resolve, reject) => db.run(`BEGIN IMMEDIATE`, (err) => (err ? reject(err) : resolve())));
  const run      = (sql, params=[]) => new Promise((resolve, reject) => db.run(sql, params, (err) => (err ? reject(err) : resolve())));
  const commit   = () => new Promise((resolve, reject) => db.run(`COMMIT`, (err) => (err ? reject(err) : resolve())));
  const rollback = () => new Promise((resolve, reject) => db.run(`ROLLBACK`, (err) => (err ? reject(err) : resolve())));

  await begin();
  try {
    // Tabellen leeren
    await run(`DELETE FROM teams`);
    await run(`DELETE FROM matches`);
    await run(`DELETE FROM group_state`);

    // Teams wiederherstellen
    for (const t of data.teams || []) {
      await run(
        `INSERT INTO teams (id, name, groupName, mode)
         VALUES (?, ?, ?, ?)`,
        [t.id, t.name, t.groupName, t.mode]
      );
    }

    // Matches wiederherstellen
    for (const m of data.matches || []) {
      await run(
        `INSERT INTO matches
           (id, teamA, teamB, groupName, round, field,
            scoreA, scoreB, winner, plannedStart, mode)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          m.id, m.teamA, m.teamB, m.groupName, m.round, m.field,
          m.scoreA, m.scoreB, m.winner, m.plannedStart, m.mode
        ]
      );
    }

    // group_state wiederherstellen
    for (const s of data.group_state || []) {
      await run(
        `INSERT INTO group_state (groupName, lastRound)
         VALUES (?, ?)`,
        [s.groupName, s.lastRound]
      );
    }

    await commit();
  } catch (e) {
    await rollback();
    throw e;
  }
}

module.exports = { appendOp, makeSnapshot, restoreFromSnapshot, SNAP_DIR };
