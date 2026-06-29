// /public/festival/viewer.js
// -----------------------------------------------------------------------------
// Festival Viewer – ausgelagerte Logik
// -----------------------------------------------------------------------------

// Modus automatisch aus URL bestimmen (g1 oder g2)
const mode = window.location.pathname.split("/")[2];

// Socket.io Namespace für dieses Festival
const socket = io(`/festival_${mode}`);

async function load() {
  const res = await fetch(`/api/festival/${mode}/teams`);
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

// -------------------------------------------------------------
// SPIELTYP LADEN (3v3 / 5v5) UND HINTERGRUNDBILD SETZEN
// -------------------------------------------------------------
async function loadGameType() {
  const res = await fetch(`/api/festival/${mode}/meta`);
  const data = await res.json();

  const gt = data?.festival?.gameType || "3v3";

  const img = document.getElementById("bgImage");

  if (gt === "3v3") {
    img.src = "/assets/TSV_Gelände_3vs3.jpg";
  } else {
    img.src = "/assets/TSV_Gelände_5vs5.jpg";
  }
}

// -------------------------------------------------------------
// FELDANZAHL LADEN (optional für Anzeige)
// -------------------------------------------------------------
async function loadFieldCount() {
  const res = await fetch(`/api/festival/${mode}/meta`);
  const data = await res.json();

  const fc = data?.festival?.fieldCount;
  // Falls du später eine Anzeige willst, hier wäre der Platz.
}

// -------------------------------------------------------------
// Festival Setting LADEN
// -------------------------------------------------------------
async function loadGameInfo() {
  const res = await fetch(`/api/festival/${mode}/meta`);
  const data = await res.json();
  const m = data?.festival || {};

  const info = document.getElementById("gameInfo");

  const start = m.startTime    ? `Start: ${m.startTime}` : "";
  const dur   = m.gameDuration ? `Dauer: ${m.gameDuration} min` : "";
  const cnt   = m.gameCount    ? `Spiele: ${m.gameCount}` : "";

  info.textContent = [start, dur, cnt].filter(Boolean).join(" | ");
}


// -------------------------------------------------------------
// LIVE-EVENTS
// -------------------------------------------------------------
socket.on("festival:teams:updated", load);
socket.on("festival:meta:updated", () => {
  loadGameType();
  loadGameInfo();
  loadFieldCount();
});

// -------------------------------------------------------------
// INITIAL LOAD
// -------------------------------------------------------------
load();
loadGameType();
loadFieldCount();
loadGameInfo();