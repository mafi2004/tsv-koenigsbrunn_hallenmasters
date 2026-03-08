// public/5v5/minis5_admin.js

// Basis-URL für alle API‑Requests des 5v5‑Modus
const API_BASE = window.location.origin + '/api/minis5';


/* ============================================================================
   PASSWORTSCHUTZ
   - Blendet ein Overlay ein, bis das korrekte Admin‑Passwort eingegeben wurde
   - Passwort liegt in window.ADMIN_PASSWORD (aus admin_password.js)
   - Status wird in localStorage gespeichert → erneutes Laden bleibt eingeloggt
============================================================================ */
document.addEventListener("DOMContentLoaded", () => {
  const overlay = document.getElementById("pwOverlay");
  const input   = document.getElementById("pwInput");
  const btn     = document.getElementById("pwBtn");
  const err     = document.getElementById("pwError");

  if (!overlay || !input || !btn || !err) return;

  // Cursor direkt ins Passwortfeld setzen
  input.focus();

  // Enter‑Taste = Login
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") btn.click();
  });

  // Bereits eingeloggt?
  if (localStorage.getItem("admin_pw_ok") === "1") {
    overlay.style.display = "none";
  }

  // Login‑Button
  btn.addEventListener("click", () => {
    if (input.value === window.ADMIN_PASSWORD) {
      // Passwort korrekt → Overlay ausblenden
      localStorage.setItem("admin_pw_ok", "1");
      overlay.style.display = "none";
    } else {
      // Fehler anzeigen
      err.style.display = "block";
      setTimeout(() => (err.style.display = "none"), 2000);
    }
  });
});


/* ============================================================================
   NAVIGATION (Tabs)
   - Buttons mit class="navBtn"
   - Seiten mit class="page"
   - Umschalten erfolgt über data-page="teams" → #page-teams
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
   QR‑CODE / VIEWER‑LINK
   - Speichert Basis‑URL für Viewer (z. B. 192.168.0.25)
   - Baut daraus den vollständigen Viewer‑Link
   - Generiert QR‑Code über /api/qr
============================================================================ */
const QR_BASE_KEY = 'viewer.qr.base';

function getQRBase() {
  return (localStorage.getItem(QR_BASE_KEY) || '').trim();
}

function setQRBase(v) {
  localStorage.setItem(QR_BASE_KEY, (v || '').trim());
}

/**
 * Baut die Viewer‑URL:
 * - Wenn der Admin eine IP eingibt → http://IP/5v5/viewer.html
 * - Wenn leer → Fallback auf Render‑Domain
 */
function buildViewerUrl(base) {
  const host = (base || '').trim();
  const hasProto = /^https?:\/\//i.test(host);
  const urlBase = hasProto ? host : ('http://' + host);

  // 5v5 oder 3v3?
  const is5v5 = window.location.pathname.includes('/5v5/');
  const viewerPath = is5v5 ? '/5v5/viewer.html' : '/3v3/viewer.html';

  // Benutzer hat eine IP/Domain eingetragen
  if (host) {
    return urlBase.replace(/\/+$/, '') + viewerPath;
  }

  // Fallback: öffentliche Render‑Domain
  return `https://tsv-koenigsbrunn-hallenmasters.onrender.com${viewerPath}`;
}

// Cache‑Bust für QR‑Code
const cacheBust = () => `?_v=${Date.now()}`;

/**
 * Überträgt gespeicherte Viewer‑Basis in UI:
 * - Input‑Feld
 * - Viewer‑Link
 * - QR‑Code
 */
function applyQRBaseToUI() {
  const base = getQRBase();
  const input = document.getElementById('qrBase');
  const a     = document.getElementById('viewerLink');
  const img   = document.getElementById('qr-img');

  if (input) input.value = base;

  const url = buildViewerUrl(base);

  // Link setzen
  if (a) {
    a.href = url || '#';
    a.textContent = 'Viewer öffnen';
  }

  // QR‑Code setzen
  if (img) {
    if (url) {
      const endpoint = `/api/qr?text=${encodeURIComponent(url)}&size=128${cacheBust()}`;
      img.onerror = () => { img.style.display = 'none'; };
      img.onload  = () => { img.style.display = 'block'; };
      img.src = endpoint;
      img.alt = 'QR-Code zum Viewer';
      img.title = 'QR-Code zum Viewer (' + url + ')';
    } else {
      img.style.display = 'none';
      img.removeAttribute('src');
    }
  }
}


