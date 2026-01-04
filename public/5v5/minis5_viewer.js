// public/5v5/minis5_viewer.js

const API_BASE = window.location.origin + '/api/minis5';

const connState = document.getElementById("connState");

function setStatus(text, color) {
    connState.textContent = text;
    connState.style.color = color;
}


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
      const m = ms.find(x => Number(x.field) === f) || null;
      const tile = document.createElement('div');
      tile.className = 'tile';

      if (m) {
        const cls = groupClass(m.groupName);

        const top = document.createElement('div');
        top.className = 'tileTop';
        top.innerHTML = `
          <span class="pill ${cls}">Gruppe ${m.groupName}</span>
          <span>Feld ${m.field}</span>
        `;

        const ta = m.teamA_name || m.teamA || '';
        const tb = m.teamB_name || m.teamB || '';
        const winner = m.winner
          ? (Number(m.winner) === Number(m.teamA) ? ta : tb)
          : null;

        const main = document.createElement('div');
        main.className = 'tileMain';
        main.textContent = winner
          ? `${ta} vs ${tb} – Sieger: ${winner}`
          : `${ta} vs ${tb}`;

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

  matches.forEach(m => {
    const tr = document.createElement('tr');
    const cls = groupClass(m.groupName);
    if (cls) tr.classList.add(cls);

    const ta = m.teamA_name || m.teamA || '';
    const tb = m.teamB_name || m.teamB || '';
    const winner = m.winner
      ? (Number(m.winner) === Number(m.teamA) ? ta : tb)
      : '–';

    tr.innerHTML = `
      <td>${m.id}</td>
      <td><span class="pill ${cls}">${m.groupName}</span></td>
      <td>${m.plannedStart || '–'}</td>
      <td>${m.field}</td>
      <td>${ta}</td>
      <td>${tb}</td>
      <td>${winner}</td>
    `;

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
   Socket.IO Live Updates
------------------------------------------------------- */
function initSocket() {
  if (typeof io !== 'function') return;

  const s = io(window.location.origin, {
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
  
  // Verbindung hergestellt
  s.on("connect", () => {
    setStatus("verbunden", "#22c55e"); // grün
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
