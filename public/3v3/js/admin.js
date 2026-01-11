
/* Admin – 3v3
 * Alle JS-Logik in EINER Datei konsolidiert.
 * Assets bleiben unter /assets, API unter /api, Socket.IO unter /socket.io.
 */

/* ===== Logo ===== */
const LOGO_PATH = '/assets/Fussballwappen_logo.png';
function setLogo(){
  const img = document.getElementById('clubLogo');
  const pathEl = document.getElementById('logoPathText');
  const errEl  = document.getElementById('logoError');
  if (!img || !pathEl) return;
  const url = LOGO_PATH + cacheBust();
  pathEl.textContent = LOGO_PATH;
  img.onload = () => { if (errEl) errEl.style.display = 'none'; };
  img.onerror = () => { if (errEl) errEl.style.display = 'inline-flex'; };
  img.src = url;
}
function initHeader(){ setLogo(); }

/* ===== QR / Viewer-Link (ersetzt frühere qr_script.js minimal) ===== */
const QR_BASE_KEY = 'viewer.qr.base';
function getQRBase(){ return (localStorage.getItem(QR_BASE_KEY) || '').trim(); }
function setQRBase(v){ localStorage.setItem(QR_BASE_KEY, (v || '').trim()); }
function buildViewerUrl(base){
  const host = (base || '').trim();
  // Wenn nur IP angegeben, nimm http://
  const hasProto = /^https?:\/\//i.test(host);
  const urlBase = hasProto ? host : ('http://' + host);
  if (host)
	return urlBase.replace(/\/+$/,'') + '/3v3/viewer.html';
  
  const is5v5 = window.location.pathname.includes('/5v5/');
  const viewerPath = is5v5 ? '/5v5/viewer.html' : '/3v3/viewer';

  const fullUrl = `https://tsv-koenigsbrunn-hallenmasters.onrender.com${viewerPath}`;
  return fullUrl;
}

// Hilfsfunktion für Cache-Busting
const cacheBust = () => `?_v=${Date.now()}`;

function applyQRBaseToUI(){
  const base = getQRBase(); // kommt aus deinem LocalStorage (Eingabefeld)
  const input = document.getElementById('qrBase');
  const a = document.getElementById('viewerLink');
  const img = document.getElementById('qr-img');

  if (input) input.value = base;

  // Viewer-URL aus Basis bauen (http(s)://host:port + /3v3/viewer.html)
  const url = buildViewerUrl(base);
  if (a) { a.href = url || '#'; a.textContent = 'Viewer öffnen'; }

  if (img) {
    if (url) {
      // PNG von /api/qr beziehen (Größe optional ändern: 128/256/512)
      const endpoint = `/api/qr?text=${encodeURIComponent(url)}&size=64${cacheBust()}`;
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

function wireQRBase(){
  document.getElementById('btnSaveQRBase')?.addEventListener('click', () => {
    const val = (document.getElementById('qrBase').value || '').trim();
    setQRBase(val);
    applyQRBaseToUI();
  });
}

/* ===== APIs ===== */
const API_BASE = window.location.origin + '/api';

async function safeFetch(path, init) {
  const url = API_BASE + path;
  const res = await fetch(url, init);
  if (!res.ok) {
    let text = ''; try { text = await res.text(); } catch {}
    throw new Error('HTTP ' + res.status + ' ' + res.statusText + (text ? ': ' + text : ''));
  }
  return res.json();
}

const apiTeamsList      = () => safeFetch('/teams', { method:'GET' });
const apiTeamsDeleteAll = () => safeFetch('/teams', { method:'DELETE' });
const apiTeamAdd        = (name, groupName) => safeFetch('/teams', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name, groupName }) });
const apiTeamDelete     = (id) => safeFetch('/teams/' + encodeURIComponent(id), { method:'DELETE' });

const apiMatchesList    = () => safeFetch('/matches', { method:'GET' });
const apiGroupStart     = async (group) => {
  const schedule = getSchedule();
  if (!schedule) throw new Error('Kein gültiger Zeitplan konfiguriert.');
  return safeFetch('/matches/start/' + encodeURIComponent(group), {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ schedule })
  });
};
const apiMatchesReset   = () => safeFetch('/matches/reset', { method:'DELETE' });

const apiWinnerSet      = (matchId, winnerTeamId) => safeFetch('/results/winner', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ matchId, winner: winnerTeamId }) });

const apiNextRound      = async (groupName, results) => {
  const schedule = getSchedule();
  if (!schedule) throw new Error('Kein gültiger Zeitplan konfiguriert.');
  return safeFetch('/funino/nextRound', {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ groupName, results, schedule })
  });
};

const apiScheduleRecalc = (schedule) =>
  safeFetch('/schedule/recalculate', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ schedule }) });

const apiReseedGroups = (schedule) =>
  safeFetch('/funino/reseedGroups', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ schedule }) });

const apiHistoryLatest     = (group) => safeFetch('/history/latest/' + encodeURIComponent(group), { method:'GET' });
const apiHistorySetWinner  = (historyId, winner) => safeFetch('/history/' + encodeURIComponent(historyId) + '/winner', {
  method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ winner })
});
const apiRebuildCurrRound  = (group) => safeFetch('/funino/rebuildCurrentRound', {
  method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ groupName: group })
});