/* ============================================================================
   STATUS‑ANZEIGE (oben rechts)
============================================================================ */
const connState = document.getElementById("connState");

/**
 * Setzt Text + Farbe des Statuslabels
 */
function setStatus(text, color) {
  if (!connState) return;
  connState.textContent = text;
  connState.style.color = color;
}


/* ============================================================================
   HELPER
============================================================================ */

/**
 * Fetch‑Wrapper mit Fehlerbehandlung
 * - wirft Error bei HTTP‑Fehlern
 * - gibt JSON zurück
 */
async function safeFetch(path, init) {
  const res = await fetch(API_BASE + path, init);
  if (!res.ok) {
    let txt = "";
    try { txt = await res.text(); } catch {}
    throw new Error(
      "HTTP " + res.status + " " + res.statusText + (txt ? ": " + txt : "")
    );
  }
  return res.json();
}

/**
 * Zeigt eine temporäre Meldung (grün/rot)
 */
function showMsg(selectorOrEl, text, isError) {
  const el = typeof selectorOrEl === "string"
    ? document.querySelector(selectorOrEl)
    : selectorOrEl;

  if (!el) return;

  el.textContent = text;
  el.style.display = "inline-block";
  el.style.borderColor = isError ? "var(--danger)" : "var(--accent)";
  el.style.color      = isError ? "#fecaca" : "#86efac";

  clearTimeout(el._t);
  el._t = setTimeout(() => {
    el.style.display = "none";
  }, 3500);
}

/**
 * Liefert CSS‑Klasse für Gruppenfarben
 */
function groupClass(g) {
  const x = String(g || "").trim().toUpperCase();
  if (x === "A") return "grpA";
  if (x === "B") return "grpB";
  return "";
}


/* ============================================================================
   API‑ALIASES – einfache Wrapper für Backend‑Routen
============================================================================ */

// Teams
const loadTeams = () => safeFetch("/teams");

const addTeam = (name, groupName) =>
  safeFetch("/teams", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, groupName }),
  });

const deleteTeam = (id) =>
  safeFetch("/teams/" + encodeURIComponent(id), {
    method: "DELETE"
  });

const deleteAllTeams = () =>
  safeFetch("/teams", { method: "DELETE" });

// Matches
const loadMatches = () => safeFetch("/matches");

const resetMatches = () =>
  safeFetch("/matches", { method: "DELETE" });

// Spielplan generieren
const generateScheduleOnServer = (schedule) =>
  safeFetch("/matches/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(schedule),
  });

// Ergebnis aktualisieren
const updateResult = (id, scoreA, scoreB) =>
  safeFetch("/matches/updateResult", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, scoreA, scoreB }),
  });


/* ============================================================================
   STATE – zentrale Datenhaltung im Admin-Frontend
   TEAMS   → Liste aller Teams aus der API
   MATCHES → Liste aller Spiele (wird in Teil 3 genutzt)
============================================================================ */
let TEAMS = [];
let MATCHES = [];


/* ============================================================================
   TEAMS-RENDERING – Aufbau der Teamkarten nach Gruppen
   buildTeamsGrid(groups)
   - Erzeugt die Kartenstruktur für Gruppe A und B
   - Jede Karte enthält:
       • Gruppen-Badge
       • Teamzähler
       • UL-Liste für Teams
============================================================================ */
function buildTeamsGrid(groups) {
  const grid = document.getElementById("teamsGrid");
  if (!grid) return;
  grid.innerHTML = "";

  // Reihenfolge der Gruppen fest definieren
  const order = ["A", "B"];
  const groupsOrdered = groups.slice().sort((a, b) => order.indexOf(a) - order.indexOf(b));

  groupsOrdered.forEach((g) => {
    // Karte für Gruppe A/B
    const card = document.createElement("div");
    card.className = "teamCard " + groupClass(g);

    // Kopfbereich der Karte
    const head = document.createElement("div");
    head.className = "teamCardHeader";

    // Badge "Gruppe A/B"
    const badge = document.createElement("span");
    badge.className = "teamBadge " + groupClass(g);
    badge.textContent = "Gruppe " + g;

    // Teamzähler (wird später aktualisiert)
    const count = document.createElement("span");
    count.className = "teamCount";
    count.textContent = "0 Team(s)";

    head.append(badge, count);
    card.appendChild(head);

    // UL-Liste für Teams dieser Gruppe
    const ul = document.createElement("ul");
    ul.className = "teamList";
    ul.id = `teams-list-${g}`;
    card.appendChild(ul);

    grid.appendChild(card);
  });
}


