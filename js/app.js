import * as C from './chain.js';
import { load, save, reset, esc, uid, getSession, setSession } from './store.js';

const app = document.getElementById('app');
let db = load(), me = null, page = 'dashboard', arg = null;
const cs = {};              // per-complaint on-chain view cache (history, verify results)
const busy = new Set();     // complaint ids currently being anchored
let busyTx = false, ac = null;
const filters = { q: '', s: 'all' };
const NAV = {
  citizen: [['dashboard', 'Overview'], ['new', 'New complaint'], ['list', 'My complaints']],
  police: [['dashboard', 'Complaint inbox']], investigator: [['dashboard', 'Complaint inbox']],
  admin: [['dashboard', 'Overview'], ['users', 'Accounts'], ['activity', 'Activity log'], ['chain', 'Blockchain']]
};
const CATS = ['Theft', 'Fraud / Cyber crime', 'Assault', 'Harassment', 'Missing person', 'Property dispute', 'Other'];
const VMSG = {
  'VERIFIED': 'The recalculated hash matches the hash recorded on Sepolia. The off-chain data is unchanged.',
  'MISMATCH': 'The off-chain data no longer matches the hash on-chain: it was changed after registration.',
  'NOT ANCHORED': 'No record with this ID exists on the contract, so nothing can be verified.',
  'VERIFICATION FAILED': 'The check could not complete (network/contract problem). This is NOT proof the complaint is valid.'
};
const ACTS = {
  review: { label: 'Start review', fn: 'startReview', from: [0] },
  info: { label: 'Request information', fn: 'requestInformation', from: [0, 1] },
  refer: { label: 'Refer complaint', fn: 'referComplaint', from: [0, 1, 2] },
  close: { label: 'Close case', fn: 'closeCase', from: [4, 5] }
};

// ---------- helpers ----------
const find = id => db.complaints.find(c => c.id === id);
const fmt = t => (t ? new Date(t).toLocaleString() : '—');
const link = (h, label) => `<a href="${C.ETHERSCAN}/tx/${h}" target="_blank" rel="noopener">${label || C.short(h)}</a>`;
const userName = id => db.users.find(u => u.id === id)?.name || '?';
function toast(msg, type = '') {
  const d = document.createElement('div'); d.className = type; d.textContent = msg;
  document.getElementById('toast').appendChild(d); setTimeout(() => d.remove(), type === 'err' ? 9000 : 4500);
}
function log(action, detail) {
  db.log.unshift({ t: Date.now(), by: me?.name || 'system', action, detail }); db.log = db.log.slice(0, 300); save(db);
}
const anchorBadge = r => r.anchor.state === 'anchored' ? '<span class="badge green">Anchored on Sepolia</span>' : '<span class="badge red">NOT anchored on-chain</span>';
const statusBadge = r => r.anchor.state === 'anchored' ? `<span class="badge or">${C.STATUS[r.chainStatus ?? 0]}</span>` : '<span class="badge">Local only</span>';
const head = t => `<div class="head"><h1>${t}</h1></div>`;

