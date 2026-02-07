// public/5v5/minis5_viewer.js

const API_BASE = window.location.origin + '/api/minis5';

const connState = document.getElementById("connState");

const trophy = `<span style="color:#facc15; margin-left:6px;">🏆</span>`;

let MIRROR_MODE = false; 

function setStatus(text, color) {
    connState.textContent = text;
    connState.style.color = color;
}

// Ansicht spiegeln
function toggleMirror() { MIRROR_MODE = document.getElementById("mirrorView").checked; refreshAll(); }

/* -------------------------------------------------------
   Helper
------------------------------------------------------- */
async function safeFetch(path) {
  const res = await fetch(API_BASE + path);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

function groupClass(g) {
  const x = String(g || '').trim().toUpperCase();
  if (x === 'A') return 'grpA';
  if (x === 'B') return 'grpB';
  return '';
}

function hhmmToNum(h) {
  const m = /^(\d{2}):(\d{2})$/.exec(h || '');
  if (!m) return Number.POSITIVE_INFINITY;
  return Number(m[1]) * 60 + Number(m[2]);
}

/* -------------------------------------------------------
   Navigation
------------------------------------------------------- */
function initNav() {
  const buttons = document.querySelectorAll('.navBtn');
  const pages = document.querySelectorAll('.page');

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.page;

      buttons.forEach(b => b.classList.toggle('navBtn-active', b === btn));
      pages.forEach(p => {
        p.classList.toggle('page-active', p.id === 'page-' + page);
      });
    });
  });
}

/* -------------------------------------------------------
   Tiles Rendering (2 Felder)
------------------------------------------------------- */
function renderTiles(matches) {
  const cont = document.getElementById('tilesContainer');
  cont.innerHTML = '';

  if (!Array.isArray(matches) || !matches.length) {
    cont.textContent = 'Noch keine Spiele geplant.';
    return;
  }

  const rowsByTime = new Map();
  matches.forEach(m => {
    const t = m.plannedStart || '–';
    if (!rowsByTime.has(t)) rowsByTime.set(t, []);
    rowsByTime.get(t).push(m);
  });

  const times = Array.from(rowsByTime.keys()).sort((a, b) => hhmmToNum(a) - hhmmToNum(b));
  
  const upcoming = matches.filter(m => !m.winner).slice(0, 2);
  const upcomingIds = upcoming.map(m => m.id);

  times.forEach(time => {
    const rowEl = document.createElement('div');
    rowEl.className = 'tilesRow';

    const timeCol = document.createElement('div');
    timeCol.className = 'timeCol';
    timeCol.textContent = time;
    rowEl.appendChild(timeCol);

    const grid = document.createElement('div');
    grid.className = 'grid2';

    const ms = rowsByTime.get(time).sort((a, b) => Number(a.field) - Number(b.field));
	
    for (let f = 1; f <= 2; f++) {
	  var fieldNo = f;
	  if (MIRROR_MODE) { if (fieldNo === 1) fieldNo = 2; else if (fieldNo === 2) fieldNo = 1; }
      const m = ms.find(x => Number(x.field) === fieldNo) || null;
      const tile = document.createElement('div');
      tile.className = 'tile';
	  if (upcomingIds.includes(m.id)) {
		tile.classList.add("currentMatch");
	  }

      if (m) {
        const cls = groupClass(m.groupName);

        const top = document.createElement('div');
        top.className = 'tileTop';
        top.innerHTML = `
          <span class="pill ${cls}">Gruppe ${m.groupName}</span>
          <span>Feld ${m.field}</span>
        `;

        const main = document.createElement('div');
        main.className = 'tileMain';
        let ta = m.teamA_name || m.teamA || '';
		let tb = m.teamB_name || m.teamB || '';

		if (m.winner === 'A') ta = `${trophy} ` + ta;
		if (m.winner === 'B') tb += ` ${trophy}`;

		main.innerHTML = `
		  <span class="teamA">${ta}</span>
		  <span class="teamB">${tb}</span>
		`;

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
        tile.textContent = '–';
      }

      grid.appendChild(tile);
    }

    rowEl.appendChild(grid);
    cont.appendChild(rowEl);
  });
}

/* -------------------------------------------------------
   Table Rendering
------------------------------------------------------- */
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

