// public/5v5/minis5_viewer.js

// Basis‑URL für alle API‑Requests des 5v5‑Viewers
const API_BASE = window.location.origin + '/api/minis5';

// Verbindungstatus‑Element (oben rechts)
const connState = document.getElementById("connState");

// Pokal‑Icon für Siegerdarstellung
const trophy = `<span style="color:#facc15; margin-left:6px;">🏆</span>`;

// Ob die Ansicht gespiegelt werden soll (für Hallenlayout & Tiles)
let MIRROR_MODE = false; 


/* ============================================================================
   STATUS‑ANZEIGE
   - Setzt Text + Farbe im Header
============================================================================ */
function setStatus(text, color) {
    connState.textContent = text;
    connState.style.color = color;
}


/* ============================================================================
   ANSICHT SPIEGELN
   - Wird durch Checkbox im Header ausgelöst
   - Aktualisiert alle Views (Tiles, Tabelle, Halle)
============================================================================ */
function toggleMirror() {
  MIRROR_MODE = document.getElementById("mirrorView").checked;
  refreshAll(); // wird später definiert
}


/* ============================================================================
   HELPER
============================================================================ */

/**
 * safeFetch(path)
 * - Holt JSON vom Server
 * - Wirft Fehler bei HTTP‑Fehlern
 */
async function safeFetch(path) {
  const res = await fetch(API_BASE + path);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

/**
 * groupClass(g)
 * - Liefert CSS‑Klasse für Gruppenfarben (A/B)
 */
function groupClass(g) {
  const x = String(g || '').trim().toUpperCase();
  if (x === 'A') return 'grpA';
  if (x === 'B') return 'grpB';
  return '';
}

/**
 * hhmmToNum("HH:MM")
 * - Wandelt Uhrzeit in Minuten um → für Sortierung
 */
function hhmmToNum(h) {
  const m = /^(\d{2}):(\d{2})$/.exec(h || '');
  if (!m) return Number.POSITIVE_INFINITY;
  return Number(m[1]) * 60 + Number(m[2]);
}


/* ============================================================================
   NAVIGATION (Tabs)
   - Buttons mit data-page="tiles" → zeigt #page-tiles
   - Buttons mit data-page="list"  → zeigt #page-list
   - usw.
============================================================================ */
function initNav() {
  const buttons = document.querySelectorAll('.navBtn');
  const pages   = document.querySelectorAll('.page');

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.page;

      // Aktiven Button markieren
      buttons.forEach(b =>
        b.classList.toggle('navBtn-active', b === btn)
      );

      // Passende Seite anzeigen
      pages.forEach(p =>
        p.classList.toggle('page-active', p.id === 'page-' + page)
      );
    });
  });
}


