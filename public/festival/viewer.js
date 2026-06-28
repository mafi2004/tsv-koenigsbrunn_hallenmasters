// /public/festival/viewer.js
// -----------------------------------------------------------------------------
// Festival Viewer – ausgelagerte Logik
// -----------------------------------------------------------------------------

const socket = io("/festival");

async function load() {
  const res = await fetch("/api/festival/teams");
  const teams = await res.json();

  const container = document.getElementById("fieldsContainer");
  container.innerHTML = "";

  // Teams nach Feld gruppieren
  const fields = {};
  for (const t of teams) {
    if (!fields[t.field]) fields[t.field] = [];
    fields[t.field].push(t);
  }

  // Für jedes Feld eine Karte
  Object.keys(fields).sort((a,b)=>a-b).forEach(field => {
    const card = document.createElement("div");
    card.className = "fieldCard";

    card.innerHTML = `
      <div class="fieldTitle">Feld ${field}</div>
      ${fields[field].map(t => `
        <div class="teamRow">${t.name}</div>
      `).join("")}
    `;

    container.appendChild(card);
  });
}

socket.on("festival:teams:updated", load);

load();