/* ============================================================================
   renderTeams()
   - Ermittelt alle vorhandenen Gruppen (A/B)
   - Baut Kartenstruktur neu auf
   - Fügt alle Teams in die passende UL ein
   - Aktualisiert Teamzähler
============================================================================ */
function renderTeams() {
  // Alle Gruppen extrahieren, die in TEAMS vorkommen
  const groupsSet = new Set(
    TEAMS.map((t) =>
      String(t.groupName || "").trim().toUpperCase()
    ).filter(Boolean)
  );

  // Falls keine Teams vorhanden → Standardgruppen A/B anzeigen
  const groups = groupsSet.size ? Array.from(groupsSet) : ["A", "B"];

  // Kartenstruktur neu aufbauen
  buildTeamsGrid(groups);

  // ULs leeren
  groups.forEach((g) => {
    const ul = document.getElementById(`teams-list-${g}`);
    if (ul) ul.innerHTML = "";
  });

  // Teams in die passende Gruppe einfügen
  TEAMS.forEach((t) => {
    const g = String(t.groupName || "").trim().toUpperCase();
    const ul = document.getElementById(`teams-list-${g}`);
    if (!ul) return;

    const li = document.createElement("li");
    li.className = "teamItem";

    // Farbpunkt (Gruppenfarbe)
    const dot = document.createElement("span");
    dot.className = "teamDot " + groupClass(g);

    // Teamname
    const name = document.createElement("span");
    name.textContent = t.name;

    // Löschen-Button
    const del = document.createElement("button");
    del.className = "btn btn-danger";
    del.textContent = "Löschen";
    del.style.marginLeft = "auto";

    // Klick → Team löschen → Liste neu laden
    del.addEventListener("click", async () => {
      try {
        await deleteTeam(t.id);
        await refreshTeams();
      } catch (e) {
        showMsg("#teamsMsg", "Fehler: " + e.message, true);
      }
    });

    li.append(dot, name, del);
    ul.appendChild(li);
  });

  // Teamzähler aktualisieren
  groups.forEach((g) => {
    const count = TEAMS.filter(
      (t) => String(t.groupName).toUpperCase() === g
    ).length;

    const card = document.querySelector(
      `.teamCard.${groupClass(g)} .teamCount`
    );

    if (card) card.textContent = `${count} Team(s)`;
  });
}


/* ============================================================================
   refreshTeams()
   - Holt Teams vom Server
   - Speichert sie in TEAMS
   - Rendert UI neu
============================================================================ */
async function refreshTeams() {
  try {
    TEAMS = await loadTeams();
    renderTeams();
  } catch (e) {
    showMsg("#teamsMsg", "Fehler: " + e.message, true);
  }
}