/* ============================================================================
   TILES‑RENDERING (5v5 → 2 Felder)
   - Gruppiert Spiele nach Uhrzeit
   - Sortiert Felder 1/2
   - Markiert die nächsten 2 Spiele als "currentMatch"
   - Unterstützt Spiegelmodus (Feld 1 ↔ 2)
============================================================================ */
function renderTiles(matches) {
  const cont = document.getElementById('tilesContainer');
  cont.innerHTML = '';

  // Keine Spiele vorhanden
  if (!Array.isArray(matches) || !matches.length) {
    cont.textContent = 'Noch keine Spiele geplant.';
    return;
  }

  // Spiele nach Startzeit gruppieren
  const rowsByTime = new Map();
  matches.forEach(m => {
    const t = m.plannedStart || '–';
    if (!rowsByTime.has(t)) rowsByTime.set(t, []);
    rowsByTime.get(t).push(m);
  });

  // Zeiten sortieren
  const times = Array.from(rowsByTime.keys())
    .sort((a, b) => hhmmToNum(a) - hhmmToNum(b));

  // Die nächsten 2 Spiele hervorheben
  const upcoming = matches.filter(m => !m.winner).slice(0, 2);
  const upcomingIds = upcoming.map(m => m.id);

  // Für jede Zeitreihe eine Zeile rendern
  times.forEach(time => {
    const rowEl = document.createElement('div');
    rowEl.className = 'tilesRow';

    // Zeitspalte
    const timeCol = document.createElement('div');
    timeCol.className = 'timeCol';
    timeCol.textContent = time;
    rowEl.appendChild(timeCol);

    // Grid für 2 Felder
    const grid = document.createElement('div');
    grid.className = 'grid2';

    // Spiele dieser Zeit nach Feld sortieren
    const ms = rowsByTime.get(time)
      .sort((a, b) => Number(a.field) - Number(b.field));
    
    // Felder 1 und 2 rendern
    for (let f = 1; f <= 2; f++) {

      // Spiegelmodus: Feld 1 ↔ 2
      let fieldNo = f;
      if (MIRROR_MODE) {
        if (fieldNo === 1) fieldNo = 2;
        else if (fieldNo === 2) fieldNo = 1;
      }

      const m = ms.find(x => Number(x.field) === fieldNo) || null;

      const tile = document.createElement('div');
      tile.className = 'tile';

      // Markierung für "nächstes Spiel"
      if (m && upcomingIds.includes(m.id)) {
        tile.classList.add("currentMatch");
      }

      if (m) {
        const cls = groupClass(m.groupName);

        // Kopfbereich (Gruppe + Feld)
        const top = document.createElement('div');
        top.className = 'tileTop';
        top.innerHTML = `
          <span class="pill ${cls}">Gruppe ${m.groupName}</span>
          <span>Feld ${m.field}</span>
        `;

        // Hauptbereich (Team A / Team B)
        const main = document.createElement('div');
        main.className = 'tileMain';

        let ta = m.teamA_name || m.teamA || '';
        let tb = m.teamB_name || m.teamB || '';

        // Pokal-Icon für Sieger
        if (m.winner === 'A') ta = `${trophy} ` + ta;
        if (m.winner === 'B') tb += ` ${trophy}`;

        main.innerHTML = `
          <span class="teamA">${ta}</span>
          <span class="teamB">${tb}</span>
        `;

        // Gewinner/Verlierer farblich markieren
        const teamAEl = main.querySelector(".teamA");
        const teamBEl = main.querySelector(".teamB");

        if (m.winner === "A") {
          teamAEl.classList.add("winner");
          teamBEl.classList.add("loser");
        }
        if (m.winner === "B") {
          teamBEl.classList.add("winner");
          teamAEl.classList.add("loser");
        }

        tile.append(top, main);
      } else {
        // Kein Spiel auf diesem Feld
        tile.textContent = '–';
      }

      grid.appendChild(tile);
    }

    rowEl.appendChild(grid);
    cont.appendChild(rowEl);
  });
}


/* ============================================================================
   TABELLEN‑RENDERING
   - Zeigt alle Spiele in Tabellenform
   - Markiert die nächsten 2 Spiele
============================================================================ */
function renderTable(matches) {
  const tbody = document.querySelector('#matchesTable tbody');
  tbody.innerHTML = '';

  const upcoming = matches.filter(m => !m.winner).slice(0, 2);
  const upcomingIds = upcoming.map(m => m.id);

  matches.forEach(m => {
    const tr = document.createElement('tr');

    const cls = groupClass(m.groupName);
    if (cls) tr.classList.add(cls);

    let ta = m.teamA_name || m.teamA || '';
    let tb = m.teamB_name || m.teamB || '';

    if (m.winner === 'A') ta += ` ${trophy}`;
    if (m.winner === 'B') tb += ` ${trophy}`;

    tr.innerHTML = `
      <td>${m.id}</td>
      <td><span class="pill ${cls}">${m.groupName}</span></td>
      <td>${m.plannedStart || '–'}</td>
      <td>${m.field}</td>
      <td>${ta}</td>
      <td>${tb}</td>
    `;
    
    if (upcomingIds.includes(m.id)) {
      tr.classList.add("currentMatch");
    }

    tbody.appendChild(tr);
  });
}