const apiOpsList       = (limit=200) => safeFetch('/adminOps/ops?limit=' + encodeURIComponent(limit), { method:'GET' });
const apiSnapList      = () => safeFetch('/adminOps/snapshots', { method:'GET' });
const apiSnapCreate    = () => safeFetch('/adminOps/snapshot', { method:'POST' });
const apiRecoverLatest = () => safeFetch('/adminOps/recover', { method:'POST' });
const apiRecoverById   = (id) => safeFetch('/adminOps/recover/' + encodeURIComponent(id), { method:'POST' });

/* Meta */
const apiMetaGet = () => safeFetch('/meta', { method:'GET' });
const apiMetaSet = (yearLabel, schedule) =>
  safeFetch('/meta', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ yearLabel, schedule }) });

/* Aliases */
const loadTeams      = apiTeamsList;
const deleteAllTeams = apiTeamsDeleteAll;
const addTeam        = apiTeamAdd;
const deleteTeam     = apiTeamDelete;

const loadMatches    = apiMatchesList;
const startGroup     = apiGroupStart;
const resetMatches   = apiMatchesReset;

const setWinner      = apiWinnerSet;
const nextRoundReq   = apiNextRound;

const loadHistoryLatest = apiHistoryLatest;
const setHistoryWinner  = apiHistorySetWinner;
const rebuildCurrentRound = apiRebuildCurrRound;

const loadOps        = apiOpsList;
const loadSnapshots  = apiSnapList;
const makeSnapshot   = apiSnapCreate;
const recoverLatest  = apiRecoverLatest;
const recoverById    = apiRecoverById;

/* ===== State / Helpers ===== */
let TEAMS = [];
let MATCHES = [];
let HISTORY = { groupName:null, round:null, batchId:null, items:[] };
let SNAPSHOTS = [];
let OPS = [];
let YEAR_LABEL = null;

function groupClass(g){
  const x = String(g || '').trim().toUpperCase();
  switch (x) { case 'A':return 'grpA'; case 'B':return 'grpB'; case 'C':return 'grpC'; case 'D':return 'grpD'; case 'E':return 'grpE'; case 'F':return 'grpF'; default:return ''; }
}
function showMsg(selectorOrEl, text, isError){
  const el = typeof selectorOrEl==='string' ? document.querySelector(selectorOrEl) : selectorOrEl;
  if(!el) return; el.textContent = text; el.style.display='inline-block';
  el.style.borderColor = isError ? 'var(--danger)' : 'var(--accent)';
  el.style.color = isError ? '#fecaca' : '#86efac';
  clearTimeout(el._t); el._t = setTimeout(() => { el.style.display='none'; }, 3500);
}
function fmtTs(ts){ try { return new Date(ts).toLocaleString(); } catch { return ts; } }
function setAdminYearLabel(label){
  YEAR_LABEL = (label ?? '').trim() || null;
  const text = YEAR_LABEL ? ('Jahrgang: ' + YEAR_LABEL) : 'Jahrgang: –';
  const el = document.getElementById('adminYearLabel');
  const el2 = document.getElementById('adminYearLabelHead');
  if (el)  { el.style.display='inline-block';  el.textContent = text; }
  if (el2) { el2.style.display='inline-block'; el2.textContent = text; }
  const fld = document.getElementById('yearLabelInput');
  if (fld && fld.value.trim() !== (YEAR_LABEL ?? '')) {
    fld.value = YEAR_LABEL ?? '';
  }
}

/* ===== Zeitmanagement ===== */
const SCHED_KEY = 'admin.schedule.v2';
function loadSchedule(){ try { return JSON.parse(localStorage.getItem(SCHED_KEY) || 'null'); } catch { return null; } }
function saveSchedule(cfg){ localStorage.setItem(SCHED_KEY, JSON.stringify(cfg)); }
function getSchedule(){
  const s = loadSchedule();
  if(!s) return null;
  if(!/^\d{2}:\d{2}$/.test(s.timeHHMM)) return null;
  if(!Number.isFinite(s.dur) || s.dur <= 0) return null;
  if(!Number.isFinite(s.brk) || s.brk < 0) return null;
  return s;
}
function fillScheduleUI(){
  const cfg = loadSchedule() || {};
  const time = document.getElementById('sched-time');
  const dur  = document.getElementById('sched-dur');
  const brk  = document.getElementById('sched-break');
  if (time && cfg.timeHHMM) time.value = cfg.timeHHMM;
  if (dur  && Number.isFinite(cfg.dur)) dur.value = cfg.dur;
  if (brk  && Number.isFinite(cfg.brk)) brk.value = cfg.brk;
}
function wireScheduleUI(){
  const btn = document.getElementById('sched-save');
  btn && btn.addEventListener('click', async () => {
    const timeHHMM = document.getElementById('sched-time').value;
    const dur = Number(document.getElementById('sched-dur').value);
    const brk = Number(document.getElementById('sched-break').value);
    if (!/^\d{2}:\d{2}$/.test(timeHHMM)) { showMsg('#timeMsg', 'Bitte Startzeit im Format HH:MM setzen.', true); return; }
    if (!Number.isFinite(dur) || dur <= 0) { showMsg('#timeMsg', 'Dauer (min) ungültig.', true); return; }
    if (!Number.isFinite(brk) || brk < 0) { showMsg('#timeMsg', 'Pause (min) ungültig.', true); return; }
    const schedule = { timeHHMM, dur, brk };
    saveSchedule(schedule);
    showMsg('#timeMsg', 'Zeitplan gespeichert. Berechne Zeiten ...');
    try {
      await apiMetaSet(YEAR_LABEL, schedule);
      await apiScheduleRecalc(schedule);
      await refreshMatches();
      showMsg('#timeMsg', 'Zeiten aktualisiert.');
    }
    catch(e) { showMsg('#timeMsg', 'Recalc-Fehler: ' + e.message, true); }
  });
}