/* ============================================================================
   MATCHES RENDERING – Tabelle für Spielplan (A+B)
   - Zeigt alle Spiele
   - Markiert die nächsten 2 Spiele als "currentMatch"
   - Fügt Buttons für Sieger A/B + Reset hinzu
============================================================================ */
function renderMatches() {
  const tbody = document.querySelector("#matchesTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  
  // Die nächsten 2 Spiele ohne Sieger hervorheben
  const upcoming = MATCHES.filter(m => !m.winner).slice(0, 2);
  const upcomingIds = upcoming.map(m => m.id);

  MATCHES.forEach((m) => {
    const tr = document.createElement("tr");

    // Gruppenfarbe (A/B)
    const cls = groupClass(m.groupName);
    if (cls) tr.classList.add(cls);

    // Teamnamen (Backend liefert teamA_name oder teamA)
    const taName = m.teamA_name || m.teamA || "";
    const tbName = m.teamB_name || m.teamB || "";

    // Pokal-Icon für Sieger
    const trophy = `<span style="color:#facc15; margin-left:6px;">🏆</span>`;
    const taWinner = m.winner === "A" ? trophy : "";
    const tbWinner = m.winner === "B" ? trophy : "";

    // Tabellenzeile
    tr.innerHTML = `
      <td>${m.id}</td>
      <td><span class="pill ${cls}">${m.groupName}</span></td>
      <td>${m.plannedStart || "–"}</td>
      <td>${m.field}</td>
      <td>${taName} ${taWinner}</td>
      <td>${tbName} ${tbWinner}</td>
      <td>
        <button class="btn btn-success btnWinnerA" data-id="${m.id}">Sieger: Team A</button>
        <button class="btn btn-success btnWinnerB" data-id="${m.id}">Sieger: Team B</button>
        <button class="btn btn-danger btnResetWinner" data-id="${m.id}">Reset</button>
      </td>
    `;
    
    // Markierung der nächsten Spiele
    if (upcomingIds.includes(m.id)) {
      tr.classList.add("currentMatch");
    }

    tbody.appendChild(tr);
  });

  // Buttons aktivieren
  initWinnerButtons();
}


/* ============================================================================
   initWinnerButtons()
   - Klick auf "Sieger A" → updateResult(id, 1, 0)
   - Klick auf "Sieger B" → updateResult(id, 0, 1)
   - Klick auf "Reset"    → updateResult(id, null, null)
============================================================================ */
function initWinnerButtons() {

  // Sieger A
  document.querySelectorAll(".btnWinnerA").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      try {
        await updateResult(id, 1, 0);
        await refreshMatches();
      } catch (e) {
        showMsg("#timeMsg", "Fehler: " + e.message, true);
      }
    });
  });

  // Sieger B
  document.querySelectorAll(".btnWinnerB").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      try {
        await updateResult(id, 0, 1);
        await refreshMatches();
      } catch (e) {
        showMsg("#timeMsg", "Fehler: " + e.message, true);
      }
    });
  });
  
  // Reset Sieger
  document.querySelectorAll(".btnResetWinner").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      try {
        await updateResult(id, null, null);
        await refreshMatches();
      } catch (e) {
        showMsg("#timeMsg", "Fehler: " + e.message, true);
      }
    });
  });
}


/* ============================================================================
   initScoreInputs()
   - Wird aktuell nicht genutzt (aber vorbereitet)
   - Ermöglicht Eingabe von Toren statt Sieger-Buttons
============================================================================ */
function initScoreInputs() {
  document.querySelectorAll(".scoreInput").forEach((inp) => {
    inp.addEventListener("change", async () => {
      const id = inp.dataset.id;

      const scoreA = document.querySelector(
        `.scoreInput[data-id="${id}"][data-team="A"]`
      ).value;

      const scoreB = document.querySelector(
        `.scoreInput[data-id="${id}"][data-team="B"]`
      ).value;

      try {
        await updateResult(id, scoreA, scoreB);
      } catch (e) {
        showMsg("#timeMsg", "Fehler beim Speichern: " + e.message, true);
      }
    });
  });
}


/* ============================================================================
   refreshMatches()
   - Holt Matches vom Server
   - Rendert Tabelle neu
============================================================================ */
async function refreshMatches() {
  try {
    MATCHES = await loadMatches();
    renderMatches();
  } catch (e) {
    showMsg("#timeMsg", "Fehler: " + e.message, true);
  }
}


/* ============================================================================
   SCHEDULE UI – Spielplan erzeugen (A+B)
   - Startzeit, Dauer, Pause
   - Speichert Werte in localStorage
   - sendet POST /matches/generate
============================================================================ */
function wireScheduleUI() {
  const btn = document.getElementById("sched-generate");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    const timeHHMM = document.getElementById("sched-time").value;
    const dur      = Number(document.getElementById("sched-dur").value);
    const brk      = Number(document.getElementById("sched-break").value);
    
    // Werte speichern
    localStorage.setItem("sched_time", timeHHMM);
    localStorage.setItem("sched_dur",  dur);
    localStorage.setItem("sched_brk",  brk);

    // Validierung
    if (!/^\d{2}:\d{2}$/.test(timeHHMM)) {
      showMsg("#timeMsg", "Startzeit HH:MM ungültig.", true);
      return;
    }
    if (!Number.isFinite(dur) || dur <= 0 || !Number.isFinite(brk) || brk < 0) {
      showMsg("#timeMsg", "Dauer/Pause ungültig.", true);
      return;
    }

    // Spielplan erzeugen
    try {
      await generateScheduleOnServer({ timeHHMM, dur, brk });
      await refreshMatches();
      showMsg("#timeMsg", "Spielplan für A+B erzeugt.");
    } catch (e) {
      showMsg("#timeMsg", "Fehler: " + e.message, true);
    }
  });
}


