// public/5v5/minis5_admin.js

const API_BASE = window.location.origin + '/api/minis5';

/* -------------------------------------------------------
   Passwortschutz
------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  const overlay = document.getElementById("pwOverlay");
  const input = document.getElementById("pwInput");
  const btn = document.getElementById("pwBtn");
  const err = document.getElementById("pwError");

  if (!overlay || !input || !btn || !err) return;

  input.focus();

  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") btn.click();
  });

  if (localStorage.getItem("admin_pw_ok") === "1") {
    overlay.style.display = "none";
  }

  btn.addEventListener("click", () => {
    if (input.value === window.ADMIN_PASSWORD) {
      localStorage.setItem("admin_pw_ok", "1");
      overlay.style.display = "none";
    } else {
      err.style.display = "block";
      setTimeout(() => (err.style.display = "none"), 2000);
    }
  });
});

/* -------------------------------------------------------
   Status-Anzeige
------------------------------------------------------- */
const connState = document.getElementById("connState");

function setStatus(text, color) {
  if (!connState) return;
  connState.textContent = text;
  connState.style.color = color;
}

/* -------------------------------------------------------
   Helper
------------------------------------------------------- */
async function safeFetch(path, init) {
  const res = await fetch(API_BASE + path, init);
  if (!res.ok) {
    let txt = "";
    try {
      txt = await res.text();
    } catch {}
    throw new Error(
      "HTTP " +
        res.status +
        " " +
        res.statusText +
        (txt ? ": " + txt : "")
    );
  }
  return res.json();
}

function showMsg(selectorOrEl, text, isError) {
  const el =
    typeof selectorOrEl === "string"
      ? document.querySelector(selectorOrEl)
      : selectorOrEl;

  if (!el) return;

  el.textContent = text;
  el.style.display = "inline-block";
  el.style.borderColor = isError ? "var(--danger)" : "var(--accent)";
  el.style.color = isError ? "#fecaca" : "#86efac";

  clearTimeout(el._t);
  el._t = setTimeout(() => {
    el.style.display = "none";
  }, 3500);
}

function groupClass(g) {
  const x = String(g || "").trim().toUpperCase();
  if (x === "A") return "grpA";
  if (x === "B") return "grpB";
  return "";
}

/* -------------------------------------------------------
   API Aliases (5v5)
------------------------------------------------------- */
const loadTeams = () => safeFetch("/teams", { method: "GET" });

const addTeam = (name, groupName) =>
  safeFetch("/teams", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, groupName }),
  });

const deleteTeam = (id) =>
  safeFetch("/teams/" + encodeURIComponent(id), { method: "DELETE" });

const deleteAllTeams = () => safeFetch("/teams", { method: "DELETE" });

const loadMatches = () => safeFetch("/matches", { method: "GET" });

const resetMatches = () =>
  safeFetch("/matches", {
    method: "DELETE",
  });

const generateScheduleOnServer = (schedule) =>
  safeFetch("/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(schedule),
  });

const updateResult = (id, scoreA, scoreB) =>
  safeFetch("/updateResult", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, scoreA, scoreB }),
  });

/* -------------------------------------------------------
   State
------------------------------------------------------- */
let TEAMS = [];
let MATCHES = [];

/* -------------------------------------------------------
   Teams Rendering
------------------------------------------------------- */
function buildTeamsGrid(groups) {
  const grid = document.getElementById("teamsGrid");
  if (!grid) return;
  grid.innerHTML = "";

  const order = ["A", "B"];
  const groupsOrdered = groups
    .slice()
    .sort((a, b) => order.indexOf(a) - order.indexOf(b));

  groupsOrdered.forEach((g) => {
    const card = document.createElement("div");
    card.className = "teamCard " + groupClass(g);

    const head = document.createElement("div");
    head.className = "teamCardHeader";

    const badge = document.createElement("span");
    badge.className = "teamBadge " + groupClass(g);
    badge.textContent = "Gruppe " + g;

    const count = document.createElement("span");
    count.className = "teamCount";
    count.textContent = "0 Team(s)";

    head.append(badge, count);
    card.appendChild(head);

    const ul = document.createElement("ul");
    ul.className = "teamList";
    ul.id = `teams-list-${g}`;
    card.appendChild(ul);

    grid.appendChild(card);
  });
}

