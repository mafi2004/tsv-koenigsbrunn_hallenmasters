// public/5v5/minis5_admin.js

const API_BASE = window.location.origin + '/api/minis5';

// Passwortschutz
document.addEventListener("DOMContentLoaded", () => {
  const overlay = document.getElementById("pwOverlay");
  const input = document.getElementById("pwInput");
  const btn = document.getElementById("pwBtn");
  const err = document.getElementById("pwError");

  // Auto-Fokus
  input.focus();

  // Enter-Taste
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") btn.click();
  });

  // Prüfen, ob Passwort schon gespeichert wurde
	if (localStorage.getItem("admin_pw_ok") === "1") {
	  overlay.style.display = "none";
	}

	// Beim erfolgreichen Login speichern
	btn.addEventListener("click", () => {
	  if (input.value === window.ADMIN_PASSWORD) {
		localStorage.setItem("admin_pw_ok", "1");
		overlay.style.display = "none";
	  } else {
		err.style.display = "block";
		setTimeout(() => err.style.display = "none", 2000);
	  }
	});

});


/* -------------------------------------------------------
   Helper
------------------------------------------------------- */
async function safeFetch(path, init) {
  const res = await fetch(API_BASE + path, init);
  if (!res.ok) {
    let txt = '';
    try { txt = await res.text(); } catch {}
    throw new Error('HTTP ' + res.status + ' ' + res.statusText + (txt ? ': ' + txt : ''));
  }
  return res.json();
}

function showMsg(selectorOrEl, text, isError) {
  const el = typeof selectorOrEl === 'string'
    ? document.querySelector(selectorOrEl)
    : selectorOrEl;

  if (!el) return;

  el.textContent = text;
  el.style.display = 'inline-block';
  el.style.borderColor = isError ? 'var(--danger)' : 'var(--accent)';
  el.style.color = isError ? '#fecaca' : '#86efac';

  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.display = 'none'; }, 3500);
}

function groupClass(g) {
  const x = String(g || '').trim().toUpperCase();
  if (x === 'A') return 'grpA';
  if (x === 'B') return 'grpB';
  return '';
}

/* -------------------------------------------------------
   API Aliases
------------------------------------------------------- */
const loadTeams = () => safeFetch('/teams', { method: 'GET' });
const addTeam = (name, groupName) =>
  safeFetch('/teams', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, groupName })
  });
const deleteTeam = (id) => safeFetch('/teams/' + encodeURIComponent(id), { method: 'DELETE' });
const deleteAllTeams = () => safeFetch('/teams', { method: 'DELETE' });

const loadMatches = () => safeFetch('/matches', { method: 'GET' });
const resetMatches = () => safeFetch('/matches/reset', { method: 'DELETE' });

const generateAllMatches = (schedule) =>
  safeFetch('/matches/generateAll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ schedule })
  });

const setWinner = (matchId, winner) =>
  safeFetch('/winner', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ matchId, winner })
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
  const grid = document.getElementById('teamsGrid');
  grid.innerHTML = '';

  const order = ['A', 'B'];
  const groupsOrdered = groups.slice().sort((a, b) => order.indexOf(a) - order.indexOf(b));

  groupsOrdered.forEach(g => {
    const card = document.createElement('div');
    card.className = 'teamCard ' + groupClass(g);

    const head = document.createElement('div');
    head.className = 'teamCardHeader';

    const badge = document.createElement('span');
    badge.className = 'teamBadge ' + groupClass(g);
    badge.textContent = 'Gruppe ' + g;

    const count = document.createElement('span');
    count.className = 'teamCount';
    count.textContent = '0 Team(s)';

    head.append(badge, count);
    card.appendChild(head);

    const ul = document.createElement('ul');
    ul.className = 'teamList';
    ul.id = `teams-list-${g}`;
    card.appendChild(ul);

    grid.appendChild(card);
  });
}

function renderTeams() {
  const groupsSet = new Set(
    TEAMS.map(t => String(t.groupName || '').trim().toUpperCase()).filter(Boolean)
  );
  const groups = groupsSet.size ? Array.from(groupsSet) : ['A', 'B'];

  buildTeamsGrid(groups);

  groups.forEach(g => {
    const ul = document.getElementById(`teams-list-${g}`);
    if (ul) ul.innerHTML = '';
  });

  TEAMS.forEach(t => {
    const g = String(t.groupName || '').trim().toUpperCase();
    const ul = document.getElementById(`teams-list-${g}`);
    if (!ul) return;

    const li = document.createElement('li');
    li.className = 'teamItem';

    const dot = document.createElement('span');
    dot.className = 'teamDot ' + groupClass(g);

    const name = document.createElement('span');
    name.textContent = t.name;

    const del = document.createElement('button');
    del.className = 'btn btn-danger';
    del.textContent = 'Löschen';
    del.style.marginLeft = 'auto';
    del.addEventListener('click', async () => {
      try {
        await deleteTeam(t.id);
        await refreshTeams();
      } catch (e) {
        showMsg('#teamsMsg', 'Fehler: ' + e.message, true);
      }
    });

    li.append(dot, name, del);
    ul.appendChild(li);
  });

  // Update counts
  groups.forEach(g => {
    const count = TEAMS.filter(t => String(t.groupName).toUpperCase() === g).length;
    const card = document.querySelector(`.teamCard.${groupClass(g)} .teamCount`);
    if (card) card.textContent = `${count} Team(s)`;
  });
}

