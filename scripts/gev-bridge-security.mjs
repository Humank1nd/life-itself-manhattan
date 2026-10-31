// Local-only bridge authority and durable receipt storage.
// Secrets are created once outside Git and never served to browsers.
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, rmSync, chmodSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export const BRIDGE_STATE_DIR = resolve(process.env.GEV_BRIDGE_STATE_DIR ||
  join(homedir(), '.local', 'state', 'life-itself', 'gev-lim-bridge'));
export const BRIDGE_AUTH_FILE = join(BRIDGE_STATE_DIR, 'credentials.json');
export const BRIDGE_RECEIPT_FILE = join(BRIDGE_STATE_DIR, 'latest-receipt.json');

function ensureDir() {
  mkdirSync(BRIDGE_STATE_DIR,{recursive:true,mode:0o700});
  chmodSync(BRIDGE_STATE_DIR,0o700);
}
function writeAtomic(path, data) {
  const tmp = path + '.tmp-' + process.pid + '-' + randomBytes(8).toString('hex');
  try {
    writeFileSync(tmp,JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});
    renameSync(tmp,path);
    chmodSync(path,0o600);
  } finally {rmSync(tmp,{force:true});}
}
export function loadCredentials() {
  ensureDir();
  if(!existsSync(BRIDGE_AUTH_FILE)) {
    const keys={schemaVersion:1,
      limToken:randomBytes(32).toString('hex'),
      gevToken:randomBytes(32).toString('hex'),
      adminToken:randomBytes(32).toString('hex')};
    try{writeFileSync(BRIDGE_AUTH_FILE,JSON.stringify(keys,null,2)+'\n',{flag:'wx',mode:0o600});}
    catch(e){if(e?.code!=='EEXIST')throw e;}
  }
  const v=JSON.parse(readFileSync(BRIDGE_AUTH_FILE,'utf8'));
  if(v.schemaVersion!==1 || ![v.limToken,v.gevToken,v.adminToken].every(x=>/^[a-f0-9]{64}$/.test(x)))
    throw Error('bridge credentials invalid; refusing insecure startup');
  chmodSync(BRIDGE_AUTH_FILE,0o600);
  return v;
}
export function bearerMatches(header,expected) {
  if(typeof header!=='string' || !/^Bearer [a-f0-9]{64}$/.test(header))return false;
  return timingSafeEqual(Buffer.from(header.slice(7)),Buffer.from(expected));
}
function signature(payload,secret) {
  return createHmac('sha256',secret).update(JSON.stringify(payload)).digest('hex');
}
export function loadReceipt(credentials) {
  if(!existsSync(BRIDGE_RECEIPT_FILE))return null;
  const saved=JSON.parse(readFileSync(BRIDGE_RECEIPT_FILE,'utf8'));
  if(saved.schemaVersion!==1 || !saved.payload || typeof saved.mac!=='string' ||
      !/^[a-f0-9]{64}$/.test(saved.mac) ||
      !timingSafeEqual(Buffer.from(saved.mac),Buffer.from(signature(saved.payload,credentials.adminToken))))
    throw Error('bridge receipt integrity violation; refusing startup');
  return saved.payload;
}
export function saveReceipt(credentials,payload) {
  ensureDir();
  writeAtomic(BRIDGE_RECEIPT_FILE,{schemaVersion:1,payload,mac:signature(payload,credentials.adminToken)});
}
export function clearReceipt() {
  rmSync(BRIDGE_RECEIPT_FILE,{force:true});
}
