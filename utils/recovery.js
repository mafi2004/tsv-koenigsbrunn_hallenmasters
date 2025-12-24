
// server/utils/recovery.js
const fs = require('fs');
const path = require('path');

const SNAP_DIR = path.join(process.cwd(), 'logs', 'snapshots');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function appendOp(db, op, payloadObj) {
  return new Promise((resolve, reject) => {
    const ts = new Date().toISOString();
    const payload = JSON.stringify(payloadObj || {});
    db.run(
      `INSERT INTO admin_ops (ts, op, payload, status) VALUES (?, ?, ?, 'COMMITTED')`,
      [ts, op, payload],
      function (err) {
        if (err) return reject(err);
        resolve(this.lastID);
      }
    );
  });
}

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

async function restoreFromSnapshot(db, snapPath) {
  const raw = fs.readFileSync(snapPath, 'utf8');
  const data = JSON.parse(raw);

  const begin   = () => new Promise((resolve, reject) => db.run(`BEGIN IMMEDIATE`, (err) => (err ? reject(err) : resolve())));
  const run     = (sql, params=[]) => new Promise((resolve, reject) => db.run(sql, params, (err) => (err ? reject(err) : resolve())));
  const commit  = () => new Promise((resolve, reject) => db.run(`COMMIT`, (err) => (err ? reject(err) : resolve())));
  const rollback= () => new Promise((resolve, reject) => db.run(`ROLLBACK`, (err) => (err ? reject(err) : resolve())));

  await begin();
  try {
    await run(`DELETE FROM teams`);
    await run(`DELETE FROM matches`);
    await run(`DELETE FROM group_state`);

    // Teams mit festen IDs wiederherstellen
    for (const t of data.teams || []) {
      await run(
        `INSERT INTO teams (id, name, groupName) VALUES (?, ?, ?)`,
        [t.id, t.name, t.groupName]
      );
    }

    // Matches mit festen IDs wiederherstellen
    for (const m of data.matches || []) {
      await run(
        `INSERT INTO matches (id, teamA, teamB, groupName, round, field, scoreA, scoreB, winner, plannedStart)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [m.id, m.teamA, m.teamB, m.groupName, m.round, m.field, m.scoreA, m.scoreB, m.winner, m.plannedStart]
      );
    }

    // group_state wiederherstellen
    for (const s of data.group_state || []) {
      await run(
        `INSERT INTO group_state (groupName, lastRound) VALUES (?, ?)`,
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