/* ===== Teams ===== */
function buildTeamsGrid(groups){
  const grid = document.getElementById('teamsGrid');
  grid.innerHTML = '';
  const order = ['A','B','C','D','E','F'];
  const groupsOrdered = groups.slice().sort((a,b)=> order.indexOf(a) - order.indexOf(b));
  groupsOrdered.forEach(g => {
    const card = document.createElement('div'); card.className = 'card';
    const badge = document.createElement('span'); badge.className = 'pill ' + groupClass(g);
    badge.textContent = 'Gruppe ' + g; badge.style.marginBottom = '.5rem'; card.appendChild(badge);
    const wrap = document.createElement('div'); wrap.className = 'table-wrap';
    const table = document.createElement('table'); table.id = `teams-table-${g}`;
    const thead = document.createElement('thead'); thead.innerHTML = `
      <tr><th style="width:80px;">ID</th><th>Name</th><th style="width:160px;">Aktion</th></tr>`;
    table.appendChild(thead);
    const tbody = document.createElement('tbody'); tbody.id = `teams-tbody-${g}`; table.appendChild(tbody);
    wrap.appendChild(table); card.appendChild(wrap); grid.appendChild(card);
  });
  document.querySelectorAll('[id^="teams-table-"]').forEach(tbl => {
    tbl.addEventListener('click', async (e) => {
      const btn = e.target.closest('button'); if(!btn) return;
      if(btn.dataset.action === 'delete'){
        try { await deleteTeam(btn.dataset.id); await refreshTeams(); }
        catch (err) { showMsg('#teamsMsg', 'Fehler beim Löschen: ' + err.message, true); }
      }
    });
  });
}
function renderTeams(){
  const groupsSet = new Set(TEAMS.map(t => String(t.groupName || '').trim().toUpperCase()).filter(Boolean));
  const groups = groupsSet.size ? Array.from(groupsSet) : ['A','B','C'];
  buildTeamsGrid(groups);
  groups.forEach(g => { const tbody = document.getElementById(`teams-tbody-${g}`); if (tbody) tbody.innerHTML = ''; });
  TEAMS.forEach(t => {
    const g = String(t.groupName || '').trim().toUpperCase();
    const tbody = document.getElementById(`teams-tbody-${g}`); if (!tbody) return;
    const tr = document.createElement('tr');
    const cls = groupClass(t.groupName); if (cls) tr.classList.add(cls);
    const tdId = document.createElement('td'); tdId.textContent = t.id ?? '';
    const tdName = document.createElement('td'); tdName.textContent = t.name ?? '';
    const tdAction = document.createElement('td');
    const btnDel = document.createElement('button');
    btnDel.className='btn btn-danger'; btnDel.type='button';
    btnDel.dataset.action='delete'; btnDel.dataset.id=String(t.id);
    btnDel.textContent='Löschen';
    tdAction.appendChild(btnDel);
    tr.appendChild(tdId); tr.appendChild(tdName); tr.appendChild(tdAction);
    tbody.appendChild(tr);
  });
}
async function refreshTeams(){ try { TEAMS = await loadTeams(); renderTeams(); } catch(e){ showMsg('#teamsMsg', 'Fehler: '+e.message, true); } }