async function refreshTeams() {
  try {
    TEAMS = await loadTeams();
    renderTeams();
  } catch (e) {
    showMsg('#teamsMsg', 'Fehler: ' + e.message, true);
  }
}

/* -------------------------------------------------------
   Matches Rendering
------------------------------------------------------- */
function renderMatches() {
  const tbody = document.querySelector('#matchesTable tbody');
  tbody.innerHTML = '';

  MATCHES.forEach(m => {
    const tr = document.createElement('tr');
    const cls = groupClass(m.groupName);
    if (cls) tr.classList.add(cls);

    const taName = m.teamA_name || m.teamA || '';
    const tbName = m.teamB_name || m.teamB || '';
    const winnerText = m.winner
      ? (Number(m.winner) === Number(m.teamA) ? taName : tbName)
      : '–';

    tr.innerHTML = `
      <td>${m.id}</td>
      <td><span class="pill ${cls}">${m.groupName}</span></td>
      <td>${m.plannedStart || '–'}</td>
      <td>${m.field}</td>
      <td>${taName}</td>
      <td>${tbName}</td>
      <td>${winnerText}</td>
      <td class="row">
        <button class="btn ${cls}" data-action="winA" data-id="${m.id}" data-team="${m.teamA}">Sieger A</button>
        <button class="btn ${cls}" data-action="winB" data-id="${m.id}" data-team="${m.teamB}">Sieger B</button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.id);
      const team = Number(btn.dataset.team);
      try {
        await setWinner(id, team);
        await refreshMatches();
      } catch (e) {
        showMsg('#timeMsg', 'Fehler: ' + e.message, true);
      }
    });
  });
}

async function refreshMatches() {
  try {
    MATCHES = await loadMatches();
    renderMatches();
  } catch (e) {
    showMsg('#timeMsg', 'Fehler: ' + e.message, true);
  }
}

/* -------------------------------------------------------
   Schedule UI
------------------------------------------------------- */
function wireScheduleUI() {
  const btn = document.getElementById('sched-generate');
  btn.addEventListener('click', async () => {
    const timeHHMM = document.getElementById('sched-time').value;
    const dur = Number(document.getElementById('sched-dur').value);
    const brk = Number(document.getElementById('sched-break').value);

    if (!/^\d{2}:\d{2}$/.test(timeHHMM)) {
      showMsg('#timeMsg', 'Startzeit HH:MM ungültig.', true);
      return;
    }
    if (!Number.isFinite(dur) || dur <= 0 || !Number.isFinite(brk) || brk < 0) {
      showMsg('#timeMsg', 'Dauer/Pause ungültig.', true);
      return;
    }

    try {
      await generateAllMatches({ timeHHMM, dur, brk });
      await refreshMatches();
      showMsg('#timeMsg', 'Spielplan für A+B erzeugt.');
    } catch (e) {
      showMsg('#timeMsg', 'Fehler: ' + e.message, true);
    }
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

  const reload = () => refreshMatches();

  s.on('connect', reload);
  s.on('resultUpdate', reload);
  s.on('results:updated', reload);
  s.on('matches:updated', reload);
  s.on('winner:updated', reload);
}

/* -------------------------------------------------------
   Init
------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', async () => {
  wireScheduleUI();
  initSocket();

  document.getElementById('btnLoadTeams').addEventListener('click', refreshTeams);
  document.getElementById('btnAddTeam').addEventListener('click', async () => {
    const name = document.getElementById('teamName').value.trim();
    const group = document.getElementById('teamGroup').value;

    if (!name) {
      showMsg('#teamsMsg', 'Bitte Teamname eingeben.', true);
      return;
    }

    try {
      await addTeam(name, group);
      document.getElementById('teamName').value = '';
      await refreshTeams();
      showMsg('#teamsMsg', 'Team hinzugefügt.');
    } catch (e) {
      showMsg('#teamsMsg', 'Fehler: ' + e.message, true);
    }
  });

  document.getElementById('btnDeleteAllTeams').addEventListener('click', async () => {
    if (!confirm('Wirklich alle Teams löschen?')) return;
    try {
      await deleteAllTeams();
      await refreshTeams();
      showMsg('#teamsMsg', 'Alle Teams gelöscht.');
    } catch (e) {
      showMsg('#teamsMsg', 'Fehler: ' + e.message, true);
    }
  });

  document.getElementById('btnLoadMatches').addEventListener('click', refreshMatches);
  document.getElementById('btnReset').addEventListener('click', async () => {
    if (!confirm('Spielplan wirklich zurücksetzen?')) return;
    try {
      await resetMatches();
      await refreshMatches();
      showMsg('#timeMsg', 'Spielplan gelöscht.');
    } catch (e) {
      showMsg('#timeMsg', 'Fehler: ' + e.message, true);
    }
  });

  await refreshTeams();
  await refreshMatches();
});
