// /public/festival/admin.js
// -----------------------------------------------------------------------------
// Festival Admin – Teams, Felder, Spieltyp (3v3 / 5v5)
// -----------------------------------------------------------------------------

// Modus automatisch aus URL bestimmen (g1 oder g2)
const mode = window.location.pathname.split("/")[2];

// Socket.io Namespace für dieses Festival
const socket = io(`/festival_${mode}`);

socket.on("festival:teams:updated", loadTeams);
socket.on("festival:meta:updated", () => {
  loadFieldCount();
  loadGameType();
});

// -------------------------------------------------------------
// TEAMS
// -------------------------------------------------------------
async function loadTeams() {
  const res = await fetch(`/api/festival/${mode}/teams`);
  const teams = await res.json();

  const tbody = document.querySelector("#teamTable tbody");
  tbody.innerHTML = "";

  teams.forEach(t => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${t.id}</td>
      <td>${t.name}</td>
      <td>
        <input type="number" min="0" value="${t.wins || 0}"
               onchange="updateWins(${t.id}, this.value)" />
      </td>
      <td>${t.field ?? "-"}</td>
      <td>
        <button class="danger" onclick="deleteTeam(${t.id})">X</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function updateWins(id, wins) {
  await fetch(`/api/festival/${mode}/teams/${id}/wins`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wins: Number(wins) })
  });
}

async function addTeam() {
  const name = document.getElementById("teamName").value.trim();
  if (!name) return;

  await fetch(`/api/festival/${mode}/teams`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });

  document.getElementById("teamName").value = "";
  loadTeams();
}

async function deleteTeam(id) {
  await fetch(`/api/festival/${mode}/teams/${id}`, { method: "DELETE" });
  loadTeams();
}

async function deleteAllTeams() {
  await fetch(`/api/festival/${mode}/teams`, { method: "DELETE" });
  loadTeams();
}

// -------------------------------------------------------------
// FELDER
// -------------------------------------------------------------
async function loadFieldCount() {
  const res = await fetch(`/api/festival/${mode}/meta`);
  const data = await res.json();

  const fc = data?.festival?.fieldCount;
  document.getElementById("fieldInfo").textContent =
    fc ? `Aktuelle Feldanzahl: ${fc}` : "Noch keine Feldanzahl gesetzt.";
}

async function saveFieldCount() {
  const fieldCount = Number(document.getElementById("fieldCount").value);
  if (!fieldCount) return;

  await fetch(`/api/festival/${mode}/meta`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fieldCount })
  });

  loadFieldCount();
}

// -------------------------------------------------------------
// SPIELTYP (3v3 / 5v5)
// -------------------------------------------------------------
async function loadGameType() {
  const res = await fetch(`/api/festival/${mode}/meta`);
  const data = await res.json();

  const gt = data?.festival?.gameType || "3v3";
  document.getElementById("gameType").value = gt;
}

async function saveGameType() {
  const gameType = document.getElementById("gameType").value;

  await fetch(`/api/festival/${mode}/meta`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gameType })
  });

  loadGameType();
}

// -------------------------------------------------------------
// NEUVERTEILUNG
// -------------------------------------------------------------
async function redistribute() {
  const res = await fetch(`/api/festival/${mode}/meta`);
  const meta = await res.json();
  const fieldCount = meta?.festival?.fieldCount;

  if (!fieldCount) {
    alert("Bitte zuerst die Feldanzahl setzen!");
    return;
  }

  await fetch(`/api/festival/${mode}/redistribute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fieldCount })
  });

  loadTeams();
}

// -------------------------------------------------------------
// Festival Settings
// -------------------------------------------------------------
async function loadGameSettings() {
  const res = await fetch(`/api/festival/${mode}/meta`);
  const data = await res.json();
  const m = data?.festival || {};

  document.getElementById("startTime").value    = m.startTime    || "";
  document.getElementById("gameDuration").value = m.gameDuration || "";
  document.getElementById("gameCount").value    = m.gameCount    || "";
}

async function saveGameSettings() {
  const startTime    = document.getElementById("startTime").value;
  const gameDuration = Number(document.getElementById("gameDuration").value);
  const gameCount    = Number(document.getElementById("gameCount").value);

  await fetch(`/api/festival/${mode}/meta`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ startTime, gameDuration, gameCount })
  });

  loadGameSettings();
}

async function loadAgeGroup() {
  const res = await fetch(`/api/festival/${mode}/meta`);
  const data = await res.json();
  const m = data?.festival || {};

  document.getElementById("ageGroup").value = m.ageGroup || "";
}

async function saveAgeGroup() {
  const ageGroup = document.getElementById("ageGroup").value;

  await fetch(`/api/festival/${mode}/meta`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ageGroup })
  });

  loadAgeGroup();
}



// -------------------------------------------------------------
// INITIAL LOAD
// -------------------------------------------------------------
loadTeams();
loadFieldCount();
loadGameType();
loadGameSettings();
loadAgeGroup();