/* -------------------------------------------------------
   Teams Rendering
------------------------------------------------------- */
function renderTeams(teams) {
  const grid = document.getElementById('teamsGrid');
  grid.innerHTML = '';

  const groups = ['A', 'B'];

  groups.forEach(g => {
    const card = document.createElement('div');
    card.className = 'teamCard ' + groupClass(g);

    const head = document.createElement('div');
    head.className = 'teamCardHeader';

    const badge = document.createElement('span');
    badge.className = 'teamBadge ' + groupClass(g);
    badge.textContent = 'Gruppe ' + g;

    const count = document.createElement('span');
    count.className = 'teamCount';
    const c = teams.filter(t => String(t.groupName).toUpperCase() === g).length;
    count.textContent = `${c} Team(s)`;

    head.append(badge, count);
    card.appendChild(head);

    const ul = document.createElement('ul');
    ul.className = 'teamList';

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

/* -------------------------------------------------------
   Hallenlayout Rendering
------------------------------------------------------- */
function updateHallenlayout(matches) {
  const img = document.getElementById("hallImage");
  if (MIRROR_MODE) {
    img.src = "/assets/bg_hallenmasters_Gym2_mirrored.jpg";
  } else {
    img.src = "/assets/bg_hallenmasters_Gym2.jpg"; 
  }	
	
  document.querySelectorAll('.team-overlay').forEach(el => {
	  el.textContent = '';
	  el.className = 'team-overlay';
  });
  
  if (!matches || matches.length === 0) return;
  const current = matches.filter(m => !m.winner).slice(0, 2);

  current.forEach(m => {
	  var fieldNo = m.field;
	  if (MIRROR_MODE) { if (fieldNo === 1) fieldNo = 2; else if (fieldNo === 2) fieldNo = 1; }
	  var elA = document.getElementById(`field${fieldNo}-teamA`);
	  var elB = document.getElementById(`field${fieldNo}-teamB`);
	  if (MIRROR_MODE) {
		elB = document.getElementById(`field${fieldNo}-teamA`);
		elA = document.getElementById(`field${fieldNo}-teamB`);
	  }
	  if (elA){
		  elA.textContent = m.teamA_name || '';
		  if (m.groupName) elA.classList.add(`group-${m.groupName.toUpperCase()}`);
	  }
	  
	  if (elB){
		  elB.textContent = m.teamB_name || '';
		  if (m.groupName) elB.classList.add(`group-${m.groupName.toUpperCase()}`);
	  }
  });
}

/* -------------------------------------------------------
   Socket.IO Live Updates
------------------------------------------------------- */
function initSocket() {
  if (typeof io !== 'function') return;

  const s = io("/minis5", {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 10,
    timeout: 10000
  });

  const reload = () => refreshAll();

  s.on('connect', reload);
  s.on('resultUpdate', reload);
  s.on('results:updated', reload);
  s.on('matches:updated', reload);
  s.on('winner:updated', reload);
  s.on('teams:updated', reload);
  
  s.on("reset-5v5", () => { location.reload(); });
  s.on("reset-all", () => { location.reload(); });
  
  // Verbindung hergestellt
  s.on("connect", () => {
    setStatus("verbunden", "#22c55e"); // grün
  });
  
  s.on("viewerCount5", count => {
    const el = document.getElementById("viewerCount");
    if (el) el.textContent = "Zuschauer online: " + count;
  });

  // Verbindung verloren
  s.on("disconnect", () => {
    setStatus("getrennt", "#ef4444"); // rot
  });

  // Server sendet Updates
  s.on("matches:updated", () => {
    setStatus("Update empfangen", "#22c55e");
    setTimeout(() => setStatus("verbunden", "#22c55e"), 1500);
  });

  // Falls du winner:updated nutzt
  s.on("winner:updated", () => {
    setStatus("Update empfangen", "#22c55e");
    setTimeout(() => setStatus("verbunden", "#22c55e"), 1500);
  });
}

function initAdTile() {
  const tile = document.getElementById("adTile");
  const header = document.getElementById("adHeader");
  const body = document.getElementById("adBody");
  const icon = tile.querySelector(".adToggleIcon");

  header.addEventListener("click", () => {
    const expanded = tile.getAttribute("aria-expanded") === "true";
    tile.setAttribute("aria-expanded", !expanded);
    body.style.display = expanded ? "none" : "block";
    icon.textContent = expanded ? "›" : "‹";
  });
}

document.addEventListener("DOMContentLoaded", initAdTile);

function initRulesTile() {
  const tile = document.getElementById("rulesTile");
  const header = document.getElementById("rulesHeader");
  const body = document.getElementById("rulesBody");
  const icon = tile.querySelector(".rulesToggleIcon");

  header.addEventListener("click", () => {
    const expanded = tile.getAttribute("aria-expanded") === "true";
    tile.setAttribute("aria-expanded", !expanded);
    body.style.display = expanded ? "none" : "block";
    icon.textContent = expanded ? "›" : "‹";
  });
}
document.addEventListener("DOMContentLoaded", initRulesTile);


/* -------------------------------------------------------
   Refresh All
------------------------------------------------------- */
async function refreshAll() {
  try {
    const matches = await safeFetch('/matches');
    const teams = await safeFetch('/teams');

    renderTiles(matches);
    renderTable(matches);
    renderTeams(teams);
	updateHallenlayout(matches);
  } catch (e) {
    const cont = document.getElementById('tilesContainer');
    cont.textContent = 'Fehler beim Laden: ' + e.message;
  }
}

/* -------------------------------------------------------
   Init
------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  initSocket();
  initNav();
  refreshAll();
  setInterval(refreshAll, 20000);
});