/* ===== Matches (Sieger-Spalte entfernt) ===== */
function renderMatches(){
  const tbody = document.querySelector('#matchesTable tbody');
  if (!tbody) return; tbody.innerHTML = '';
  if (!Array.isArray(MATCHES)) { showMsg('#nextMsg', 'Spieldaten ungültig (kein Array).', true); return; }
  MATCHES.forEach(m => {
    const tr = document.createElement('tr'); const cls = groupClass(m.groupName); if (cls) tr.classList.add(cls);
    const id=m?.id??'', g=m?.groupName??'', r=m?.round??'', f=m?.field??'';
    const taId=m?.teamA_id??null, tbId=m?.teamB_id??null;
    const taName=m?.teamA ?? (taId!=null?String(taId):''), tbName=m?.teamB ?? (tbId!=null?String(tbId):'');
    const planned=m?.plannedStart??'–'; const w=m && typeof m.winner!=='undefined' ? m.winner : null; const hasW = w!==null && w!==undefined;
    const td =(t)=>{ const el=document.createElement('td'); el.textContent=t; return el; };
    const tdGroup=document.createElement('td'); const badge=document.createElement('span'); badge.className='pill '+groupClass(g); badge.textContent=g; tdGroup.appendChild(badge);
    const tdA=document.createElement('td'); const wrapA=document.createElement('span'); wrapA.className='teamNameWrap';
    const winA=hasW && Number(w)===Number(taId); if(winA){ const ico=document.createElement('span'); ico.className='winIcon'; ico.textContent='🏆'; ico.setAttribute('aria-label','Sieger'); const txt=document.createElement('span'); txt.className='winnerText'; txt.textContent=taName; wrapA.append(ico,txt);} else { const txt=document.createElement('span'); txt.className='loserText'; txt.textContent=taName; wrapA.append(txt);} tdA.replaceChildren(wrapA);
    const tdB=document.createElement('td'); const wrapB=document.createElement('span'); wrapB.className='teamNameWrap';
    const winB=hasW && Number(w)===Number(tbId); if(winB){ const ico=document.createElement('span'); ico.className='winIcon'; ico.textContent='🏆'; ico.setAttribute('aria-label','Sieger'); const txt=document.createElement('span'); txt.className='winnerText'; txt.textContent=tbName; wrapB.append(ico,txt);} else { const txt=document.createElement('span'); txt.className='loserText'; txt.textContent=tbName; wrapB.append(txt);} tdB.replaceChildren(wrapB);
    const tdAct=document.createElement('td'); tdAct.className='row';
    const btnA=document.createElement('button'); btnA.className='btn '+groupClass(g); btnA.type='button'; btnA.dataset.action='winA'; btnA.dataset.id=String(id); if(taId!=null) btnA.dataset.team=String(taId); btnA.textContent='Sieger: Team A';
    const btnB=document.createElement('button'); btnB.className='btn '+groupClass(g); btnB.type='button'; btnB.dataset.action='winB'; btnB.dataset.id=String(id); if(tbId!=null) btnB.dataset.team=String(tbId); btnB.textContent='Sieger: Team B';
    tdAct.append(btnA, btnB);
    tr.append(td(id), tdGroup, td(r), td(f), td(planned), tdA, tdB, tdAct);
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = Number(e.currentTarget.dataset.id);
      const winnerId = Number(e.currentTarget.dataset.team);
      if (!Number.isFinite(id) || !Number.isFinite(winnerId)) { alert('Ungültige Match-/Team-ID.'); return; }
      try { await setWinner(id, winnerId); await refreshMatches(); }
      catch (err) { alert('Fehler beim Setzen des Siegers: ' + err.message); }
    });
  });
}
async function refreshMatches(){ try { MATCHES = await loadMatches(); renderMatches(); } catch(e){ showMsg('#nextMsg', 'Fehler: '+e.message, true); } }

/* ===== History ===== */
function renderHistory(){
  const tbody = document.querySelector('#historyTable tbody');
  if (!tbody) return; tbody.innerHTML='';
  const items = Array.isArray(HISTORY.items) ? HISTORY.items : [];
  if (!items.length){
    const tr=document.createElement('tr'); const td=document.createElement('td'); td.colSpan=6; td.textContent='Keine History vorhanden.'; tr.appendChild(td); tbody.appendChild(tr); return;
  }
  items.forEach((h, idx) => {
    const tr=document.createElement('tr');
    const td=(t)=>{ const el=document.createElement('td'); el.textContent=t; return el; };
    const tdField = td(h.field ?? '');
    const tdIdx = td(String(idx+1));
    const tdGR  = td(`${h.groupName ?? ''} · R${h.round ?? ''}`);
    const tdA=document.createElement('td'); const wrapA=document.createElement('span'); wrapA.className='teamNameWrap';
    const aIsW = Number(h.winner)===Number(h.teamA);
    if (aIsW){ const ico=document.createElement('span'); ico.className='winIcon'; ico.textContent='🏆'; ico.setAttribute('aria-label','Sieger'); const txt=document.createElement('span'); txt.className='winnerText'; txt.textContent=h.teamA_name ?? h.teamA ?? ''; wrapA.append(ico,txt); } else { const txt=document.createElement('span'); txt.className='loserText'; txt.textContent=h.teamA_name ?? h.teamA ?? ''; wrapA.append(txt); }
    tdA.replaceChildren(wrapA);
    const tdB=document.createElement('td'); const wrapB=document.createElement('span'); wrapB.className='teamNameWrap';
    const bIsW = Number(h.winner)===Number(h.teamB);
    if (bIsW){ const ico=document.createElement('span'); ico.className='winIcon'; ico.textContent='🏆'; ico.setAttribute('aria-label','Sieger'); const txt=document.createElement('span'); txt.className='winnerText'; txt.textContent=h.teamB_name ?? h.teamB ?? ''; wrapB.append(ico,txt); } else { const txt=document.createElement('span'); txt.className='loserText'; txt.textContent=h.teamB_name ?? h.teamB ?? ''; wrapB.append(txt); }
    tdB.replaceChildren(wrapB);
    const tdAct=document.createElement('td'); tdAct.className='row';
    const btnA=document.createElement('button'); btnA.className='btn '+groupClass(h.groupName); btnA.type='button'; btnA.textContent='Sieger: Team A';
    btnA.addEventListener('click', async () => { try { await setHistoryWinner(h.id, h.teamA); showMsg('#histMsg', `#${idx+1}: Sieger → Team A gespeichert.`); await loadHistoryUI(); } catch(e){ showMsg('#histMsg','Fehler: '+e.message, true);} });
    const btnB=document.createElement('button'); btnB.className='btn '+groupClass(h.groupName); btnB.type='button'; btnB.textContent='Sieger: Team B';
    btnB.addEventListener('click', async () => { try { await setHistoryWinner(h.id, h.teamB); showMsg('#histMsg', `#${idx+1}: Sieger → Team B gespeichert.`); await loadHistoryUI(); } catch(e){ showMsg('#histMsg','Fehler: '+e.message, true);} });
    tdAct.append(btnA, btnB);
    tr.append(tdIdx, tdGR, tdField, tdA, tdB, tdAct);
    tbody.appendChild(tr);
  });
}
async function loadHistoryUI(){
  const g = (document.getElementById('hist-group').value || '').trim().toUpperCase();
  try { HISTORY = await loadHistoryLatest(g); renderHistory(); }
  catch(e){ showMsg('#histMsg', 'History-Fehler: ' + e.message, true); }
}
function clearHistoryUI(){
  HISTORY = { groupName: (document.getElementById('hist-group')?.value || '').toUpperCase(), round:null, batchId:null, items:[] };
  renderHistory();
  const el = document.getElementById('histMsg');
  if (el) { el.style.display = 'inline-block'; el.textContent = 'History zurückgesetzt.'; setTimeout(() => el.style.display='none', 2000); }
}

