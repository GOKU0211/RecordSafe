// Off-chain demo data in localStorage (NOT secure, NOT shared between browsers).
const KEY = 'recordsafe.v1', SKEY = 'recordsafe.session';
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const seed = () => ({
  users: [
    { id: 'u-citizen', name: 'Asha Citizen', role: 'citizen', wallet: '', active: true },
    { id: 'u-police', name: 'Officer Rao', role: 'police', wallet: '', active: true },
    { id: 'u-inv', name: 'Inspector Mehta', role: 'investigator', wallet: '', active: true },
    { id: 'u-admin', name: 'Admin Demo', role: 'admin', wallet: '', active: true }
  ],
  complaints: [], log: []
});
export function save(db) {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (e) { console.error('Storage write failed', e); alert('Browser storage is unavailable or full. Changes were NOT saved.'); }
}
export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) { const d = seed(); save(d); return d; }
    const d = JSON.parse(raw);
    if (!d || !Array.isArray(d.users) || !Array.isArray(d.complaints)) throw new Error('Malformed data');
    d.log = d.log || [];
    return d;
  } catch (e) { console.error('Demo data corrupt/unavailable', e); return null; }
}
export function reset() { try { localStorage.removeItem(KEY); localStorage.removeItem(SKEY); } catch (e) { console.error(e); } return load(); }
export const getSession = () => { try { return localStorage.getItem(SKEY); } catch { return null; } };
export const setSession = id => { try { id ? localStorage.setItem(SKEY, id) : localStorage.removeItem(SKEY); } catch (e) { console.error(e); } };
