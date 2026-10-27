// Wallet + contract integration. Uses ONLY functions present in abi/FIRRegistry.json.
import { ethers } from 'https://cdn.jsdelivr.net/npm/ethers@6.13.4/+esm';

export const ADDRESS = ethers.getAddress('0xdBd5a01B904C7Bc9b19cF76F4E920De20afddDb3'.toLowerCase());
export const CHAIN_ID = 11155111, CHAIN_HEX = '0xaa36a7';
export const ETHERSCAN = 'https://sepolia.etherscan.io';
const RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
export const STATUS = ['Submitted', 'Under review', 'Information required', 'Referred', 'FIR registered', 'Under investigation', 'Closed'];
export const ACTIONS = ['Complaint submitted', 'Review started', 'Information requested', 'Complaint referred', 'FIR recorded', 'Investigator assigned', 'Investigation updated', 'Case closed'];
export const ROLES = ['ADMIN_ROLE', 'RELAYER_ROLE', 'POLICE_ROLE', 'INVESTIGATOR_ROLE'];
const NEEDED = ['registerComplaint', 'startReview', 'requestInformation', 'referComplaint', 'registerFIR', 'assignInvestigator', 'updateInvestigationHash', 'closeCase', 'getComplaint', 'getHistory', 'verifyHash', 'hasRole', 'grantRole', 'admin', ...ROLES];

export const wallet = { account: null, chainId: null };
export const state = { ok: false, error: null };
let ABI, provider, readC;

const fe = msg => Object.assign(new Error(msg), { friendly: true });
export const short = a => (a ? a.slice(0, 6) + '…' + a.slice(-4) : '');

export function friendly(e) {
  if (e?.friendly) return e.message;
  if (e?.code === 'ACTION_REJECTED' || e?.code === 4001) return 'You rejected the request in MetaMask. Nothing was sent.';
  if (e?.code === 'INSUFFICIENT_FUNDS') return 'Not enough Sepolia test ETH for gas. Get some from a Sepolia faucet.';
  if (e?.code === 'CALL_EXCEPTION') return 'Contract reverted: ' + (e.reason || 'the transaction would fail (check your role / complaint status).');
  if (['NETWORK_ERROR', 'SERVER_ERROR', 'TIMEOUT'].includes(e?.code)) return 'Sepolia RPC / network problem. Try again in a moment.';
  if (e?.code === -32002) return 'MetaMask already has a pending request. Open the MetaMask window.';
  return e?.shortMessage || e?.message || 'Unknown error';
}

export async function init() {
  try {
    const res = await fetch('abi/FIRRegistry.json');
    if (!res.ok) throw new Error('abi/FIRRegistry.json not found (are you using the local server, not file://?)');
    ABI = await res.json();
    if (!Array.isArray(ABI)) throw new Error('ABI file is invalid');
    const names = ABI.filter(x => x.type === 'function').map(x => x.name);
    const missing = NEEDED.filter(n => !names.includes(n));
    if (missing.length) throw new Error('ABI is missing functions: ' + missing.join(', '));
    provider = new ethers.JsonRpcProvider(RPC, CHAIN_ID, { staticNetwork: true });
    readC = new ethers.Contract(ADDRESS, ABI, provider);
    const code = await provider.getCode(ADDRESS);
    if (code === '0x') throw new Error('No contract code at ' + ADDRESS + ' on Sepolia (wrong address?)');
    state.ok = true; state.error = null;
  } catch (e) { console.error('Chain init failed', e); state.ok = false; state.error = friendly(e); }
  return state;
}

// ---------- hashing (canonical form documented in README) ----------
export const complaintIdFor = uuid => ethers.keccak256(ethers.toUtf8Bytes('recordsafe:' + uuid));
export const canonical = r => JSON.stringify([r.complaintId, r.title, r.category, r.description, r.incidentDate, r.location]);
export const contentHashOf = r => ethers.keccak256(ethers.toUtf8Bytes(canonical(r)));
export const textHash = t => ethers.keccak256(ethers.toUtf8Bytes(t));
export const isAddress = a => ethers.isAddress(a);
const must32 = v => { if (!ethers.isHexString(v, 32)) throw fe('Invalid bytes32 value: ' + v); return v; };

