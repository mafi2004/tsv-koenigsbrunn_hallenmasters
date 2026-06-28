// /public/festival/admin.js
// -----------------------------------------------------------------------------
// Festival Admin – OHNE MATCHES
// -----------------------------------------------------------------------------

const socket = io("/festival");

socket.on("festival:teams:updated", loadTeams);
socket.on("festival:meta:updated", loadFieldCount);

// -------------------------------------------------------------
// TEAMS
// -------------------------------------------------------------
async function loadTeams() {
  const res = await fetch("/api/festival/teams");
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
  await fetch(`/api/festival/teams/${id}/wins`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wins: Number(wins) })
  });
}

async function addTeam() {
  const name = document.getElementById("teamName").value.trim();
  if (!name) return;

  await fetch("/api/festival/teams", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });

  document.getElementById("teamName").value = "";
  loadTeams();
}

async function deleteTeam(id) {
  await fetch(`/api/festival/teams/${id}`, { method: "DELETE" });
  loadTeams();
}

async function deleteAllTeams() {
  await fetch(`/api/festival/teams`, { method: "DELETE" });
  loadTeams();
}

// -------------------------------------------------------------
// FELDER
// -------------------------------------------------------------
async function loadFieldCount() {
  const res = await fetch("/api/festival/meta");
  const data = await res.json();

  const fc = data?.festival?.fieldCount;
  document.getElementById("fieldInfo").textContent =
    fc ? `Aktuelle Feldanzahl: ${fc}` : "Noch keine Feldanzahl gesetzt.";
}

async function saveFieldCount() {
  const fieldCount = Number(document.getElementById("fieldCount").value);
  if (!fieldCount) return;

  await fetch("/api/festival/meta", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fieldCount })
  });

  loadFieldCount();
}

// -------------------------------------------------------------
// NEUVERTEILUNG
// -------------------------------------------------------------
async function redistribute() {
  const res = await fetch("/api/festival/meta");
  const meta = await res.json();
  const fieldCount = meta?.festival?.fieldCount;

  if (!fieldCount) {
    alert("Bitte zuerst die Feldanzahl setzen!");
    return;
  }

  await fetch("/api/festival/redistribute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fieldCount })
  });

  loadTeams();
}

// -------------------------------------------------------------
// INITIAL LOAD
// -------------------------------------------------------------
loadTeams();
loadFieldCount();
