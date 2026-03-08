/* viewer.js – Öffentliche Zuschaueransicht für den 3v3‑Modus
-------------------------------------------------------------------------------
Diese Datei enthält die komplette Viewer‑Logik für das Hallenmasters.

Hauptaufgaben:
- Laden und Anzeigen des Vereinslogos
- Laden des Hallenlayouts (normal / gespiegelt)
- Live‑Status (verbunden / getrennt)
- Live‑Zuschauerzähler
- Tabellenansicht (Spielplan)
- Kachelansicht (Spielfeldbelegung)
- Hallenlayout mit Team‑Overlays
- Regel‑Erkennung (A/B/C nach Runde 4, D/E/F nach Runde 7)
- Sortierung nach Zeit / Feld
- Spiegelmodus für LED‑Wände

Die Datei wird von viewer.html eingebunden und kommuniziert über Socket.io.
------------------------------------------------------------------------------- */

let MIRROR_MODE = false; 


/* ============================================================================
   ASSETS – LOGO & HALLENBILD
============================================================================ */

/** Pfade für Hallenlayout (normal / gespiegelt) */
var HALL_IMG_PATH = '/assets/bg_hallenmasters_Gym.jpg';
var HALL_IMG_PATH_MIRRORED = '/assets/bg_hallenmasters_Gym_mirrored.jpg';

/** Vereinslogo laden (mit Cache‑Bust) */
(function setLogo() {
  var img = document.getElementById('clubLogo');
  if (!img) return;

  var url = '/assets/Fussballwappen_logo.png?_v=' + Date.now();

  img.onerror = function () {
    img.style.display = 'none';
  };

  img.src = url;
})();

/**
 * Setzt das Hallenlayout-Bild abhängig vom Spiegelmodus.
 * MIRROR_MODE = true  → gespiegelt
 * MIRROR_MODE = false → normal
 */
function setHallImage() {
  const img = document.getElementById('hallImage');
  if (!img) return;

  const base = MIRROR_MODE ? HALL_IMG_PATH_MIRRORED : HALL_IMG_PATH;
  const url = base + '?_v=' + Date.now();

  img.style.display = 'none';

  img.onload = () => {
    img.style.display = 'block';
  };

  img.onerror = () => {
    img.style.display = 'none';
  };

  img.src = url;
}


/* ============================================================================
   HELPERS – CSS‑Klassen, Status, Zeitformat
============================================================================ */

/** CSS‑Klasse für Gruppenfarben */
function groupClass(g) {
  var x = String(g || '').trim().toUpperCase();
  switch (x) {
    case 'A': return 'grpA';
    case 'B': return 'grpB';
    case 'C': return 'grpC';
    case 'D': return 'grpD';
    case 'E': return 'grpE';
    case 'F': return 'grpF';
    default:  return null;
  }
}

/** Klasse sicher hinzufügen */
function addClassSafe(el, cls) {
  if (el && cls) el.classList.add(cls);
}

/** Verbindungsstatus setzen */
function setStatus(ok) {
  var el = document.getElementById('connStatus');
  if (!el) return;

  if (ok) {
    el.textContent = 'Status: verbunden';
    el.className = 'pill ok';
  } else {
    el.textContent = 'Status: getrennt';
    el.className = 'pill err';
  }
}

/** Zeitstempel für "Letztes Update" */
function setLastUpdate() {
  var el = document.getElementById('lastUpdate');
  if (!el) return;

  var now = new Date();
  var hh = String(now.getHours()).padStart(2, '0');
  var mm = String(now.getMinutes()).padStart(2, '0');
  var ss = String(now.getSeconds()).padStart(2, '0');

  el.textContent = 'Letztes Update: ' + hh + ':' + mm + ':' + ss;
  el.className = 'pill ok';
}


/* ============================================================================
   API – REST‑Endpunkte
============================================================================ */

var API_BASE = window.location.origin + '/api';

/** Fetch‑Wrapper mit Fehlerbehandlung */
function safeFetch(path, init) {
  return fetch(API_BASE + path, init).then(function (res) {
    if (!res.ok) {
      return res.text().then(function (txt) {
        throw new Error(
          'HTTP ' + res.status + ' ' + res.statusText +
          (txt ? ': ' + txt : '')
        );
      });
    }
    return res.json();
  });
}