/* ============================================================================
   SOCKET.IO – Live-Updates für Admin
   - empfängt matches:updated → Tabelle neu laden
   - empfängt reset-5v5 / reset-all → Seite neu laden
============================================================================ */
function initSocket() {
  if (typeof io !== "function") return;

  const s = io("/minis5", {
    path: "/socket.io",
    query: { admin: "true" },
    transports: ["websocket", "polling"],
    reconnectionAttempts: 10,
    timeout: 10000,
  });

  // Verbindung hergestellt
  s.on("connect", () => {
    setStatus("verbunden", "#22c55e");
  });

  // Verbindung verloren
  s.on("disconnect", () => {
    setStatus("getrennt", "#ef4444");
  });
  
  // Reset-Befehle
  s.on("reset-5v5", () => { location.reload(); });
  s.on("reset-all", () => { location.reload(); });

  // Live-Update der Matches
  s.on("matches:updated", () => {
    setStatus("Update empfangen", "#22c55e");
    refreshMatches();
    setTimeout(() => setStatus("verbunden", "#22c55e"), 1500);
  });
}


/* ============================================================================
   EXPORT TEAMS → JSON-DATEI
   - Exportiert Teams + Zeitplan-Einstellungen
   - Wird als teams_export.json heruntergeladen
============================================================================ */
function exportTeamsToFile() {
  const data = {
    meta: {
      exportedAt: new Date().toISOString(),   // Zeitstempel
      count: TEAMS.length,                    // Anzahl Teams
      schedule: {                             // Zeitplan-Einstellungen
        timeHHMM: localStorage.getItem("sched_time") || "",
        dur:      localStorage.getItem("sched_dur")  || "",
        brk:      localStorage.getItem("sched_brk")  || ""
      }
    },

    // Nur Name + Gruppe exportieren (IDs werden neu vergeben)
    teams: TEAMS.map(t => ({
      name: t.name,
      groupName: t.groupName
    }))
  };

  // JSON-Datei erzeugen
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);

  // Download-Link simulieren
  const a = document.createElement("a");
  a.href = url;
  a.download = "teams_export.json";
  a.click();

  URL.revokeObjectURL(url);
}


/* ============================================================================
   IMPORT TEAMS AUS JSON
   - Liest Datei ein
   - Übernimmt Zeitplan-Einstellungen
   - Löscht alle Teams
   - Fügt importierte Teams neu ein
============================================================================ */
async function importTeamsFromFile(file) {
  try {
    const text = await file.text();
    const json = JSON.parse(text);

    /* --- Zeitplan übernehmen, falls vorhanden --- */
    if (json.meta && json.meta.schedule) {
      const s = json.meta.schedule;

      if (s.timeHHMM) {
        document.getElementById("sched-time").value = s.timeHHMM;
        localStorage.setItem("sched_time", s.timeHHMM);
      }
      if (s.dur) {
        document.getElementById("sched-dur").value = s.dur;
        localStorage.setItem("sched_dur", s.dur);
      }
      if (s.brk) {
        document.getElementById("sched-break").value = s.brk;
        localStorage.setItem("sched_brk", s.brk);
      }
    }

    /* --- Teams löschen --- */
    await deleteAllTeams();

    /* --- Neue Teams einfügen --- */
    for (const t of json.teams) {
      if (!t.name || !t.groupName) continue;
      await addTeam(t.name, t.groupName);
    }

    await refreshTeams();
    showMsg("#teamsMsg", "Teams erfolgreich importiert.");
  } catch (e) {
    showMsg("#teamsMsg", "Fehler beim Import: " + e.message, true);
  }
}