/* ===== Snapshots / Ops ===== */
function renderSnapshots(){
  const sel = document.getElementById('snapshotSelect'); if (!sel) return;
  sel.innerHTML = '';
  if (!Array.isArray(SNAPSHOTS) || SNAPSHOTS.length===0){
    const opt=document.createElement('option'); opt.value=''; opt.textContent='– keine Snapshots –'; sel.appendChild(opt); return;
  }
  const hint=document.createElement('option'); hint.value=''; hint.textContent='Snapshot wählen …'; hint.disabled=true; hint.selected=true; sel.appendChild(hint);
  SNAPSHOTS.forEach(s => { const opt=document.createElement('option'); opt.value=String(s.id); opt.textContent=`#${s.id} · ${fmtTs(s.ts)} · ${s.path}`; sel.appendChild(opt); });
}
function renderOps(){
  const sel = document.getElementById('opsSelect'); const detailsBox=document.getElementById('opDetails'); if(!sel||!detailsBox) return;
  sel.innerHTML=''; detailsBox.textContent='–';
  if (!Array.isArray(OPS) || OPS.length===0){
    const opt=document.createElement('option'); opt.value=''; opt.textContent='– keine Operationen –'; sel.appendChild(opt); return;
  }
  const hint=document.createElement('option'); hint.value=''; hint.textContent='Operation wählen …'; hint.disabled=true; hint.selected=true; sel.appendChild(hint);
  OPS.slice().reverse().forEach(op => { const opt=document.createElement('option'); opt.value=String(op.id); opt.textContent=`#${op.id} · ${op.op} · ${fmtTs(op.ts)}`; opt.dataset.payload=op.payload??''; opt.dataset.status=op.status??''; sel.appendChild(opt); });
}
async function refreshSnapshots(){ try { SNAPSHOTS = await loadSnapshots(); renderSnapshots(); } catch(e){ showMsg('#recMsg','Snapshots laden fehlgeschlagen: '+e.message, true);} }
async function refreshOps(){ try { OPS = await loadOps(200); renderOps(); } catch(e){ showMsg('#recMsg','Ops laden fehlgeschlagen: '+e.message, true);} }

/* ===== Next Round / Socket / UI ===== */
function computeNextRoundPayloadFromTop3(){
  if (!Array.isArray(MATCHES)) throw new Error('Keine Spieldaten geladen.');
  const top3 = MATCHES.slice(0,3);
  if (top3.length !== 3) throw new Error('Mindestens 3 Spiele erforderlich.');
  const groupName = String(top3[0]?.groupName || '').trim();
  if (!groupName) throw new Error('Gruppe der obersten Spiele nicht ermittelbar.');
  const allSame = top3.every(m => String(m?.groupName || '').trim() === groupName);
  if (!allSame) throw new Error('Die obersten 3 Spiele gehören nicht zur gleichen Gruppe.');
  const results = top3.map(m => {
    const teamAId = Number(m?.teamA_id);
    const teamBId = Number(m?.teamB_id);
    const wRaw = m?.winner;
    if (wRaw == null) throw new Error('Für Spiel ' + (m?.id || '?') + ' ist kein Sieger gesetzt.');
    const winnerId = Number(wRaw);
    if (!Number.isFinite(winnerId)) throw new Error('Ungültiger Siegerwert bei Spiel ' + (m?.id || '?'));
    const loserId = (Number.isFinite(teamAId) && winnerId === teamAId) ? teamBId
                  : (Number.isFinite(teamBId) && winnerId === teamBId) ? teamAId
                  : NaN;
    if (!Number.isFinite(loserId)) throw new Error('Sieger gehört nicht zu Team A/B bei Spiel ' + (m?.id || '?'));
    return { winnerId, loserId, field: Number(m?.field) || undefined };
  });
  return { groupName, results };
}