function loadMatches() { return safeFetch('/matches', { method: 'GET' }); }
function loadTeams()   { return safeFetch('/teams',   { method: 'GET' }); }
function loadMeta()    { return safeFetch('/meta',    { method: 'GET' }); }


/* ============================================================================
   SORTIERUNG – nach Zeit, dann Feld, dann ID
============================================================================ */

/** Wandelt HH:MM in Minuten um (für Sortierung) */
function hhmmToNum(hhmm) {
  var m = /^(\d{2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!m) return Number.POSITIVE_INFINITY;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Sortiert Matches nach Zeit → Feld → ID */
function sortMatches(rows) {
  return []
    .concat(rows || [])
    .sort(function (a, b) {
      var ta = hhmmToNum(a && a.plannedStart);
      var tb = hhmmToNum(b && b.plannedStart);
      if (ta !== tb) return ta - tb;

      var fa = Number(a && a.field || 0);
      var fb = Number(b && b.field || 0);
      if (fa !== fb) return fa - fb;

      return Number(a && a.id || 0) - Number(b && b.id || 0);
    });
}


/* ============================================================================
   REGEL-ERKENNUNG
   - A/B/C sind nach Runde 4 abgeschlossen
   - D/E/F sind nach Runde 7 abgeschlossen
============================================================================ */

/** Prüft, welche Gruppen ihre letzte Runde erreicht haben */
function computeCompletedByRules(rows) {
  var seen = { A:false, B:false, C:false, D:false, E:false, F:false };

  (rows || []).forEach(function (m) {
    var g = String(m.groupName || '').trim().toUpperCase();
    var r = Number(m.round || 0);

    if ((g === 'A' || g === 'B' || g === 'C') && r === 4) seen[g] = true;
    if ((g === 'D' || g === 'E' || g === 'F') && r === 7) seen[g] = true;
  });

  return seen;
}

function isABC(g) { return g === 'A' || g === 'B' || g === 'C'; }
function isDEF(g) { return g === 'D' || g === 'E' || g === 'F'; }


/* ============================================================================
   SPIEGELMODUS – für LED‑Wände / Projektoren
============================================================================ */
function toggleMirror() {
  MIRROR_MODE = document.getElementById("mirrorView").checked;
  refresh(); // komplette Ansicht neu rendern
}


/* ============================================================================
   TABELLENANSICHT – Spielplan
============================================================================ */
function renderTable(rows) {
  var tbody = document.querySelector('#matchesTable tbody');
  if (!tbody) return;

  tbody.innerHTML = '';
  rows = sortMatches(rows);

  if (!Array.isArray(rows) || !rows.length) {
    var tr0 = document.createElement('tr');
    var td0 = document.createElement('td');
    td0.colSpan = 7;
    td0.textContent = 'Noch keine Spiele geplant.';
    td0.style.color = '#9ca3af';
    tr0.appendChild(td0);
    tbody.appendChild(tr0);
    return;
  }

  var completed = computeCompletedByRules(rows);

  for (var i = 0; i < rows.length; i++) {
    var m = rows[i];
    var g = String(m.groupName || '').trim().toUpperCase();
    var r = Number(m.round || 0);

    // Abgeschlossene Gruppen nicht anzeigen
    if ((isABC(g) && r === 4) || (isDEF(g) && r === 7)) continue;

    var tr = document.createElement('tr');
    addClassSafe(tr, groupClass(g));

    var id = m?.id ?? '';
    var field = m?.field ?? '';

    var teamAId = (m && (m.teamA_id != null || m.teamA != null))
      ? (m.teamA_id != null ? m.teamA_id : m.teamA)
      : null;

    var teamBId = (m && (m.teamB_id != null || m.teamB != null))
      ? (m.teamB_id != null ? m.teamB_id : m.teamB)
      : null;

    var teamAName =
      (m && m.teamA && typeof m.teamA === 'string' && m.teamA.trim())
        ? m.teamA
        : (teamAId != null ? ('Team #' + teamAId) : '—');

    var teamBName =
      (m && m.teamB && typeof m.teamB === 'string' && m.teamB.trim())
        ? m.teamB
        : (teamBId != null ? ('Team #' + teamBId) : '—');

    var planned = m?.plannedStart || '–';

    var winnerVal =
      (typeof m?.winner !== 'undefined' && m.winner !== null)
        ? Number(m.winner)
        : NaN;

    var hasWinner = !isNaN(winnerVal);

    /* --- Tabellenzellen --- */
    var tdId = document.createElement('td'); tdId.textContent = id;

    var tdGroup = document.createElement('td');
    var badge = document.createElement('span');
    badge.className = 'grpBadge ' + g;
    badge.textContent = g;
    tdGroup.appendChild(badge);

    var tdRound = document.createElement('td'); tdRound.textContent = r;
    var tdField = document.createElement('td'); tdField.textContent = field;
    var tdTime  = document.createElement('td'); tdTime.textContent = planned;

    /* --- Team A --- */
    var tdA = document.createElement('td');
    var wA = document.createElement('span');
    wA.className = hasWinner && Number(winnerVal) === Number(teamAId)
      ? 'winnerText'
      : 'loserText';
    wA.textContent = teamAName;

    if (hasWinner && Number(winnerVal) === Number(teamAId)) {
      var icoA = document.createElement('span');
      icoA.className = 'winIcon';
      icoA.textContent = '🏆';
      icoA.setAttribute('role', 'img');
      icoA.title = 'Sieger';
      tdA.appendChild(icoA);
    }
    tdA.appendChild(wA);

    /* --- Team B --- */
    var tdB = document.createElement('td');
    var wB = document.createElement('span');
    wB.className = hasWinner && Number(winnerVal) === Number(teamBId)
      ? 'winnerText'
      : 'loserText';
    wB.textContent = teamBName;

    if (hasWinner && Number(winnerVal) === Number(teamBId)) {
      var icoB = document.createElement('span');
      icoB.className = 'winIcon';
      icoB.textContent = '🏆';
      icoB.setAttribute('role', 'img');
      icoB.title = 'Sieger';
      tdB.appendChild(icoB);
    }
    tdB.appendChild(wB);

    tr.append(tdId, tdGroup, tdRound, tdField, tdTime, tdA, tdB);
    tbody.appendChild(tr);
  }

  /* --- Hinweisboxen für abgeschlossene Gruppen --- */
  ['A','B','C','D','E','F'].forEach(function (g) {
    if (completed[g]) {
      var tr = document.createElement('tr');
      addClassSafe(tr, groupClass(g));

      var td = document.createElement('td');
      td.colSpan = 7;

      var box = document.createElement('div');
      box.className = 'tableNotice ' + g;

      box.textContent = isABC(g)
        ? ('Spiele Gruppe ' + g + ' beendet, Update des Spielplans erfolgt in Kürze')
        : ('Spiele Gruppe ' + g + ' beendet');

      td.appendChild(box);
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
  });
}


/* ============================================================================
   KACHELANSICHT – Hilfsfunktionen
============================================================================ */

/** Liefert alle Felder (1,2,3) sortiert */
function uniqueSortedFields(rows) {
  var set = {};
  for (var i = 0; i < rows.length; i++) {
    var f = (rows[i] && rows[i].field != null) ? rows[i].field : null;
    if (f != null) set[String(f)] = true;
  }
  var arr = Object.keys(set);
  arr.sort(function (a, b) { return Number(a) - Number(b); });
  return arr.map(Number);
}

/** Liefert alle Zeiten sortiert */
function uniqueSortedTimes(rows) {
  var set = new Set();
  for (var i = 0; i < rows.length; i++) {
    var t = (rows[i] && rows[i].plannedStart) ? rows[i].plannedStart : '–';
    set.add(t);
  }
  var arr = Array.from(set);
  arr.sort(function (a, b) { return hhmmToNum(a) - hhmmToNum(b); });
  return arr;
}

/** Aktualisiert CSS‑Variable für Kopfzeilenhöhe */
function updateTilesHeadHeight() {
  var head = document.getElementById('tilesHeadGlobal');
  if (!head) return;

  var h = Math.ceil(head.getBoundingClientRect().height) || 0;
  document.documentElement.style.setProperty('--tiles-head-h', h + 'px');
}

/** Große Hinweis-Kachel für abgeschlossene Gruppen */
function bigNoticeTile(group) {
  var div = document.createElement('div');
  div.className = 'bigNotice ' + group;

  var title = document.createElement('div');
  title.className = 'bigNoticeTitle';
  title.textContent = 'Spiele Gruppe ' + group + ' beendet';
  div.appendChild(title);

  if (isABC(group)) {
    var hint = document.createElement('div');
    hint.className = 'bigNoticeHint';
    hint.textContent = 'Update des Spielplans erfolgt in Kürze';
    div.appendChild(hint);
  }

  return div;
}

/* ============================================================================
   TILE-NODE – Einzelne Kachel für ein Match
   - Zeigt Gruppe, Runde, Team A/B, Sieger‑Icon
   - Wird in der Kachelansicht (Spielfeldbelegung) verwendet
============================================================================ */
function tileNodeForMatch(m) {
  var grp = String((m && m.groupName) || '').trim().toUpperCase();

  var teamAId = (m && m.teamA_id != null)
    ? Number(m.teamA_id)
    : (m && m.teamA != null ? Number(m.teamA) : NaN);

  var teamBId = (m && m.teamB_id != null)
    ? Number(m.teamB_id)
    : (m && m.teamB != null ? Number(m.teamB) : NaN);

  var winnerVal = (m && typeof m.winner !== 'undefined' && m.winner !== null)
    ? Number(m.winner)
    : NaN;

  /* --- Kachel-Container --- */
  var tile = document.createElement('div');
  addClassSafe(tile, 'tile');
  addClassSafe(tile, groupClass(grp));

  /* --- Kopfbereich (Gruppe + Runde) --- */
  var top = document.createElement('div');
  top.className = 'tileTop';

  var topLeft = document.createElement('div');
  topLeft.className = 'tileTopLeft';

  var tag = document.createElement('span');
  tag.className = 'tileTag';
  tag.textContent = 'Gruppe ' + (grp || '–');
  topLeft.append(tag);

  var topRight = document.createElement('div');
  var roundSpan = document.createElement('span');
  roundSpan.className = 'roundBadge';
  roundSpan.textContent = 'Runde ' + ((m && m.round != null) ? m.round : '-');
  topRight.appendChild(roundSpan);

  top.append(topLeft, topRight);
  tile.appendChild(top);

  /* --- Hauptbereich (Team A / Team B) --- */
  var main = document.createElement('div');
  main.className = 'tileMain';

  /* Team A */
  var aWrap = document.createElement('span');
  aWrap.className = 'teamText';

  var aName = (m && m.teamA && typeof m.teamA === 'string' && m.teamA.trim())
    ? m.teamA
    : (isFinite(teamAId) ? ('Team #' + teamAId) : '—');

  var aTxt = document.createElement('span');
  aTxt.textContent = aName;
  aTxt.className = (!isNaN(winnerVal) && winnerVal === teamAId)
    ? 'winnerText'
    : 'loserText';

  if (!isNaN(winnerVal) && winnerVal === teamAId) {
    var aIco = document.createElement('span');
    aIco.className = 'winIcon';
    aIco.textContent = '🏆';
    aIco.setAttribute('role', 'img');
    aIco.title = 'Sieger';
    aWrap.appendChild(aIco);
  }
  aWrap.appendChild(aTxt);

  /* Team B */
  var bWrap = document.createElement('span');
  bWrap.className = 'teamText';

  var bName = (m && m.teamB && typeof m.teamB === 'string' && m.teamB.trim())
    ? m.teamB
    : (isFinite(teamBId) ? ('Team #' + teamBId) : '—');

  var bTxt = document.createElement('span');
  bTxt.textContent = bName;
  bTxt.className = (!isNaN(winnerVal) && winnerVal === teamBId)
    ? 'winnerText'
    : 'loserText';

  if (!isNaN(winnerVal) && winnerVal === teamBId) {
    var bIco = document.createElement('span');
    bIco.className = 'winIcon';
    bIco.textContent = '🏆';
    bIco.setAttribute('role', 'img');
    bIco.title = 'Sieger';
    bWrap.appendChild(bIco);
  }
  bWrap.appendChild(bTxt);

  main.append(aWrap, bWrap);
  tile.appendChild(main);

  return tile;
}


/* ============================================================================
   TILE-RENDERING – Komplette Kachelansicht (Spielfeldbelegung)
============================================================================ */
function renderTiles(rows) {
  var head = document.getElementById('tilesHeadGlobal');
  var cont = document.getElementById('tilesContainer');
  var empty = document.getElementById('tilesEmpty');
  if (!head || !cont || !empty) return;

  head.innerHTML = '';
  cont.innerHTML = '';

  var all = Array.isArray(rows) ? sortMatches(rows) : [];

  /* --- Keine Spiele vorhanden --- */
  if (!all.length) {
    empty.style.display = 'block';
    updateTilesHeadHeight();
    return;
  }
  empty.style.display = 'none';

  var completed = computeCompletedByRules(all);

  /* --- Nur aktive Spiele anzeigen (abgeschlossene Gruppen ausblenden) --- */
  var activeRows = all.filter(function (m) {
    var g = String(m.groupName || '').trim().toUpperCase();
    var r = Number(m.round || 0);
    if (isABC(g) && r === 4) return false;
    if (isDEF(g) && r === 7) return false;
    return true;
  });

  /* --- Felder bestimmen --- */
  var fields = uniqueSortedFields(activeRows.length ? activeRows : all);
  if (!fields.length) fields = [1, 2, 3];

  head.style.gridTemplateColumns =
    'repeat(' + fields.length + ', minmax(260px, 1fr))';

  /* --- Feld-Header erzeugen --- */
  for (var h = 0; h < fields.length; h++) {
    var fieldNo = fields[h];

    // Spiegelmodus: Feld 1 ↔ 3 tauschen
    if (MIRROR_MODE) {
      if (fieldNo === 1) fieldNo = 3;
      else if (fieldNo === 3) fieldNo = 1;
    }

    var fh = document.createElement('div');
    fh.className = 'fieldHead';

    var fb = document.createElement('span');
    fb.className = 'fieldHeadBadge';
    fb.textContent = 'Feld ' + fieldNo;

    fh.appendChild(fb);
    head.appendChild(fh);
  }

  /* --- Zeiten bestimmen --- */
  var times = uniqueSortedTimes(activeRows.length ? activeRows : all);
  if (!times.length) times = ['–'];

  /* --- Zeilen pro Zeit-Slot --- */
  for (var ti = 0; ti < times.length; ti++) {
    var timeKey = times[ti];

    var slot = document.createElement('div');
    slot.className = 'slotRow';

    /* Zeitspalte */
    var timeCol = document.createElement('div');
    timeCol.className = 'slotTime';

    var timeBadge = document.createElement('span');
    timeBadge.className = 'timeBadge';
    timeBadge.textContent = timeKey;

    timeCol.appendChild(timeBadge);

    /* Grid für Felder */
    var grid = document.createElement('div');
    grid.className = 'tilesGrid';
    grid.style.gridTemplateColumns =
      'repeat(' + fields.length + ', minmax(260px, 1fr))';

    /* --- Felder durchlaufen --- */
    for (var fIdx = 0; fIdx < fields.length; fIdx++) {
      var f = fields[fIdx];

      // Spiegelmodus
      if (MIRROR_MODE) {
        if (f === 1) f = 3;
        else if (f === 3) f = 1;
      }

      var match = null;

      /* Match für Zeit + Feld suchen */
      for (var i = 0; i < activeRows.length; i++) {
        var m = activeRows[i];
        var t = (m && m.plannedStart) ? m.plannedStart : '–';
        var fld = (m && m.field != null) ? Number(m.field) : null;

        if (t === timeKey && fld === Number(f)) {
          match = m;
          break;
        }
      }

      /* Match gefunden → Kachel */
      if (match) {
        grid.appendChild(tileNodeForMatch(match));
      }
      /* Kein Match → Platzhalter */
      else {
        var placeholder = document.createElement('div');
        addClassSafe(placeholder, 'tile');

        var tag = document.createElement('span');
        tag.className = 'tileTag';
        tag.textContent = '—';

        placeholder.appendChild(tag);
        grid.appendChild(placeholder);
      }
    }

    slot.append(timeCol, grid);
    cont.appendChild(slot);
  }

  /* --- Hinweis-Kacheln für abgeschlossene Gruppen --- */
  ['A', 'B', 'C', 'D', 'E', 'F'].forEach(function (g) {
    if (completed[g]) {
      cont.appendChild(bigNoticeTile(g));
    }
  });

  updateTilesHeadHeight();
}


/* ============================================================================
   TEAMS-VIEW – Anzeige aller Teams nach Gruppen
============================================================================ */
function renderTeamsGrid(teams) {
  var grid = document.getElementById('teamsGrid');
  var empty = document.getElementById('teamsEmpty');
  if (!grid || !empty) return;

  grid.innerHTML = '';

  if (!Array.isArray(teams) || teams.length === 0) {
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';

  var groups = ['A', 'B', 'C', 'D', 'E', 'F'];

  groups.forEach(function (g) {
    var list = teams
      .filter(function (t) {
        return String(t.groupName || '').trim().toUpperCase() === g;
      })
      .sort(function (a, b) {
        return String(a.name || '').localeCompare(String(b.name || ''));
      });

    var card = document.createElement('div');
    card.className = 'teamCard';
    addClassSafe(card, groupClass(g));

    var head = document.createElement('div');
    head.className = 'teamCardHeader';

    var badge = document.createElement('span');
    badge.className = 'teamBadge ' + g;
    badge.textContent = 'Gruppe ' + g;

    var count = document.createElement('span');
    count.className = 'teamCount';
    count.textContent = list.length + ' Team(s)';

    head.append(badge, count);
    card.appendChild(head);

    var ul = document.createElement('ul');
    ul.className = 'teamList';

    if (list.length === 0) {
      var li = document.createElement('li');
      li.className = 'teamItem teamEmpty';
      li.textContent = '– keine Teams –';
      ul.appendChild(li);
    } else {
      list.forEach(function (t) {
        var li = document.createElement('li');
        li.className = 'teamItem';

        var dot = document.createElement('span');
        dot.className = 'teamDot ' + g;

        var name = document.createElement('span');
        name.textContent = t.name;

        li.append(dot, name);
        ul.appendChild(li);
      });
    }

    card.appendChild(ul);
    grid.appendChild(card);
  });
}


/* ============================================================================
   HALLENLAYOUT – Team-Overlays für die drei Felder
============================================================================ */
function updateHallenlayout() {
  /* Hallenbild setzen (normal / gespiegelt) */
  setHallImage();

  /* Overlays zurücksetzen */
  document.querySelectorAll('.team-overlay').forEach(el => {
    el.textContent = '';
    el.className = 'team-overlay';
  });

  if (!MATCHES || MATCHES.length === 0) return;

  /* Nur die ersten 3 Spiele (aktuelle Runde) anzeigen */
  const current = MATCHES.slice(0, 3);

  current.forEach(m => {
    var fieldNo = m.field;

    // Spiegelmodus: Feld 1 ↔ 3 tauschen
    if (MIRROR_MODE) {
      if (fieldNo === 1) fieldNo = 3;
      else if (fieldNo === 3) fieldNo = 1;
    }

    var elA = document.getElementById(`field${fieldNo}-teamA`);
    var elB = document.getElementById(`field${fieldNo}-teamB`);

    // Bei Spiegelmodus A/B tauschen
    if (MIRROR_MODE) {
      elB = document.getElementById(`field${fieldNo}-teamA`);
      elA = document.getElementById(`field${fieldNo}-teamB`);
    }

    if (elA) {
      elA.textContent = m.teamA || '';
      if (m.groupName) elA.classList.add(`group-${m.groupName.toUpperCase()}`);
    }

    if (elB) {
      elB.textContent = m.teamB || '';
      if (m.groupName) elB.classList.add(`group-${m.groupName.toUpperCase()}`);
    }
  });
}

/* ============================================================================
   STICKY-OFFSETS & VIEW-UMSCHALTUNG
   - Berechnet dynamische Abstände für Sticky-Header
   - Steuert die Ansicht (Tabelle / Kacheln / Halle / Teams / Regeln)
============================================================================ */

/** Setzt den Titel über der Ansicht */
function updateSectionTitle(mode) {
  var h2 = document.getElementById('sectionTitle');
  if (!h2) return;

  if (mode === 'hall')      h2.textContent = 'Halle';
  else if (mode === 'teams') h2.textContent = 'Gruppeneinteilung';
  else if (mode === 'rules') h2.textContent = 'Regelübersicht';
  else                       h2.textContent = 'Spielübersicht';
}

/** Berechnet die Sticky-Abstände für Header + Section-Header */
function updateStickyOffsets() {
  var topHdr = document.querySelector('body > header');
  var secHdr = document.getElementById('sectionHeader');

  var topH = topHdr ? Math.ceil(topHdr.getBoundingClientRect().height) : 0;
  var secH = secHdr ? Math.ceil(secHdr.getBoundingClientRect().height) : 0;

  document.documentElement.style.setProperty('--sticky-offset', topH + 'px');
  document.documentElement.style.setProperty('--sticky-sec',    secH + 'px');
}

/* Sticky-Offsets bei Load/Resize aktualisieren */
window.addEventListener('load', updateStickyOffsets);
window.addEventListener('resize', updateStickyOffsets);
setTimeout(updateStickyOffsets, 350);

/* Tiles-Header-Höhe ebenfalls aktualisieren */
window.addEventListener('load', updateTilesHeadHeight);
window.addEventListener('resize', updateTilesHeadHeight);


/**
 * Umschalten der Ansicht:
 * - table  → Spielplan
 * - tiles  → Spielfeldbelegung
 * - hall   → Hallenlayout
 * - teams  → Gruppeneinteilung
 * - rules  → Regelübersicht
 */
function setView(mode) {
  var body = document.body;

  var btnT  = document.getElementById('btnViewTable');
  var btnK  = document.getElementById('btnViewTiles');
  var btnH  = document.getElementById('btnViewHall');
  var btnTe = document.getElementById('btnViewTeams');
  var btnR  = document.getElementById('btnViewRules');

  /* CSS-Klassen setzen */
  body.classList.remove('view-table', 'view-tiles', 'view-hall', 'view-teams', 'view-rules');

  if      (mode === 'table') body.classList.add('view-table');
  else if (mode === 'hall')  body.classList.add('view-hall');
  else if (mode === 'teams') body.classList.add('view-teams');
  else if (mode === 'rules') body.classList.add('view-rules');
  else                       body.classList.add('view-tiles');

  /* Buttons markieren */
  [btnT, btnK, btnH, btnTe, btnR].forEach(function (b) {
    b && b.classList.remove('btn-active');
  });

  if      (mode === 'table') btnT && btnT.classList.add('btn-active');
  else if (mode === 'hall')  btnH && btnH.classList.add('btn-active');
  else if (mode === 'teams') btnTe && btnTe.classList.add('btn-active');
  else if (mode === 'rules') btnR && btnR.classList.add('btn-active');
  else                       btnK && btnK.classList.add('btn-active');

  updateSectionTitle(mode);
  updateStickyOffsets();
  updateTilesHeadHeight();

  /* Teams-Ansicht lädt Teams live nach */
  if (mode === 'teams') {
    loadTeams()
      .then(renderTeamsGrid)
      .catch(function (e) {
        console.warn('Teams laden fehlgeschlagen:', e);
      });
  }
}

/* Buttons für View-Umschaltung */
document.getElementById('btnViewTable').addEventListener('click', function () { setView('table'); });
document.getElementById('btnViewTiles').addEventListener('click', function () { setView('tiles'); });
document.getElementById('btnViewHall').addEventListener('click',  function () { setView('hall'); });
document.getElementById('btnViewTeams').addEventListener('click', function () { setView('teams'); });
document.getElementById('btnViewRules').addEventListener('click', function () { setView('rules'); });


/* ============================================================================
   REFRESH – Lädt Matches neu und aktualisiert alle Views
============================================================================ */
function refresh() {
  return loadMatches()
    .then(function (rows) {
      MATCHES = rows;
      renderTable(rows);
      renderTiles(rows);
      updateHallenlayout();
      setLastUpdate();
    })
    .catch(function (e) {
      console.error('Laden fehlgeschlagen:', e);
      var el = document.getElementById('lastUpdate');
      if (el) {
        el.textContent = 'Letztes Update: Fehler';
        el.className = 'pill err';
      }
      setStatus(false);
    });
}


/* ============================================================================
   SOCKET.IO – Live-Updates
============================================================================ */
(function initSocket() {
  if (typeof io !== 'function') {
    console.error('Socket.IO Client nicht geladen – prüfe /socket.io/socket.io.js');
    setStatus(false);
    return;
  }

  var s = io("/minis3", {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 10,
    timeout: 10000
  });

  /* Verbindung */
  s.on('connect', function () {
    setStatus(true);
    updateStickyOffsets();
    updateTilesHeadHeight();
  });

  s.on('disconnect', function () {
    setStatus(false);
  });

  /* Live-Zuschauer */
  s.on("viewerCount3", count => {
    const el = document.getElementById("viewerCount");
    if (el) el.textContent = "Zuschauer online: " + count;
  });

  /* Debounced Refresh */
  var t;
  function triggerDebounced() {
    clearTimeout(t);
    t = setTimeout(function () { refresh(); }, 250);
  }

  /* Events, die Refresh auslösen */
  s.on('resultUpdate',          triggerDebounced);
  s.on('results:updated',       triggerDebounced);
  s.on('group:started',         triggerDebounced);
  s.on('round:advanced',        triggerDebounced);
  s.on('matches:reset',         triggerDebounced);
  s.on('groups:reseeded',       triggerDebounced);
  s.on('schedule:recalculated', triggerDebounced);

  /* Reset-Ereignisse */
  s.on("reset-3v3", () => { location.reload(); });
  s.on("reset-all", () => { location.reload(); });

  /* Meta-Update (Jahrgang) */
  s.on('meta:updated', function (p) {
    var lbl = (p && typeof p.yearLabel === 'string') ? p.yearLabel : null;
    var el = document.getElementById('viewerYearLabel');
    if (el) el.textContent = 'Jahrgang: ' + (lbl || '–');
  });

  /* Teams-Update */
  s.on("teams:updated", () => {
    Promise.all([loadTeams(), loadMatches()])
      .then(([teams, matches]) => {
        renderTeamsGrid(teams);
        MATCHES = matches;
        updateHallenlayout();
        setLastUpdate();
      })
      .catch(err => console.error("Teams laden fehlgeschlagen:", err));
  });
})();


/* ============================================================================
   DOM READY – Initialisierung
============================================================================ */
document.addEventListener('DOMContentLoaded', function () {

  /* Standardansicht: Kacheln */
  setView('tiles');
  updateSectionTitle('tiles');

  /* Initial laden */
  refresh();

  /* Alle 30 Sekunden aktualisieren */
  setInterval(refresh, 30000);

  /* Werbung / Info-Kachel */
  var adTile = document.getElementById('adTile');
  var adHeader = document.getElementById('adHeader');

  function toggleAd() {
    if (!adTile) return;
    var expanded = adTile.getAttribute('aria-expanded') === 'true';
    adTile.setAttribute('aria-expanded', expanded ? 'false' : 'true');
  }

  if (adHeader) {
    adHeader.addEventListener('click', toggleAd);
    adHeader.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ' || ev.keyCode === 13 || ev.keyCode === 32) {
        ev.preventDefault();
        toggleAd();
      }
    });
  }

  /* Jahrgangs-Label initial laden */
  loadMeta()
    .then(function (m) {
      var lbl = (m && typeof m.yearLabel === 'string') ? m.yearLabel : null;
      var el = document.getElementById('viewerYearLabel');
      if (el) el.textContent = 'Jahrgang: ' + (lbl || '–');
    })
    .catch(function () { /* still */ });
});