/* ============================================================================
   TEAMS‑RENDERING
   - Baut die Teamübersicht für Gruppe A und B
   - Zeigt Teamanzahl + Teamliste je Gruppe
============================================================================ */
function renderTeams(teams) {
  const grid = document.getElementById('teamsGrid');
  grid.innerHTML = '';

  // Feste Gruppenreihenfolge
  const groups = ['A', 'B'];

  groups.forEach(g => {
    // Karte für Gruppe A/B
    const card = document.createElement('div');
    card.className = 'teamCard ' + groupClass(g);

    // Kopfbereich der Karte
    const head = document.createElement('div');
    head.className = 'teamCardHeader';

    // Badge "Gruppe A/B"
    const badge = document.createElement('span');
    badge.className = 'teamBadge ' + groupClass(g);
    badge.textContent = 'Gruppe ' + g;

    // Anzahl Teams in dieser Gruppe
    const count = document.createElement('span');
    count.className = 'teamCount';
    const c = teams.filter(t => String(t.groupName).toUpperCase() === g).length;
    count.textContent = `${c} Team(s)`;

    head.append(badge, count);
    card.appendChild(head);

    // UL-Liste für Teams
    const ul = document.createElement('ul');
    ul.className = 'teamList';

    // Teams der Gruppe einfügen
    teams
      .filter(t => String(t.groupName).toUpperCase() === g)
      .forEach(t => {
        const li = document.createElement('li');
        li.className = 'teamItem';

        const dot = document.createElement('span');
        dot.className = 'teamDot ' + groupClass(g);

        const name = document.createElement('span');
        name.textContent = t.name;

        li.append(dot, name);
        ul.appendChild(li);
      });

    card.appendChild(ul);
    grid.appendChild(card);
  });
}


/* ============================================================================
   HALLENLAYOUT‑RENDERING
   - Zeigt Hallenbild (normal oder gespiegelt)
   - Zeigt Team‑Overlays für die nächsten 2 Spiele
   - Unterstützt Spiegelmodus (Feld 1 ↔ 2)
============================================================================ */
function updateHallenlayout(matches) {
  const img = document.getElementById("hallImage");

  // Hintergrundbild je nach Spiegelmodus
  if (MIRROR_MODE) {
    img.src = "/assets/bg_hallenmasters_Gym2_mirrored.jpg";
  } else {
    img.src = "/assets/bg_hallenmasters_Gym2.jpg"; 
  } 
    
  // Alle Overlays zurücksetzen
  document.querySelectorAll('.team-overlay').forEach(el => {
    el.textContent = '';
    el.className = 'team-overlay';
  });
  
  // Keine Spiele → nichts anzeigen
  if (!matches || matches.length === 0) return;

  // Die nächsten 2 Spiele ohne Sieger
  const current = matches.filter(m => !m.winner).slice(0, 2);

  current.forEach(m => {
    let fieldNo = m.field;

    // Spiegelmodus: Feld 1 ↔ 2
    if (MIRROR_MODE) {
      if (fieldNo === 1) fieldNo = 2;
      else if (fieldNo === 2) fieldNo = 1;
    }

    // Elemente für Team A/B
    let elA = document.getElementById(`field${fieldNo}-teamA`);
    let elB = document.getElementById(`field${fieldNo}-teamB`);

    // Bei Spiegelmodus A/B tauschen
    if (MIRROR_MODE) {
      elB = document.getElementById(`field${fieldNo}-teamA`);
      elA = document.getElementById(`field${fieldNo}-teamB`);
    }

    // Team A anzeigen
    if (elA) {
      elA.textContent = m.teamA_name || '';
      if (m.groupName) elA.classList.add(`group-${m.groupName.toUpperCase()}`);
    }

    // Team B anzeigen
    if (elB) {
      elB.textContent = m.teamB_name || '';
      if (m.groupName) elB.classList.add(`group-${m.groupName.toUpperCase()}`);
    }
  });
}