function initSocket(){
  const s = window.io ? window.io(window.location.origin, {
    path:'/socket.io', transports:['websocket','polling'], reconnectionAttempts:10, timeout:10000
  }) : null;
  if (!s) return;

  const reloadMatches = () => refreshMatches();
  s.on('resultUpdate', reloadMatches);
  s.on('results:updated', reloadMatches);
  s.on('group:started',   reloadMatches);
  s.on('round:advanced',  reloadMatches);
  s.on('round:rebuilt',   reloadMatches);
  s.on('schedule:recalculated', reloadMatches);

  s.on('matches:reset', () => { reloadMatches(); clearHistoryUI(); });

  s.on('snapshot:created', async () => { await refreshSnapshots(); showMsg('#recMsg', 'Snapshot erstellt.'); });
  s.on('recovery:done', async () => {
    await refreshMatches();
    await loadHistoryUI();
    await refreshSnapshots();
    showMsg('#recMsg', 'Wiederherstellung abgeschlossen.');
  });

  s.on('meta:updated', (p) => { setAdminYearLabel(p?.yearLabel ?? YEAR_LABEL); });
}

function wireUI(){
  /* QR-Base */
  wireQRBase();

  /* Teams */
  document.getElementById('btnLoadTeams')?.addEventListener('click', refreshTeams);
  document.getElementById('btnDeleteAllTeams')?.addEventListener('click', async () => {
    if (!confirm('Wirklich ALLE Teams löschen?')) return;
    try { await deleteAllTeams(); showMsg('#teamsMsg', 'Alle Teams wurden gelöscht.'); await refreshTeams(); }
    catch (err) { showMsg('#teamsMsg', 'Fehler beim Löschen aller Teams: ' + err.message, true); }
  });
  document.getElementById('btnAddTeam')?.addEventListener('click', async () => {
    const name = (document.getElementById('teamName').value || '').trim();
    const groupName = document.getElementById('teamGroup').value;
    if (!name) { showMsg('#teamsMsg','Bitte Teamname eingeben.', true); return; }
    try { await addTeam(name, groupName); showMsg('#teamsMsg','Team hinzugefügt.'); document.getElementById('teamName').value=''; await refreshTeams(); }
    catch (err) { showMsg('#teamsMsg', 'Fehler: ' + err.message, true); }
  });

  /* Label speichern */
  document.getElementById('btnSaveYearLabel')?.addEventListener('click', async () => {
    const val = (document.getElementById('yearLabelInput').value || '').trim();
    setAdminYearLabel(val);
    showMsg('#yearLabelMsg', 'Label gespeichert.');
    try { await apiMetaSet(val || null, getSchedule() || null); } catch {}
  });

  /* Turnierdatei Import/Export */
  document.getElementById('btnImportTournament')?.addEventListener('click', async () => {
    const f = document.getElementById('tournamentFile')?.files?.[0];
    await importTournamentFile(f);
    document.getElementById('tournamentFile').value='';
  });
  document.getElementById('btnExportTournament')?.addEventListener('click', exportTournamentFile);

  /* Matches */
  document.getElementById('btnLoadMatches')?.addEventListener('click', refreshMatches);
  document.getElementById('btnReset')?.addEventListener('click', async () => {
    if (!confirm('Spielplan wirklich zurücksetzen?')) return;
    try {
      await resetMatches();
      await refreshMatches();
      clearHistoryUI();
    } catch (err) { alert('Fehler beim Reset: ' + err.message); }
  });

  document.getElementById('btnStartA')?.addEventListener('click', async () => { try { await startGroup('A'); await refreshMatches(); } catch (err) { alert('Fehler: ' + err.message); } });
  document.getElementById('btnStartB')?.addEventListener('click', async () => { try { await startGroup('B'); await refreshMatches(); } catch (err) { alert('Fehler: ' + err.message); } });
  document.getElementById('btnStartC')?.addEventListener('click', async () => { try { await startGroup('C'); await refreshMatches(); } catch (err) { alert('Fehler: ' + err.message); } });

  document.getElementById('btnNextRound')?.addEventListener('click', async () => {
    try {
      const p = computeNextRoundPayloadFromTop3();
      await nextRoundReq(p.groupName, p.results);
      showMsg('#nextMsg', 'Nächste Runde für Gruppe ' + p.groupName + ' generiert.');
      await refreshMatches();
    } catch (err) { showMsg('#nextMsg','Fehler: ' + err.message, true); }
  });

  /* History */
  document.getElementById('btnLoadHistory')?.addEventListener('click', loadHistoryUI);
  document.getElementById('btnApplyHistory')?.addEventListener('click', async () => {
    const g = (document.getElementById('hist-group').value || '').trim().toUpperCase();
    try {
      await rebuildCurrentRound(g);
      await refreshMatches();
      showMsg('#histMsg', 'Aktueller 3er‑Block im Haupt‑View aktualisiert.');
    } catch (e) { showMsg('#histMsg', 'Rebuild-Fehler: ' + e.message, true); }
  });

  /* Recovery & Snapshots */
  document.getElementById('btnMakeSnapshot')?.addEventListener('click', async () => {
    try { const r = await makeSnapshot(); showMsg('#recMsg', `Snapshot erstellt: ${r.path}`); await refreshSnapshots(); }
    catch (e) { showMsg('#recMsg', 'Snapshot-Fehler: ' + e.message, true); }
  });

  document.getElementById('btnRecoverLatest')?.addEventListener('click', async () => {
    if (!confirm('Neuesten Snapshot wiederherstellen? Dies überschreibt den aktuellen Stand.')) return;
    try {
      const r = await recoverLatest();
      showMsg('#recMsg', `Snapshot #${r.snapshotId} wiederhergestellt.`);
      await refreshMatches();
      await loadHistoryUI();
      await refreshSnapshots();
    } catch (e) { showMsg('#recMsg', 'Recovery-Fehler: ' + e.message, true); }
  });

  document.getElementById('btnRecoverSelected')?.addEventListener('click', async () => {
    const sel = document.getElementById('snapshotSelect'); const id = Number(sel?.value);
    if (!Number.isFinite(id)) { showMsg('#recMsg', 'Bitte einen Snapshot wählen.', true); return; }
    if (!confirm(`Snapshot #${id} wiederherstellen?`)) return;
    try {
      await recoverById(id);
      showMsg('#recMsg', `Snapshot #${id} wiederhergestellt.`);
      await refreshMatches();
      await loadHistoryUI();
      await refreshSnapshots();
    } catch (e) { showMsg('#recMsg', 'Recovery-Fehler: ' + e.message, true); }
  });

  /* Admin-Op Details */
  document.getElementById('opsSelect')?.addEventListener('change', (e) => {
    const sel = e.currentTarget; const opt = sel.options[sel.selectedIndex];
    const detailsBox = document.getElementById('opDetails');
    if (!opt || !opt.value) { detailsBox.textContent = '–'; return; }
    const id = opt.value; const status = opt.dataset.status || '';
    let payloadText = opt.dataset.payload || '';
    try { const obj = JSON.parse(payloadText); payloadText = JSON.stringify(obj, null, 2); } catch {}
    detailsBox.textContent =
`ID: ${id}
Operation: ${opt.textContent}
Status: ${status}

Payload:
${payloadText}`;
  });
  document.getElementById('btnShowOp')?.addEventListener('click', () => {
    const sel = document.getElementById('opsSelect'); if (!sel?.value) { showMsg('#recMsg', 'Bitte eine Operation wählen.', true); return; }
    alert(document.getElementById('opDetails').textContent || '–');
  });

  /* Reseed (D/E/F) */
  const btn = document.getElementById('btnReseedGroups');
  if (!btn) console.warn("btnReseedGroups fehlt im DOM!");
  btn?.addEventListener('click', async () => {
    const msgEl = document.getElementById('reseedMsg');
    const schedule = getSchedule();
    try {
      const r = await apiReseedGroups(schedule || {});
      const d = r?.result?.matchesCreated?.D ?? 0;
      const e = r?.result?.matchesCreated?.E ?? 0;
      const f = r?.result?.matchesCreated?.F ?? 0;
      showMsg(msgEl, (r?.msg || 'Gruppen neu zusammengestellt.') + ` (D:${d}, E:${e}, F:${f})`);
      await refreshTeams();
      await refreshMatches();
    } catch (e) { showMsg(msgEl, 'Reseed-Fehler: ' + (e?.message || e), true); }
  });

  /* Zeitplan */
  wireScheduleUI();
  fillScheduleUI();
}