// ---------- wallet ----------
export async function connect() {
  if (!window.ethereum) throw fe('MetaMask is not installed. Install it from metamask.io and reload this page.');
  try {
    const a = await window.ethereum.request({ method: 'eth_requestAccounts' });
    wallet.account = a[0] || null;
  } catch (e) { throw fe(e.code === 4001 ? 'You rejected the wallet connection.' : friendly(e)); }
  wallet.chainId = parseInt(await window.ethereum.request({ method: 'eth_chainId' }), 16);
  return wallet;
}
export async function ensureChain() {
  if (wallet.chainId === CHAIN_ID) return;
  try {
    await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_HEX }] });
  } catch (e) {
    if (e.code === 4902) {
      await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{ chainId: CHAIN_HEX, chainName: 'Sepolia', nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: [RPC], blockExplorerUrls: [ETHERSCAN] }] });
    } else throw fe(e.code === 4001 ? 'You rejected the network switch. Please switch MetaMask to Sepolia.' : friendly(e));
  }
  wallet.chainId = parseInt(await window.ethereum.request({ method: 'eth_chainId' }), 16);
  if (wallet.chainId !== CHAIN_ID) throw fe('Wrong network. Switch MetaMask to Sepolia (chain 11155111).');
}
async function ensureReady() {
  if (!state.ok) throw fe('Contract not ready: ' + state.error);
  if (!wallet.account) await connect();
  await ensureChain();
}
const writeC = async () => new ethers.Contract(ADDRESS, ABI, await new ethers.BrowserProvider(window.ethereum).getSigner());

// ---------- reads ----------
export const roleHash = name => readC[name]();
export async function hasRole(name, addr) { return readC.hasRole(await roleHash(name), addr); }
export async function readComplaint(id) {
  must32(id);
  try {
    const c = await readC.getComplaint(id);
    return { contentHash: c.contentHash, firReferenceHash: c.firReferenceHash, officer: c.investigatingOfficer, status: Number(c.status), createdAt: Number(c.createdAt), updatedAt: Number(c.updatedAt) };
  } catch (e) {
    if (e.code === 'CALL_EXCEPTION' && /not found/i.test(e.reason || '')) return null; // genuinely absent
    throw e; // RPC problems are NOT "not found"
  }
}
export async function readHistory(id) {
  return (await readC.getHistory(must32(id))).map(h => ({ action: Number(h.action), status: Number(h.status), recordHash: h.recordHash, actor: h.actor, timestamp: Number(h.timestamp) }));
}
export async function chainInfo() {
  const info = { admin: await readC.admin(), block: await provider.getBlockNumber(), roles: null };
  if (wallet.account) info.roles = Object.fromEntries(await Promise.all(ROLES.map(async r => [r, await hasRole(r, wallet.account)])));
  return info;
}

// ---------- writes ----------
export async function sendTx(fn, args, roleName, onHash) {
  await ensureReady();
  if (roleName && !(await hasRole(roleName, wallet.account)))
    throw fe(`Your connected wallet (${short(wallet.account)}) does not have ${roleName} on the contract. The contract admin wallet must grant it (Admin → Blockchain).`);
  const c = await writeC();
  const t = await c[fn](...args);
  onHash?.(t.hash);
  const rc = await t.wait();
  if (!rc || rc.status !== 1) throw fe('Transaction failed on-chain.');
  return rc;
}

export async function anchorComplaint(rec, onHash) {
  const id = must32(rec.complaintId), h = must32(rec.contentHash);
  const ex = await readComplaint(id);
  if (ex) {
    if (ex.contentHash.toLowerCase() === h.toLowerCase()) return { existing: true };
    throw fe('This complaint ID already exists on-chain with a DIFFERENT hash. Not overwriting.');
  }
  await sendTx('registerComplaint', [id, h], 'RELAYER_ROLE', onHash);
  const after = await readComplaint(id);
  if (!after || after.contentHash.toLowerCase() !== h.toLowerCase()) throw fe('Transaction mined but the on-chain record does not match. Not marking as anchored.');
  return { existing: false };
}

// ---------- integrity verification ----------
export async function verify(rec) {
  try {
    const id = must32(rec.complaintId);
    const on = await readComplaint(id);
    if (!on) return { result: 'NOT ANCHORED' };
    const calc = contentHashOf(rec);
    if (await readC.verifyHash(id, calc)) return { result: 'VERIFIED', calc };
    const hist = await readHistory(id);
    if (hist[0] && hist[0].recordHash.toLowerCase() === calc.toLowerCase())
      return { result: 'VERIFIED', calc, note: 'Matches the ORIGINAL submission hash in on-chain history (an investigator later replaced the current hash).' };
    return { result: 'MISMATCH', calc, onchain: on.contentHash };
  } catch (e) { console.error(e); return { result: 'VERIFICATION FAILED', error: friendly(e) }; }
}