// ---------- chain actions ----------
async function syncChain(r) {
  try { const on = await C.readComplaint(r.complaintId); if (on) r.chainStatus = on.status; } catch (e) { console.error(e); }
}
async function doAnchor(id) {
  const r = find(id); if (!r || busy.has(id)) return;
  busy.add(id); r.anchor = { ...r.anchor, state: 'pending', error: null }; save(db); render();
  try {
    const res = await C.anchorComplaint(r, h => { r.anchor.txHash = h; save(db); toast('Transaction sent, waiting for confirmation…'); render(); });
    r.anchor = { state: 'anchored', txHash: r.anchor.txHash || null, existing: res.existing, at: Date.now() };
    await syncChain(r); log('Anchored complaint', r.ref); toast('Complaint anchored on Sepolia', 'ok');
  } catch (e) {
    console.error(e); r.anchor = { state: 'failed', txHash: r.anchor.txHash || null, error: C.friendly(e) };
    toast(r.anchor.error, 'err'); log('Anchoring failed', r.ref);
  } finally { busy.delete(id); delete cs[id]; save(db); render(); }
}
async function runTx(r, label, fn, args, role, onOk) {
  if (busyTx) return;
  if (!confirm(`${label}?\n\nThis sends a REAL transaction on Sepolia through MetaMask (costs test ETH).`)) return;
  busyTx = true; toast('Check MetaMask to confirm…');
  try {
    const rc = await C.sendTx(fn, args, role, () => toast('Transaction sent, waiting for confirmation…'));
    if (r) { r.txs = r.txs || []; r.txs.push({ label, hash: rc.hash, at: Date.now() }); onOk?.(); await syncChain(r); delete cs[r.id]; }
    log(label, r?.ref || ''); toast(label + ' confirmed', 'ok');
  } catch (e) { console.error(e); toast(C.friendly(e), 'err'); }
  finally { busyTx = false; save(db); render(); }
}
async function loadChain(id) {
  const r = find(id); if (!r) return; const prev = cs[id];
  cs[id] = { loading: true, verify: prev?.verify };
  try {
    const on = await C.readComplaint(r.complaintId);
    if (on) { r.chainStatus = on.status; cs[id].onchain = on; cs[id].history = await C.readHistory(r.complaintId); } else cs[id].notfound = true;
  } catch (e) { console.error(e); cs[id].error = C.friendly(e); }
  cs[id].loading = false; save(db); render();
}
async function loadAC() {
  ac = { loading: true };
  try { ac = await C.chainInfo(); } catch (e) { ac = { error: C.friendly(e) }; }
  render();
}

// ---------- views ----------
function loginView() {
  app.innerHTML = `<div class="login"><div class="brand big">Record<b>Safe</b></div><p style="text-align:center">Blockchain complaint &amp; FIR tracking · college demo</p>
  <div class="warn">Demo sign-in only: these are local profiles stored in this browser, not secure accounts. Real permissions are enforced by the smart contract against your MetaMask wallet.</div>
  <div class="grid">${db.users.map(u => `<div class="card"><h3>${esc(u.name)}</h3><span class="badge or">${u.role}</span> ${u.active ? '' : '<span class="badge red">disabled</span>'}
  <p class="muted mono">${esc(u.wallet || 'no wallet linked')}</p><button class="btn" data-act="login" data-id="${u.id}" ${u.active ? '' : 'disabled'}>Sign in</button></div>`).join('')}</div>
  <p><button class="btn ghost dark sm" data-act="reset">Reset demo data</button></p></div>`;
}
function shell(content) {
  const w = C.wallet;
  const net = !w.account ? '<span class="badge">Wallet not connected</span>' : w.chainId === C.CHAIN_ID ? '<span class="badge green">Sepolia</span>' : '<span class="badge red">Wrong network</span>';
  const banner = C.state.ok ? '' : `<div class="err"><b>Blockchain unavailable:</b> ${esc(C.state.error || 'initialising…')} <button class="btn sm" data-act="retryinit">Retry</button></div>`;
  return `<div class="shell"><aside><div class="brand">Record<b>Safe</b></div>
  ${NAV[me.role].map(([k, l]) => `<a href="#/${k}" class="${page === k ? 'on' : ''}">${l}</a>`).join('')}
  <div class="side-foot"><button class="btn ghost sm" data-act="reset">Reset demo data</button></div></aside>
  <section><header><span><b>${esc(me.name)}</b> <span class="badge or">${me.role}</span></span>${net}
  ${w.account ? `<span class="badge mono">${C.short(w.account)}</span>` : '<button class="btn sm dark" data-act="connect">Connect MetaMask</button>'}
  <button class="btn sm" data-act="logout">Sign out</button></header><main>${banner}${content}</main></section></div>`;
}
function metrics(list) {
  const an = list.filter(r => r.anchor.state === 'anchored');
  const m = [['Total complaints', list.length], ['Anchored on-chain', an.length], ['Not anchored', list.length - an.length], ['FIR registered', an.filter(r => r.chainStatus === 4).length], ['Closed', an.filter(r => r.chainStatus === 6).length]];
  return `<div class="grid" style="margin-bottom:14px">${m.map(([l, v]) => `<div class="metric"><b>${v}</b><span>${l}</span></div>`).join('')}</div>`;
}
const visible = () => me.role === 'citizen' ? db.complaints.filter(c => c.citizenId === me.id) : db.complaints;
function tableHTML() {
  const q = filters.q.toLowerCase();
  const l = visible().filter(r => {
    const okS = filters.s === 'all' || (filters.s === 'unanchored' ? r.anchor.state !== 'anchored' : r.anchor.state === 'anchored' && String(r.chainStatus ?? 0) === filters.s);
    return okS && (!q || (r.ref + r.title + r.category).toLowerCase().includes(q));
  }).sort((a, b) => b.createdAt - a.createdAt);
  if (!l.length) return '<p class="muted">No complaints found.</p>';
  return `<div class="tw"><table><thead><tr><th>Ref</th><th>Title</th><th>Category</th>${me.role !== 'citizen' ? '<th>Citizen</th>' : ''}<th>Blockchain</th><th>Status</th><th>Date</th><th></th></tr></thead><tbody>
  ${l.map(r => `<tr><td class="mono">${r.ref}</td><td>${esc(r.title)}</td><td>${esc(r.category)}</td>${me.role !== 'citizen' ? `<td>${esc(userName(r.citizenId))}</td>` : ''}<td>${anchorBadge(r)}</td><td>${statusBadge(r)}</td><td>${fmt(r.createdAt)}</td><td><a href="#/view/${r.id}">Open</a></td></tr>`).join('')}</tbody></table></div>`;
}
const listBlock = () => `<div class="bar"><input data-filter="q" placeholder="Search by reference, title or category" value="${esc(filters.q)}">
  <select data-filter="s"><option value="all">All statuses</option><option value="unanchored"${filters.s === 'unanchored' ? ' selected' : ''}>Not anchored</option>
  ${C.STATUS.map((s, i) => `<option value="${i}"${filters.s === String(i) ? ' selected' : ''}>${s}</option>`).join('')}</select></div><div id="tbl">${tableHTML()}</div>`;

