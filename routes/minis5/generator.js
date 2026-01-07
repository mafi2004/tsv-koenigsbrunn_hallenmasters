// server/routes/minis5/generator.js

/* -------------------------------------------------------
   Zeit-Helfer
------------------------------------------------------- */
function addMinutes(hhmm, minutes) {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/* -------------------------------------------------------
   Round Robin für 6 Teams (korrekt)
   Ergebnis: 5 Runden, je 3 Spiele
------------------------------------------------------- */
function roundRobin6(teams) {
  const rounds = [];
  const t = [...teams];

  for (let r = 0; r < 5; r++) {
    rounds.push([
      [t[0], t[5]],
      [t[1], t[4]],
      [t[2], t[3]]
    ]);

    // Rotation
    const last = t.pop();
    t.splice(1, 0, last);
  }

  return rounds;
}

/* -------------------------------------------------------
   3 Spiele auf 2 Felder verteilen
   Schema:
   - Spiel 1 → Feld 1
   - Spiel 2 → Feld 2
   - Spiel 3 → Feld 1 (nächster Slot)
------------------------------------------------------- */
function schedule3GamesOn2Fields(games, startTime, dur, brk) {
  const result = [];
  let time = startTime;

  // Spiel 1 → Feld 1
  result.push({
    teamA: games[0][0],
    teamB: games[0][1],
    field: 1,
    plannedStart: time
  });

  // Spiel 2 → Feld 2
  result.push({
    teamA: games[1][0],
    teamB: games[1][1],
    field: 2,
    plannedStart: time
  });

  // Spiel 3 → Feld 1 im nächsten Slot
  time = addMinutes(time, dur + brk);

  result.push({
    teamA: games[2][0],
    teamB: games[2][1],
    field: 1,
    plannedStart: time
  });

  // Rückgabe + nächste Startzeit
  return {
    matches: result,
    nextTime: addMinutes(time, dur + brk)
  };
}

/* -------------------------------------------------------
   A und B abwechselnd planen
   Reihenfolge:
   A1 → B1 → A2 → B2 → A3 → B3 → A4 → B4 → A5 → B5
------------------------------------------------------- */
function scheduleAB(roundsA, roundsB, schedule) {
  let time = schedule.timeHHMM;
  const dur = Number(schedule.dur);
  const brk = Number(schedule.brk);

  const all = [];

  for (let i = 0; i < 5; i++) {

    // -------------------------
    // GRUPPE A — Slot 1
    // -------------------------
    all.push({
      teamA: roundsA[i][0][0],
      teamB: roundsA[i][0][1],
      field: 1,
      group: 'A',
      plannedStart: time
    });

    all.push({
      teamA: roundsA[i][1][0],
      teamB: roundsA[i][1][1],
      field: 2,
      group: 'A',
      plannedStart: time
    });

    // Slot 2
    const slot2 = addMinutes(time, dur + brk);

    all.push({
      teamA: roundsA[i][2][0],
      teamB: roundsA[i][2][1],
      field: 1,
      group: 'A',
      plannedStart: slot2
    });

    // -------------------------
    // GRUPPE B — Slot 2 (parallel zu A3)
    // -------------------------
    all.push({
      teamA: roundsB[i][0][0],
      teamB: roundsB[i][0][1],
      field: 2,
      group: 'B',
      plannedStart: slot2
    });

    // -------------------------
    // GRUPPE B — Slot 3
    // -------------------------
    const slot3 = addMinutes(slot2, dur + brk);

    all.push({
      teamA: roundsB[i][1][0],
      teamB: roundsB[i][1][1],
      field: 1,
      group: 'B',
      plannedStart: slot3
    });

    all.push({
      teamA: roundsB[i][2][0],
      teamB: roundsB[i][2][1],
      field: 2,
      group: 'B',
      plannedStart: slot3
    });

    // Nächste Runde beginnt nach Slot 3
    time = addMinutes(slot3, dur + brk);
  }

  return all;
}

/* -------------------------------------------------------
   Exportierte Hauptfunktion
------------------------------------------------------- */
function generateScheduleForGroups(groupA, groupB, schedule) {
  const roundsA = roundRobin6(groupA);
  const roundsB = roundRobin6(groupB);

  return scheduleAB(roundsA, roundsB, schedule);
}

module.exports = {
  addMinutes,
  roundRobin6,
  schedule3GamesOn2Fields,
  scheduleAB,
  generateScheduleForGroups
};