/* ============================================================================
   SOCKET.IO – LIVE‑UPDATES
   - Aktualisiert Viewer bei Änderungen (Sieger, Matches, Teams)
   - Zeigt Verbindungstatus
   - Aktualisiert Zuschauerzahl
============================================================================ */
function initSocket() {
  if (typeof io !== 'function') return;

  const s = io("/minis5", {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 10,
    timeout: 10000
  });

  // Bei jedem Update → alles neu laden
  const reload = () => refreshAll();

  s.on('connect', reload);
  s.on('resultUpdate', reload);
  s.on('results:updated', reload);
  s.on('matches:updated', reload);
  s.on('winner:updated', reload);
  s.on('teams:updated', reload);

  // Reset-Befehle
  s.on("reset-5v5", () => { location.reload(); });
  s.on("reset-all", () => { location.reload(); });

  // Verbindung hergestellt
  s.on("connect", () => {
    setStatus("verbunden", "#22c55e");
  });

  // Live-Zuschauerzahl
  s.on("viewerCount5", count => {
    const el = document.getElementById("viewerCount");
    if (el) el.textContent = "Zuschauer online: " + count;
  });

  // Verbindung verloren
  s.on("disconnect", () => {
    setStatus("getrennt", "#ef4444");
  });

  // Matches aktualisiert → kurze Statusmeldung
  s.on("matches:updated", () => {
    setStatus("Update empfangen", "#22c55e");
    setTimeout(() => setStatus("verbunden", "#22c55e"), 1500);
  });

  // Falls winner:updated genutzt wird
  s.on("winner:updated", () => {
    setStatus("Update empfangen", "#22c55e");
    setTimeout(() => setStatus("verbunden", "#22c55e"), 1500);
  });
}


/* ============================================================================
   WERBE‑KACHEL (Sommerfestival)
   - Ein-/Ausklappbar
============================================================================ */
function initAdTile() {
  const tile   = document.getElementById("adTile");
  const header = document.getElementById("adHeader");
  const body   = document.getElementById("adBody");
  const icon   = tile.querySelector(".adToggleIcon");

  header.addEventListener("click", () => {
    const expanded = tile.getAttribute("aria-expanded") === "true";
    tile.setAttribute("aria-expanded", !expanded);

    // Body ein-/ausblenden
    body.style.display = expanded ? "none" : "block";

    // Pfeil drehen
    icon.textContent = expanded ? "›" : "‹";
  });
}

document.addEventListener("DOMContentLoaded", initAdTile);


/* ============================================================================
   REGEL‑KACHEL (Regelübersicht)
   - Ein-/Ausklappbar
============================================================================ */
function initRulesTile() {
  const tile   = document.getElementById("rulesTile");
  const header = document.getElementById("rulesHeader");
  const body   = document.getElementById("rulesBody");
  const icon   = tile.querySelector(".rulesToggleIcon");

  header.addEventListener("click", () => {
    const expanded = tile.getAttribute("aria-expanded") === "true";
    tile.setAttribute("aria-expanded", !expanded);

    body.style.display = expanded ? "none" : "block";
    icon.textContent   = expanded ? "›" : "‹";
  });
}

document.addEventListener("DOMContentLoaded", initRulesTile);

/* ============================================================================
   REFRESH ALL
   - Lädt alle relevanten Daten (Matches + Teams)
   - Rendert:
       • Tiles (Spielfeldbelegung)
       • Tabelle (Spielplan)
       • Teams (Teamübersicht)
       • Hallenlayout (Team-Overlays)
   - Wird bei:
       • Initialem Laden
       • Socket-Updates
       • Mirror-Mode-Wechsel
       • Intervall (alle 20 Sekunden)
============================================================================ */
async function refreshAll() {
  try {
    // Daten vom Server holen
    const matches = await safeFetch('/matches');
    const teams   = await safeFetch('/teams');

    // Alle Views aktualisieren
    renderTiles(matches);
    renderTable(matches);
    renderTeams(teams);
    updateHallenlayout(matches);

  } catch (e) {
    // Fehleranzeige in der Tiles-Ansicht
    const cont = document.getElementById('tilesContainer');
    cont.textContent = 'Fehler beim Laden: ' + e.message;
  }
}


/* ============================================================================
   INIT – Hauptstartpunkt des Viewers
   - Initialisiert:
       • Socket.IO Live-Updates
       • Navigation
       • Erstes Laden aller Daten
       • Automatisches Refresh-Intervall
============================================================================ */
document.addEventListener('DOMContentLoaded', () => {

  initSocket();   // Live-Updates aktivieren
  initNav();      // Navigation (Tabs)
  refreshAll();   // Erstes Laden

  // Alle 20 Sekunden automatisch aktualisieren
  setInterval(refreshAll, 20000);
});
