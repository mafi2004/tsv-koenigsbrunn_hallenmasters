// server/routes/schedule.js
// -----------------------------------------------------------------------------
// Diese Datei recalculated den kompletten Zeitplan für alle aktiven Gruppen.
//
// Hauptaufgaben:
// - POST /api/schedule/recalculate
// - Berechnet plannedStart für ALLE Matches neu
// - Basierend auf:
//     * globaler Startzeit (timeHHMM)
//     * Spieldauer (dur)
//     * Pause (brk)
//     * alphabetischer Gruppenliste
//     * aktueller Runde jeder Gruppe (group_state)
// - Nutzt eine Transaktion für atomare Updates
// - Erzeugt Admin-Log + Snapshot
// - Sendet Live-Events an Admin-UI und Viewer
//
// Diese Datei ist wichtig, wenn der Admin den Zeitplan ändert oder
// das Turnier neu synchronisiert werden muss.
// -----------------------------------------------------------------------------

const express = require('express');
const db = require('../db');
const { appendOp, makeSnapshot } = require('../utils/recovery');

module.exports = (io3) => {
  const router = express.Router();

  // ---------------------------------------------------------------------------
  // addMinutesHHMM(hhmm, minutes)
  // Hilfsfunktion: Addiert Minuten zu einer HH:MM-Zeit (24h-Format).
  // ---------------------------------------------------------------------------
  function addMinutesHHMM(hhmm, minutes) {
    const [h, m] = String(hhmm).split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
    const DAY = 24 * 60;
    let total = (h * 60 + m + minutes) % DAY;
    if (total < 0) total += DAY;
    const nh = Math.floor(total / 60), nm = total % 60;
    return String(nh).padStart(2, '0') + ':' + String(nm).padStart(2, '0');
  }

  /**
   * POST /api/schedule/recalculate
   * Body: { schedule: { timeHHMM, dur, brk } }
   *
   * Effekt:
   * - Berechnet plannedStart für ALLE aktiven Gruppen neu.
   * - Formel:
   *     slotIndex = (lastRound - 1) * groups.length + groupIndex
   *     plannedStart = base + slotIndex * slotLen
   *
   * Ablauf:
   * 1) Schedule validieren
   * 2) Alphabetische Gruppenliste aus TEAMS
   * 3) Aktive Gruppen aus MATCHES
   * 4) lastRound jeder Gruppe aus group_state
   * 5) Transaktion:
   *      - UPDATE matches SET plannedStart = ?
   * 6) Snapshot + Admin-Log
   * 7) Live-Event senden
   */
  router.post('/recalculate', (req, res) => {
    const schedule = req.body?.schedule || {};
    const base = schedule.timeHHMM;
    const dur = Number(schedule.dur);
    const brk = Number(schedule.brk);

    // --- Validierung ---
    if (!base || !/^\d{2}:\d{2}$/.test(base)) {
      return res.status(400).json({ error: 'Ungültige Startzeit timeHHMM (HH:MM) im Schedule' });
    }
    if (!Number.isFinite(dur) || dur <= 0 || !Number.isFinite(brk) || brk < 0) {
      return res.status(400).json({ error: 'Ungültige Dauer/Pause im Schedule' });
    }

    const slotLen = dur + brk;

    // 1) Alphabetische Gruppenliste
    db.all(
      `SELECT DISTINCT UPPER(TRIM(groupName)) AS g
       FROM teams
       WHERE groupName IS NOT NULL AND TRIM(groupName) <> ''
       ORDER BY g ASC`,
      [],
      (eG, rowsG) => {
        if (eG) return res.status(500).json({ error: eG.message });

        const groups = rowsG.map(x => x.g);
        if (!groups.length) {
          return res.status(200).json({ success: true, info: 'Keine Gruppen gefunden, nichts zu tun.' });
        }

        // 2) aktive Gruppen aus matches
        db.all(`SELECT DISTINCT UPPER(groupName) AS g FROM matches`, [], (eM, rowsM) => {
          if (eM) return res.status(500).json({ error: eM.message });

          const activeGroups = rowsM.map(x => x.g);
          if (!activeGroups.length) {
            return res.status(200).json({ success: true, info: 'Keine aktiven Matches, nichts zu tun.' });
          }

          // 3) Runde je aktiver Gruppe
          db.all(`SELECT groupName, lastRound FROM group_state`, [], (eS, rowsS) => {
            if (eS) return res.status(500).json({ error: eS.message });

            const state = new Map(
              rowsS.map(r => [String(r.groupName).toUpperCase(), Number(r.lastRound || 1)])
            );

            // --- Transaktion ---
            db.run(`BEGIN IMMEDIATE`, (eBegin) => {
              if (eBegin) {
                return res.status(500).json({ error: 'Konnte Transaktion nicht starten: ' + eBegin.message });
              }

              let hadErr = false;
              let updated = 0;

              // 4) Für jede aktive Gruppe plannedStart neu berechnen
              for (const g of activeGroups) {
                const idx = groups.indexOf(g);
                if (idx < 0) continue;

                const lastRound = state.get(g) || 1;
                const slotIndex = (lastRound - 1) * (groups.length) + idx;
                const planned = addMinutesHHMM(base, slotIndex * slotLen);

                db.run(
                  `UPDATE matches SET plannedStart = ? WHERE UPPER(groupName) = ? AND mode='3v3'`,
                  [planned, g],
                  function (eU) {
                    if (eU && !hadErr) {
                      hadErr = true;
                      return db.run(`ROLLBACK`, () =>
                        res.status(500).json({ error: 'Update fehlgeschlagen: ' + eU.message })
                      );
                    }
                    updated += this.changes || 0;
                  }
                );
              }

              // 5) COMMIT
              if (!hadErr) {
                db.run(`COMMIT`, async (eCommit) => {
                  if (eCommit) {
                    return res.status(500).json({ error: 'Commit fehlgeschlagen: ' + eCommit.message });
                  }

                  // Log + Snapshot
                  try {
                    await appendOp(db, 'schedule:recalc', { schedule });
                    await makeSnapshot(db);
                  } catch {}

                  // Live-Event
                  req.app.get('io3')?.emit?.('resultUpdate', { type: 'schedule:recalculated' });

                  res.json({ success: true, updated });
                });
              }
            });
          });
        });
      }
    );
  });

  return router;
};
