// server/routes/minis5/generator.js

/**
 * Erzeugt alle Paarungen für 6 Teams (Jeder-gegen-Jeden)
 * Ergebnis: 15 Spiele
 */
function generateRoundRobin(teamIds) {
  const games = [];
  for (let i = 0; i < teamIds.length; i++) {
    for (let j = i + 1; j < teamIds.length; j++) {
      games.push([teamIds[i], teamIds[j]]);
    }
  }
  return games;
}

/**
 * Addiert Minuten zu einer HH:MM Zeit
 */
function addMinutesHHMM(hhmm, minutes) {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Interleaving:
 * 3 Spiele Gruppe A → 3 Spiele Gruppe B → 3 Spiele Gruppe A → ...
 * bis alle 15 Spiele pro Gruppe verbraucht sind.
 *
 * gamesA / gamesB: Arrays von Paarungen (z.B. [ [1,2], [3,4], ... ])
 *
 * Rückgabe:
 * [
 *   { group:'A', pair:[teamA,teamB] },
 *   { group:'A', pair:[teamA,teamB] },
 *   { group:'A', pair:[teamA,teamB] },
 *   { group:'B', pair:[teamA,teamB] },
 *   ...
 * ]
 */
function interleaveGroups(gamesA, gamesB) {
  const chunkSize = 3;
  const result = [];
  let idxA = 0;
  let idxB = 0;

  while (idxA < gamesA.length || idxB < gamesB.length) {
    // 3 Spiele A
    for (let i = 0; i < chunkSize && idxA < gamesA.length; i++, idxA++) {
      result.push({ group: 'A', pair: gamesA[idxA] });
    }
    // 3 Spiele B
    for (let i = 0; i < chunkSize && idxB < gamesB.length; i++, idxB++) {
      result.push({ group: 'B', pair: gamesB[idxB] });
    }
  }

  return result;
}

/**
 * Weist Felder & Zeiten zu:
 * - 2 Felder parallel
 * - Slot 0: Spiele 0+1
 * - Slot 1: Spiele 2+3
 * - usw.
 *
 * gamesInterleaved: [{ group:'A'|'B', pair:[teamA,teamB] }, ...]
 */
function assignFieldsAndTimesInterleaved(gamesInterleaved, schedule) {
  const dur = Number(schedule.dur);
  const brk = Number(schedule.brk);
  const slotLen = dur + brk;
  const baseTime = schedule.timeHHMM;

  const result = [];
  let slot = 0;

  for (let i = 0; i < gamesInterleaved.length; i += 2) {
    const g1 = gamesInterleaved[i];
    const g2 = gamesInterleaved[i + 1] || null;

    const plannedStart = addMinutesHHMM(baseTime, slot * slotLen);

    // Feld 1
    result.push({
      group: g1.group,
      teamA: g1.pair[0],
      teamB: g1.pair[1],
      field: 1,
      plannedStart
    });

    // Feld 2 (falls vorhanden)
    if (g2) {
      result.push({
        group: g2.group,
        teamA: g2.pair[0],
        teamB: g2.pair[1],
        field: 2,
        plannedStart
      });
    }

    slot++;
  }

  return result;
}

module.exports = {
  generateRoundRobin,
  interleaveGroups,
  assignFieldsAndTimesInterleaved
};