function newView() {
  const today = new Date().toISOString().slice(0, 10);
  return head('Register a complaint') + `<div class="info">Submitting a complaint does <b>not</b> create an FIR. Police review it first; an FIR is a separate formal step. A fingerprint (hash) of this complaint is stored on the Sepolia blockchain; the text itself stays in this browser.</div>
  <form class="card" data-form="newComplaint"><label>Title</label><input name="title" maxlength="100" required>
  <label>Category</label><select name="category">${CATS.map(c => `<option>${c}</option>`).join('')}</select>
  <label>Description</label><textarea name="description" rows="5" maxlength="2000" required></textarea>
  <label>Incident date</label><input type="date" name="incidentDate" max="${today}" required>
  <label>General incident location</label><input name="location" maxlength="100" required placeholder="e.g. Andheri, Mumbai (no exact address)">
  <p><button class="btn" type="submit">Submit &amp; anchor on blockchain</button></p></form>`;
}
function detailView(id) {
  const r = find(id);
  if (!r || (me.role === 'citizen' && r.citizenId !== me.id)) return '<div class="card">Complaint not found.</div>';
  const v = cs[id] || {}, an = r.anchor.state === 'anchored', isBusy = busy.has(id);
  const txs = [...(r.anchor.txHash ? [{ label: 'Registration', hash: r.anchor.txHash }] : []), ...(r.txs || [])];
  const vr = v.verify;
  return `<a href="#/${me.role === 'citizen' ? 'list' : 'dashboard'}">← Back</a>
  <div class="head"><div><h1>${esc(r.title)}</h1><span class="muted">${r.ref} · ${esc(userName(r.citizenId))}</span></div><div>${anchorBadge(r)} ${statusBadge(r)}</div></div>
  <div class="info">A complaint is not an FIR. ${r.firNumber ? `FIR registered: <b>${esc(r.firNumber)}</b> (its hash is recorded on-chain).` : 'No FIR has been registered for this complaint.'}</div>
  <div class="card"><h3>Complaint details (off-chain, this browser)</h3><dl><dt>Category</dt><dd>${esc(r.category)}</dd><dt>Description</dt><dd>${esc(r.description)}</dd><dt>Incident date</dt><dd>${esc(r.incidentDate)}</dd><dt>Location</dt><dd>${esc(r.location)}</dd><dt>Submitted</dt><dd>${fmt(r.createdAt)}</dd></dl></div>
  <div class="card"><h3>Blockchain record</h3><p class="muted">The contract stores the complaint ID, a content hash and status history, not the complaint text.</p>
  <dl><dt>Complaint ID</dt><dd class="mono">${r.complaintId}</dd><dt>Hash at submission</dt><dd class="mono">${r.contentHash}</dd>
  <dt>Anchor state</dt><dd>${an ? (r.anchor.existing ? 'Confirmed (found already on-chain with matching hash)' : 'Confirmed') : r.anchor.state === 'pending' ? (isBusy ? 'Pending…' : 'Interrupted: press retry (it checks the chain first)') : 'Not anchored'}</dd>
  <dt>Transactions</dt><dd>${txs.length ? txs.map(t => `${esc(t.label)}: ${link(t.hash)}`).join('<br>') : '—'}</dd></dl>
  ${r.anchor.error ? `<div class="err" style="margin-top:10px">${esc(r.anchor.error)}</div>` : ''}
  <p>${!an ? `<button class="btn" data-act="anchor" data-id="${id}" ${isBusy ? 'disabled' : ''}>${isBusy ? 'Waiting…' : r.anchor.state === 'failed' || r.anchor.state === 'pending' ? 'Retry blockchain registration' : 'Register on blockchain'}</button>` : ''}
  <button class="btn dark" data-act="verify" data-id="${id}">Verify integrity</button><button class="btn dark" data-act="loadchain" data-id="${id}">Refresh from chain</button></p>
  ${vr ? `<div class="${vr.result === 'VERIFIED' ? 'ok' : vr.result === 'MISMATCH' ? 'err' : 'warn'}"><b>${vr.result}</b>: ${VMSG[vr.result]} ${vr.note ? esc(vr.note) : ''} ${vr.error ? esc(vr.error) : ''}</div>` : ''}
  ${me.role !== 'investigator' ? `<p class="muted">Tamper demo (local only): <button class="btn sm dark" data-act="tamper" data-id="${id}">Alter description</button> <button class="btn sm dark" data-act="untamper" data-id="${id}">Restore</button> then click Verify.</p>` : ''}</div>
  ${(me.role === 'police' || me.role === 'investigator') ? actionsPanel(r) : ''}
  <div class="card"><h3>Status history (from blockchain)</h3>${v.loading ? 'Loading…' : v.error ? `<div class="err">${esc(v.error)}</div>` : v.notfound ? '<div class="warn">Not found on the contract.</div>' : v.history ? `<ul class="tl">${v.history.map(h => `<li><b>${C.ACTIONS[h.action]}</b> → ${C.STATUS[h.status]}<br><span class="muted">${fmt(h.timestamp * 1000)} · by ${C.short(h.actor)} · hash <span class="mono">${C.short(h.recordHash)}</span></span></li>`).join('')}</ul>` : '<p class="muted">' + (an ? 'Press "Refresh from chain".' : 'No on-chain history: this complaint is not anchored.') + '</p>'}</div>`;
}
function actionsPanel(r) {
  if (r.anchor.state !== 'anchored') return '<div class="warn">Not anchored on-chain: no blockchain actions are possible yet.</div>';
  const s = r.chainStatus ?? 0; let b = '';
  if (me.role === 'police') {
    for (const [k, a] of Object.entries(ACTS)) if (a.from.includes(s)) b += `<button class="btn" data-act="act" data-key="${k}" data-id="${r.id}">${a.label}</button>`;
    if ([0, 1, 2].includes(s)) b += `<button class="btn dark" data-act="fir" data-id="${r.id}">Register formal FIR</button>`;
    if ([4, 5].includes(s)) b += `<div style="margin-top:10px"><label>Assign investigator (wallet with INVESTIGATOR_ROLE)</label><input id="assignAddr" list="invs" placeholder="0x…"><datalist id="invs">${db.users.filter(u => u.role === 'investigator' && u.wallet).map(u => `<option value="${esc(u.wallet)}">${esc(u.name)}</option>`).join('')}</datalist><button class="btn dark" data-act="assign" data-id="${r.id}">Assign investigator</button></div>`;
  } else if ([4, 5].includes(s)) {
    b = `<label>Investigation note (only its hash goes on-chain)</label><textarea id="invNote" rows="3"></textarea><button class="btn" data-act="invupdate" data-id="${r.id}">Record investigation update</button><p class="muted">Note: the contract replaces the current content hash with this one. The original submission hash stays in history.</p>`;
  }
  return `<div class="card"><h3>${me.role === 'police' ? 'Police' : 'Investigator'} actions</h3><p class="muted">Buttons are shown for convenience; the smart contract checks your connected wallet's role.</p>${b || '<p class="muted">No actions available in the current status.</p>'}</div>`;
}
function usersView() {
  return head('Accounts (local demo profiles)') + `<div class="warn">Local demo roles only. They do not grant any on-chain permission.</div>
  <div class="card tw"><table><thead><tr><th>Name</th><th>Role</th><th>Wallet</th><th>Status</th><th></th></tr></thead><tbody>
  ${db.users.map(u => `<tr><td>${esc(u.name)}</td><td><select data-role-user="${u.id}">${['citizen', 'police', 'investigator', 'admin'].map(r => `<option${u.role === r ? ' selected' : ''}>${r}</option>`).join('')}</select></td><td class="mono">${esc(u.wallet || '—')}</td><td>${u.active ? '<span class="badge green">active</span>' : '<span class="badge red">disabled</span>'}</td><td><button class="btn sm" data-act="toggleuser" data-id="${u.id}" ${u.id === me.id ? 'disabled' : ''}>${u.active ? 'Disable' : 'Enable'}</button></td></tr>`).join('')}</tbody></table></div>
  <form class="card" data-form="addUser"><h3>Add profile</h3><label>Name</label><input name="name" required maxlength="60"><label>Role</label><select name="role"><option>citizen</option><option>police</option><option>investigator</option><option>admin</option></select><label>Wallet address (optional)</label><input name="wallet" placeholder="0x…"><p><button class="btn" type="submit">Add</button></p></form>`;
}
const activityView = () => head('Activity log (local)') + `<div class="card tw">${db.log.length ? `<table><thead><tr><th>Time</th><th>By</th><th>Action</th><th>Detail</th></tr></thead><tbody>${db.log.map(l => `<tr><td>${fmt(l.t)}</td><td>${esc(l.by)}</td><td>${esc(l.action)}</td><td>${esc(l.detail)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No activity yet.</p>'}</div>`;
function chainView() {
  const i = ac || {}, w = C.wallet, an = db.complaints.filter(r => r.anchor.state === 'anchored');
  return head('Blockchain integration') + `<div class="card"><dl><dt>Contract</dt><dd><a href="${C.ETHERSCAN}/address/${C.ADDRESS}" target="_blank" rel="noopener">${C.ADDRESS}</a></dd><dt>Network</dt><dd>Sepolia (11155111)</dd>
  <dt>Contract check</dt><dd>${C.state.ok ? '<span class="badge green">ABI valid, contract code found</span>' : `<span class="badge red">${esc(C.state.error)}</span>`}</dd>
  <dt>On-chain admin</dt><dd class="mono">${i.loading ? '…' : esc(i.admin || i.error || '—')}</dd><dt>Latest block</dt><dd>${i.block || '—'}</dd>
  <dt>Connected wallet</dt><dd class="mono">${w.account || 'not connected'}</dd>
  <dt>Wallet roles</dt><dd>${i.roles ? C.ROLES.map(r => `<span class="badge ${i.roles[r] ? 'green' : ''}">${r}: ${i.roles[r] ? 'yes' : 'no'}</span>`).join(' ') : 'connect a wallet'}</dd></dl>
  <p><button class="btn dark" data-act="refreshac">Refresh</button></p></div>
  <form class="card" data-form="grant"><h3>Grant an on-chain role</h3><div class="info">This sends a real transaction. Only works if the connected wallet has ADMIN_ROLE on the contract; being "Admin" in this demo does not matter. To let a wallet register complaints, grant it RELAYER_ROLE.</div>
  <label>Role</label><select name="role">${C.ROLES.map(r => `<option${r === 'RELAYER_ROLE' ? ' selected' : ''}>${r}</option>`).join('')}</select><label>Wallet address</label><input name="addr" value="${esc(w.account || '')}" placeholder="0x…"><p><button class="btn" type="submit">Grant role</button></p></form>
  <div class="card"><h3>Verification results</h3><p><button class="btn dark" data-act="verifyall">Verify all anchored complaints</button></p>
  ${an.length ? `<table><tbody>${an.map(r => `<tr><td class="mono">${r.ref}</td><td>${esc(r.title)}</td><td>${cs[r.id]?.verify?.result || 'not checked'}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No anchored complaints.</p>'}</div>`;
}
function content() {
  if (page === 'view') return detailView(arg);
  if (me.role === 'citizen') {
    if (page === 'new') return newView();
    if (page === 'list') return head('My complaints') + listBlock();
    return head('Welcome, ' + esc(me.name)) + metrics(visible()) + '<p><a class="btn" href="#/new" style="text-decoration:none;display:inline-block">+ New complaint</a></p>' + listBlock();
  }
  if (me.role === 'admin') {
    if (page === 'users') return usersView();
    if (page === 'activity') return activityView();
    if (page === 'chain') return chainView();
    return head('Admin overview') + `<div class="grid" style="margin-bottom:14px"><div class="metric"><b>${db.users.length}</b><span>Accounts</span></div><div class="metric"><b>${db.users.filter(u => !u.active).length}</b><span>Disabled</span></div></div>` + metrics(db.complaints) + '<div class="info">Admin cannot perform police actions or alter blockchain history here.</div>' + listBlock();
  }
  return head('Complaint inbox') + metrics(db.complaints) + listBlock();
}
function render() {
  if (!db) { app.innerHTML = '<div class="login"><div class="err">Saved demo data is missing or corrupt.</div><button class="btn" data-act="reset">Reset demo data</button></div>'; return; }
  const sid = getSession(); me = db.users.find(u => u.id === sid && u.active) || null;
  if (!me) { loginView(); return; }
  const p = location.hash.slice(2).split('/'); page = p[0] || 'dashboard'; arg = p[1] || null;
  if (page !== 'view' && !NAV[me.role].some(n => n[0] === page)) page = 'dashboard';
  app.innerHTML = shell(content());
  if (page === 'view' && arg) { const r = find(arg); if (r && r.anchor.state === 'anchored' && !cs[arg]) loadChain(arg); }
  if (me.role === 'admin' && page === 'chain' && !ac && C.state.ok) loadAC();
}

// ---------- events ----------
const H = {
  login: id => { setSession(id); location.hash = '#/dashboard'; me = null; log('Signed in', ''); render(); },
  logout: () => { setSession(null); render(); },
  reset: () => {
    if (!confirm('Reset ALL demo data in this browser? Complaints stored only here will be lost (blockchain records are NOT affected and cannot be erased).')) return;
    db = reset(); for (const k in cs) delete cs[k]; location.hash = ''; render(); toast('Demo data reset');
  },
  connect: async () => { await C.connect(); await C.ensureChain().catch(e => toast(C.friendly(e), 'err')); ac = null; render(); },
  retryinit: async () => { await C.init(); render(); },
  anchor: id => doAnchor(id),
  loadchain: id => { delete cs[id]; return loadChain(id); },
  verify: async id => {
    const r = find(id); toast('Verifying against Sepolia…');
    const res = await C.verify(r); cs[id] = { ...(cs[id] || {}), verify: res }; render();
  },
  verifyall: async () => {
    for (const r of db.complaints.filter(x => x.anchor.state === 'anchored')) cs[r.id] = { ...(cs[r.id] || {}), verify: await C.verify(r) };
    render();
  },
  tamper: id => { const r = find(id); if (!r.description.includes(' [TAMPERED]')) r.description += ' [TAMPERED]'; save(db); render(); toast('Local description altered. Now click Verify.'); },
  untamper: id => { const r = find(id); r.description = r.description.replace(/ \[TAMPERED\]/g, ''); save(db); render(); },
  act: (id, b) => { const a = ACTS[b.dataset.key], r = find(id); return runTx(r, a.label, a.fn, [r.complaintId], 'POLICE_ROLE'); },
  fir: id => {
    const r = find(id), num = `FIR-${new Date().getFullYear()}-${r.ref.slice(3)}`;
    return runTx(r, 'Register FIR ' + num, 'registerFIR', [r.complaintId, C.textHash(`recordsafe-fir:${r.complaintId}:${num}`)], 'POLICE_ROLE', () => { r.firNumber = num; });
  },
  assign: id => {
    const r = find(id), a = document.getElementById('assignAddr').value.trim();
    if (!C.isAddress(a)) return toast('Enter a valid wallet address.', 'err');
    return runTx(r, 'Assign investigator ' + C.short(a), 'assignInvestigator', [r.complaintId, a], 'POLICE_ROLE');
  },
  invupdate: id => {
    const r = find(id), n = document.getElementById('invNote').value.trim();
    if (n.length < 5) return toast('Enter an investigation note (min 5 characters).', 'err');
    return runTx(r, 'Investigation update', 'updateInvestigationHash', [r.complaintId, C.textHash(n)], 'INVESTIGATOR_ROLE', () => { (r.notes = r.notes || []).push({ at: Date.now(), text: n }); });
  },
  toggleuser: id => { const u = db.users.find(x => x.id === id); u.active = !u.active; log(u.active ? 'Enabled account' : 'Disabled account', u.name); render(); },
  refreshac: () => { ac = null; render(); }
};
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  try { await H[b.dataset.act]?.(b.dataset.id, b); } catch (err) { console.error(err); toast(C.friendly(err), 'err'); }
});
document.addEventListener('input', e => {
  const k = e.target.dataset.filter; if (!k) return;
  filters[k] = e.target.value; document.getElementById('tbl').innerHTML = tableHTML();
});
document.addEventListener('change', e => {
  const id = e.target.dataset.roleUser; if (id) { const u = db.users.find(x => x.id === id); u.role = e.target.value; log('Changed role', `${u.name} → ${u.role}`); render(); return; }
  if (e.target.dataset.filter) { filters[e.target.dataset.filter] = e.target.value; document.getElementById('tbl').innerHTML = tableHTML(); }
});
document.addEventListener('submit', async e => {
  const f = e.target.dataset.form; if (!f) return; e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target)); for (const k in d) d[k] = String(d[k]).replace(/\r\n/g, '\n').trim();
  try {
    if (f === 'newComplaint') {
      const today = new Date().toISOString().slice(0, 10);
      if (d.title.length < 5) return toast('Title must be at least 5 characters.', 'err');
      if (d.description.length < 20) return toast('Description must be at least 20 characters.', 'err');
      if (d.location.length < 3) return toast('Enter a general location.', 'err');
      if (!d.incidentDate || d.incidentDate > today) return toast('Incident date cannot be in the future.', 'err');
      const u = uid(), complaintId = C.complaintIdFor(u);
      const r = { id: u, complaintId, ref: 'RS-' + complaintId.slice(2, 10).toUpperCase(), citizenId: me.id, title: d.title, category: d.category, description: d.description, incidentDate: d.incidentDate, location: d.location, createdAt: Date.now(), anchor: { state: 'pending' }, chainStatus: null, txs: [] };
      r.contentHash = C.contentHashOf(r);
      db.complaints.push(r); log('Complaint created (local)', r.ref); location.hash = '#/view/' + r.id; render(); doAnchor(r.id);
    } else if (f === 'addUser') {
      if (d.name.length < 2) return toast('Enter a name.', 'err');
      if (d.wallet && !C.isAddress(d.wallet)) return toast('Invalid wallet address.', 'err');
      db.users.push({ id: 'u-' + uid(), name: d.name, role: d.role, wallet: d.wallet, active: true }); log('Added account', d.name); render();
    } else if (f === 'grant') {
      if (!C.isAddress(d.addr)) return toast('Invalid wallet address.', 'err');
      await runTx(null, `Grant ${d.role} to ${C.short(d.addr)}`, 'grantRole', [await C.roleHash(d.role), d.addr], 'ADMIN_ROLE'); ac = null; render();
    }
  } catch (err) { console.error(err); toast(C.friendly(err), 'err'); }
});
window.addEventListener('hashchange', render);
if (window.ethereum) {
  window.ethereum.on?.('accountsChanged', a => { C.wallet.account = a[0] || null; ac = null; render(); });
  window.ethereum.on?.('chainChanged', id => { C.wallet.chainId = parseInt(id, 16); render(); });
  window.ethereum.request({ method: 'eth_accounts' }).then(async a => { if (a[0]) { C.wallet.account = a[0]; C.wallet.chainId = parseInt(await window.ethereum.request({ method: 'eth_chainId' }), 16); render(); } }).catch(() => {});
}
render();
C.init().then(render);