/* ===== Tabs ===== */
function setupTabs(){
  const tabs = [
    { btn: document.getElementById('tab-teams'), panel: document.getElementById('panel-teams') },
    { btn: document.getElementById('tab-games'), panel: document.getElementById('panel-games') },
    { btn: document.getElementById('tab-recovery'), panel: document.getElementById('panel-recovery') },
  ];
  const activate = (idx) => {
    tabs.forEach((t,i) => {
      if(!t.btn || !t.panel) return;
      const on = i===idx;
      t.btn.setAttribute('aria-selected', on ? 'true' : 'false');
      t.panel.classList.toggle('active', on);
    });
  };
  tabs.forEach((t, i) => t.btn?.addEventListener('click', () => activate(i)));
  activate(0);
}

/* ===== Turnierdatei Import/Export ===== */
async function importTournamentFile(file){
  if (!file) { showMsg('#tournamentMsg','Bitte Turnierdatei wählen.',true); return; }
  try {
    const text = await file.text();
    const obj = JSON.parse(text);
    if (!obj || typeof obj !== 'object') throw new Error('Ungültige JSON-Struktur.');
    const yearLabel = String(obj?.meta?.yearLabel ?? '').trim() || null;
    const s = obj?.meta?.schedule;
    if (!s || !/^\d{2}:\d{2}$/.test(s.timeHHMM) || !Number.isFinite(Number(s.dur)) || Number(s.dur) <= 0 || !Number.isFinite(Number(s.brk)) || Number(s.brk) < 0) {
      throw new Error('Schedule fehlt/ungültig (timeHHMM, dur>0, brk>=0).');
    }
    const teamsArr = Array.isArray(obj?.teams) ? obj.teams : [];

    setAdminYearLabel(yearLabel);
    const fld = document.getElementById('yearLabelInput'); if (fld) fld.value = yearLabel ?? '';

    const schedule = { timeHHMM: s.timeHHMM, dur: Number(s.dur), brk: Number(s.brk) };
    saveSchedule(schedule);
    try { await apiMetaSet(yearLabel, schedule); } catch {}
    await apiScheduleRecalc(schedule);

    let added = 0;
    for (const t of teamsArr) {
      const name = String(t?.name ?? '').trim();
      const grp  = String(t?.groupName ?? '').trim().toUpperCase();
      if (!name || !grp) continue;
      try { await addTeam(name, grp); added++; } catch {}
    }

    showMsg('#tournamentMsg', `Turnierdatei importiert. Label: ${yearLabel ?? '–'} | Teams: ${added}/${teamsArr.length}`);
    await refreshTeams();
    await refreshMatches();
  } catch (e) {
    showMsg('#tournamentMsg','Import-Fehler: ' + e.message, true);
  }
}
async function exportTournamentFile(){
  try {
    const teams = await loadTeams();
    const schedLocal = loadSchedule();
    let meta = null; try { meta = await apiMetaGet(); } catch {}
    const schedule = {
      timeHHMM: schedLocal?.timeHHMM ?? meta?.schedule?.timeHHMM ?? null,
      dur:      schedLocal?.dur      ?? meta?.schedule?.dur      ?? null,
      brk:      schedLocal?.brk      ?? meta?.schedule?.brk      ?? null
    };
    const fld = document.getElementById('yearLabelInput');
    const labelFromUI = (fld?.value || '').trim() || null;
    const payload = {
      meta: { yearLabel: labelFromUI ?? YEAR_LABEL ?? meta?.yearLabel ?? null, schedule },
      teams: (teams || []).map(t => ({ name: t.name, groupName: t.groupName ?? null }))
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    const ts = new Date();
    const YYYY = ts.getFullYear();
    const MM = String(ts.getMonth()+1).padStart(2,'0');
    const DD = String(ts.getDate()).padStart(2,'0');
    const hh = String(ts.getHours()).padStart(2,'0');
    const mm = String(ts.getMinutes()).padStart(2,'0');
    const fn = `tournament_${(payload.meta.yearLabel||'label')}_${YYYY}${MM}${DD}_${hh}${mm}.json`.replace(/\s+/g,'_');
    a.href = URL.createObjectURL(blob);
    a.download = fn;
    a.click();
    URL.revokeObjectURL(a.href);
    showMsg('#tournamentMsg', 'Turnierdatei exportiert: ' + fn);
  } catch (e) {
    showMsg('#tournamentMsg', 'Export-Fehler: ' + e.message, true);
  }
}

/* ===== Passwortschutz (ersetzt admin_password.js) ===== */
document.addEventListener("DOMContentLoaded", () => {
  const overlay = document.getElementById("pwOverlay");
  const input = document.getElementById("pwInput");
  const btn = document.getElementById("pwBtn");
  const err = document.getElementById("pwError");

  input && input.focus();

  input?.addEventListener("keydown", (ev) => { if (ev.key === "Enter") btn?.click(); });

  if (localStorage.getItem("admin_pw_ok") === "1") { overlay && (overlay.style.display = "none"); }

  btn?.addEventListener("click", () => {
    if (input?.value === window.ADMIN_PASSWORD) {
      localStorage.setItem("admin_pw_ok", "1");
      overlay && (overlay.style.display = "none");
    } else {
      if (err) { err.style.display = "block"; setTimeout(() => err.style.display = "none", 2000); }
    }
  });
});

/* ===== Init ===== */
document.addEventListener('DOMContentLoaded', async () => {
  initHeader();
  setupTabs();
  wireUI();
  initSocket();

  // QR Base initial
  applyQRBaseToUI();

  // Meta laden
  try {
    const m = await apiMetaGet();
    setAdminYearLabel(m?.yearLabel ?? null);
    const fld = document.getElementById('yearLabelInput'); if (fld) fld.value = (m?.yearLabel ?? '');
    const local = loadSchedule();
    const s = m?.schedule;
    if (!local && s?.timeHHMM && Number.isFinite(Number(s?.dur)) && Number.isFinite(Number(s?.brk))) {
      saveSchedule({ timeHHMM: s.timeHHMM, dur: Number(s.dur), brk: Number(s.brk) });
      fillScheduleUI();
    } else {
      fillScheduleUI();
    }
  } catch {
    fillScheduleUI();
  }

  await refreshTeams();
  await refreshMatches();
  await loadHistoryUI();
  await refreshSnapshots();
  await refreshOps();
  setInterval(refreshMatches, 15000);
});