function renderTeams() {
  const groupsSet = new Set(
    TEAMS.map((t) =>
      String(t.groupName || "")
        .trim()
        .toUpperCase()
    ).filter(Boolean)
  );
  const groups = groupsSet.size ? Array.from(groupsSet) : ["A", "B"];

  buildTeamsGrid(groups);

  groups.forEach((g) => {
    const ul = document.getElementById(`teams-list-${g}`);
    if (ul) ul.innerHTML = "";
  });

  TEAMS.forEach((t) => {
    const g = String(t.groupName || "").trim().toUpperCase();
    const ul = document.getElementById(`teams-list-${g}`);
    if (!ul) return;

    const li = document.createElement("li");
    li.className = "teamItem";

    const dot = document.createElement("span");
    dot.className = "teamDot " + groupClass(g);

    const name = document.createElement("span");
    name.textContent = t.name;

    const del = document.createElement("button");
    del.className = "btn btn-danger";
    del.textContent = "Löschen";
    del.style.marginLeft = "auto";
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

  // Counts aktualisieren
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

async function refreshTeams() {
  try {
    TEAMS = await loadTeams();
    renderTeams();
  } catch (e) {
    showMsg("#teamsMsg", "Fehler: " + e.message, true);
  }
}

/* -------------------------------------------------------
   Matches Rendering (mit Toreingabe)
------------------------------------------------------- */
function renderMatches() {
  const tbody = document.querySelector("#matchesTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  MATCHES.forEach((m) => {
    const tr = document.createElement("tr");
    const cls = groupClass(m.groupName);
    if (cls) tr.classList.add(cls);

    const taName = m.teamA_name || m.teamA || "";
    const tbName = m.teamB_name || m.teamB || "";

    tr.innerHTML = `
      <td>${m.id}</td>
      <td><span class="pill ${cls}">${m.groupName}</span></td>
      <td>${m.plannedStart || "–"}</td>
      <td>${m.field}</td>
      <td>${taName}</td>
      <td>${tbName}</td>
      <td>
        <input type="number" class="scoreInput" data-id="${m.id}" data-team="A" value="${
      m.scoreA ?? ""
    }">
      </td>
      <td>
        <input type="number" class="scoreInput" data-id="${m.id}" data-team="B" value="${
      m.scoreB ?? ""
    }">
      </td>
    `;

    tbody.appendChild(tr);
  });

  initScoreInputs();
}

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

async function refreshMatches() {
  try {
    MATCHES = await loadMatches();
    renderMatches();
  } catch (e) {
    showMsg("#timeMsg", "Fehler: " + e.message, true);
  }
}

/* -------------------------------------------------------
   Schedule UI (Zeitplan → Spielplan)
------------------------------------------------------- */
function wireScheduleUI() {
  const btn = document.getElementById("sched-generate");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    const timeHHMM = document.getElementById("sched-time").value;
    const dur = Number(document.getElementById("sched-dur").value);
    const brk = Number(document.getElementById("sched-break").value);

    if (!/^\d{2}:\d{2}$/.test(timeHHMM)) {
      showMsg("#timeMsg", "Startzeit HH:MM ungültig.", true);
      return;
    }
    if (!Number.isFinite(dur) || dur <= 0 || !Number.isFinite(brk) || brk < 0) {
      showMsg("#timeMsg", "Dauer/Pause ungültig.", true);
      return;
    }

    try {
      await generateScheduleOnServer({ timeHHMM, dur, brk });
      await refreshMatches();
      showMsg("#timeMsg", "Spielplan für A+B erzeugt.");
    } catch (e) {
      showMsg("#timeMsg", "Fehler: " + e.message, true);
    }
  });
}

/* -------------------------------------------------------
   Socket.IO Live Updates
------------------------------------------------------- */
function initSocket() {
  if (typeof io !== "function") return;

  const s = io(window.location.origin, {
    path: "/socket.io",
    transports: ["websocket", "polling"],
    reconnectionAttempts: 10,
    timeout: 10000,
  });

  s.on("connect", () => {
    setStatus("verbunden", "#22c55e");
  });

  s.on("disconnect", () => {
    setStatus("getrennt", "#ef4444");
  });

  s.on("matches:updated", () => {
    setStatus("Update empfangen", "#22c55e");
    refreshMatches();
    setTimeout(() => setStatus("verbunden", "#22c55e"), 1500);
  });
}

/* -------------------------------------------------------
   Init
------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", async () => {
  wireScheduleUI();
  initSocket();

  const btnLoadTeams = document.getElementById("btnLoadTeams");
  const btnAddTeam = document.getElementById("btnAddTeam");
  const btnDeleteAllTeams = document.getElementById("btnDeleteAllTeams");
  const btnLoadMatches = document.getElementById("btnLoadMatches");
  const btnReset = document.getElementById("btnReset");

  if (btnLoadTeams) {
    btnLoadTeams.addEventListener("click", refreshTeams);
  }

  if (btnAddTeam) {
    btnAddTeam.addEventListener("click", async () => {
      const nameEl = document.getElementById("teamName");
      const groupEl = document.getElementById("teamGroup");
      if (!nameEl || !groupEl) return;

      const name = nameEl.value.trim();
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

  if (btnLoadMatches) {
    btnLoadMatches.addEventListener("click", refreshMatches);
  }

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

  await refreshTeams();
  await refreshMatches();
});