/* ============================================================================
   INIT – Hauptstartpunkt des Admin-Panels
   Wird ausgeführt, sobald DOM geladen ist
============================================================================ */
document.addEventListener("DOMContentLoaded", async () => {

  /* --- Grundfunktionen aktivieren --- */
  initNav();          // Tabs
  wireScheduleUI();   // Zeitplan-Generator
  initSocket();       // Live-Updates
  applyQRBaseToUI();  // QR-Code + Viewer-Link

  /* --- Buttons referenzieren --- */
  const btnLoadTeams       = document.getElementById("btnLoadTeams");
  const btnAddTeam         = document.getElementById("btnAddTeam");
  const btnDeleteAllTeams  = document.getElementById("btnDeleteAllTeams");
  const btnLoadMatches     = document.getElementById("btnLoadMatches");
  const btnReset           = document.getElementById("btnReset");
  const btnSaveQRBase      = document.getElementById("btnSaveQRBase");

  /* --- Zeitplan aus localStorage wiederherstellen --- */
  const t = localStorage.getItem("sched_time");
  const d = localStorage.getItem("sched_dur");
  const b = localStorage.getItem("sched_brk");

  if (t) document.getElementById("sched-time").value = t;
  if (d) document.getElementById("sched-dur").value = d;
  if (b) document.getElementById("sched-break").value = b;

  /* ==========================================================================
     QR-Basis speichern
  ========================================================================== */
  if (btnSaveQRBase) {
    btnSaveQRBase.addEventListener("click", () => {
      const base = document.getElementById("qrBase").value.trim();
      setQRBase(base);
      applyQRBaseToUI();
    });
  }

  /* ==========================================================================
     TEAMS LADEN
  ========================================================================== */
  if (btnLoadTeams) {
    btnLoadTeams.addEventListener("click", refreshTeams);
  }

  /* ==========================================================================
     TEAM HINZUFÜGEN
  ========================================================================== */
  if (btnAddTeam) {
    btnAddTeam.addEventListener("click", async () => {
      const nameEl  = document.getElementById("teamName");
      const groupEl = document.getElementById("teamGroup");
      if (!nameEl || !groupEl) return;

      const name  = nameEl.value.trim();
      const group = groupEl.value;

      if (!name) {
        showMsg("#teamsMsg", "Bitte Teamname eingeben.", true);
        return;
      }

      try {
        await addTeam(name, group);
        nameEl.value = "";
        await refreshTeams();
        showMsg("#teamsMsg", "Team hinzugefügt.");
      } catch (e) {
        showMsg("#teamsMsg", "Fehler: " + e.message, true);
      }
    });
  }

  /* ==========================================================================
     ALLE TEAMS LÖSCHEN
  ========================================================================== */
  if (btnDeleteAllTeams) {
    btnDeleteAllTeams.addEventListener("click", async () => {
      if (!confirm("Wirklich alle Teams löschen?")) return;

      try {
        await deleteAllTeams();
        await refreshTeams();
        showMsg("#teamsMsg", "Alle Teams gelöscht.");
      } catch (e) {
        showMsg("#teamsMsg", "Fehler: " + e.message, true);
      }
    });
  }

  /* ==========================================================================
     MATCHES LADEN
  ========================================================================== */
  if (btnLoadMatches) {
    btnLoadMatches.addEventListener("click", refreshMatches);
  }

  /* ==========================================================================
     SPIELPLAN ZURÜCKSETZEN
  ========================================================================== */
  if (btnReset) {
    btnReset.addEventListener("click", async () => {
      if (!confirm("Spielplan wirklich zurücksetzen?")) return;

      try {
        await resetMatches();
        await refreshMatches();
        showMsg("#timeMsg", "Spielplan gelöscht.");
      } catch (e) {
        showMsg("#timeMsg", "Fehler: " + e.message, true);
      }
    });
  }

  /* ==========================================================================
     EXPORT / IMPORT
  ========================================================================== */
  const btnExportTeams = document.getElementById("btnExportTeams");
  const btnImportTeams = document.getElementById("btnImportTeams");
  const importFile     = document.getElementById("importFile");

  // Export
  if (btnExportTeams) {
    btnExportTeams.addEventListener("click", exportTeamsToFile);
  }

  // Import
  if (btnImportTeams && importFile) {
    btnImportTeams.addEventListener("click", () => importFile.click());

    importFile.addEventListener("change", async () => {
      if (importFile.files.length === 0) return;
      await importTeamsFromFile(importFile.files[0]);
      importFile.value = ""; // Reset
    });
  }

  /* ==========================================================================
     INITIALER DATENLADEN
  ========================================================================== */
  await refreshTeams();
  await refreshMatches();
});
