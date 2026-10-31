// Local development bridge: use GEV's existing getWorld(), not a copied feed.
// Start: node scripts/serve-gev-world.mjs
// Binds loopback only; reads existing GEV GET endpoints, never exposes keys.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ZONE_DEFINITIONS } from '../src/living-city.js';
import { normalizeGEVWorldSnapshot } from '../src/gev-world-bridge.js';
import { canonical } from '../src/journal.js';
import { verifyLIMJournalExport } from '../src/lim-journal-export.js';
import { loadCredentials, loadReceipt, saveReceipt, clearReceipt, bearerMatches } from './gev-bridge-security.mjs';

const gevRoot = resolve(process.env.GEV_REPO || resolve(import.meta.dirname, '../../projects/gods-eye-view'));
const upstream = process.env.GEV_URL || 'http://127.0.0.1:4173';
const listenPort = Number(process.env.GEV_BRIDGE_PORT || 8617);
if (!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(upstream)) throw new Error('GEV_URL must be loopback HTTP');
if (!Number.isInteger(listenPort) || listenPort < 1024 || listenPort > 65535) throw new Error('invalid port');
const { getWorld } = await import(pathToFileURL(join(gevRoot, 'src/life/worldFeeds.js')).href);
const revision = execFileSync('git', ['-C',gevRoot,'rev-parse','--short=12','HEAD'], {encoding:'utf8'}).trim();
const endpoints = {
  traffic:'/api/tomtom/status', weather:'/api/regional-brief',
  fires:'/api/firms', quakes:'earthquake.usgs.gov', servicesNear:'/api/cctv/health',
};
const cacheMs = 40000;
let cached = null, lastPoll = 0, inFlight = null;

async function poll() {
  const responses = {};
  async function tracedFetch(url, options) {
    const raw = String(url);
    const absolute = raw.startsWith('https://earthquake.usgs.gov/') ? raw : new URL(raw, upstream).href;
    const key = Object.keys(endpoints).find(k => raw.includes(endpoints[k])) || 'unknown';
    try {
      const response = await fetch(absolute, options);
      responses[key] = { httpStatus: response.status, ok: response.ok };
      if (key === 'weather' && response.ok) {
        // HTTP 200 does not prove a valid weather observation.
        const body = await response.clone().json().catch(() => null);
        const code = body?.weather?.current?.weather_code ?? body?.weather?.current?.weathercode;
        responses.weather.hasWmoCode = code !== undefined && code !== null && Number.isFinite(Number(code));
      }
      return response;
    } catch (e) {
      responses[key] = { httpStatus: null, ok: false, reason: 'network-error' };
      throw e;
    }
  }
  // This is the existing GEV implementation, including its fallback decisions.
  const world = await getWorld(tracedFetch, ZONE_DEFINITIONS);
  const status = (name) => responses[name]?.httpStatus ?? null;
  const provenance = {
    traffic: { classification: status('traffic') === 200 ? 'proxy' : 'fallback',
      explanation: 'GEV infers traffic from TomTom API key presence; never measured congestion', httpStatus: status('traffic') },
    weather: { classification: status('weather') === 200 && responses.weather?.hasWmoCode ? 'derived-observation' : 'fallback',
      explanation: 'GEV WMO code grouped into good/bad; non-200 defaults to good', httpStatus: status('weather') },
    fires: { classification: status('fires') === 200 ? 'observed-feed' : 'unavailable',
      explanation: 'Absent FIRMS credentials produce an empty list, not a no-fire observation', httpStatus: status('fires') },
    quakes: { classification: status('quakes') === 200 ? 'observed-feed' : 'unavailable',
      explanation: 'USGS all_day GeoJSON, unfiltered by magnitude; event count is not M2.5+ count', httpStatus: status('quakes'),
      events: world.disasters.filter(d => d.type === 'quake').length },
    servicesNear: { classification: 'camera-registry-proxy',
      explanation: 'CCTV camera registry count; NOT a measure of essential service availability', httpStatus: status('servicesNear') },
  };
  const recordedAt = new Date().toISOString();
  const snapshotId = 'gev-' + createHash('sha256').update(canonical([recordedAt,revision,world,provenance])).digest('hex');
  const record = { schemaVersion:'life-itself-gev-world/1.0.0', snapshotId,
    source: { system:'gods-eye-view', revision }, recordedAt, world, provenance };
  normalizeGEVWorldSnapshot(record);
  cached = record;
  lastPoll = Date.now();
  return record;
}
function capture() {
  if (cached && Date.now() - lastPoll < cacheMs) return Promise.resolve(cached);
  if (!inFlight) inFlight = poll().finally(() => { inFlight = null; });
  return inFlight;
}

const allowedOrigin = /^http:\/\/(?:localhost|127\.0\.0\.1):(?:8000|5174|5173|8001)$/;
const gevReadOrigin = /^http:\/\/(?:localhost|127\.0\.0\.1):(?:4173|4183)$/;
const limWriterOrigin = /^http:\/\/(?:localhost|127\.0\.0\.1):(?:8000|5174|5173|8001)$/;
const credentials = loadCredentials();
const persisted = loadReceipt(credentials);
let latestLIM = persisted?.latestLIM ?? null;
let lastLIMHead = persisted?.lastLIMHead ?? null;
let lastLIMCount = persisted?.lastLIMCount ?? 0;
let lastLIMSession = persisted?.lastLIMSession ?? null;
let receiveQueue = Promise.resolve();
function unauthorized(res) {
  res.writeHead(401); res.end(JSON.stringify({error:'bridge pairing required'}));
}

async function readBody(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 3_000_000) throw new Error('journal transfer too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const server = createServer(async (req,res) => {
  const origin = req.headers.origin;
  if (origin && (allowedOrigin.test(origin) || gevReadOrigin.test(origin)))
    res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if (req.method === 'OPTIONS') {
    if (!origin || !(allowedOrigin.test(origin) || gevReadOrigin.test(origin))) {
      res.writeHead(403); res.end(JSON.stringify({error:'origin denied'})); return;
    }
    res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
    res.writeHead(204); res.end(); return;
  }
  // Reset is a privileged local CLI operation, never an origin-authorized browser call.
  if (req.url === '/admin/reset' && req.method === 'POST') {
    if (origin || !bearerMatches(req.headers.authorization,credentials.adminToken)) {
      unauthorized(res); return;
    }
    try {
      await receiveQueue;
      clearReceipt();
      latestLIM=null;lastLIMHead=null;lastLIMCount=0;lastLIMSession=null;
      res.writeHead(200);res.end(JSON.stringify({reset:true,receipt:'cleared',credentials:'retained'}));
    } catch {
      res.writeHead(500);res.end(JSON.stringify({error:'reset failed'}));
    }
    return;
  }
  if (req.url === '/lim/journal' && req.method === 'POST') {
    if (!origin || !limWriterOrigin.test(origin)) {
      res.writeHead(403); res.end(JSON.stringify({error:'writer origin denied'})); return;
    }
    if (!bearerMatches(req.headers.authorization,credentials.limToken)) {
      unauthorized(res);return;
    }
    const processWrite = async () => {
      const input = await readBody(req);
      const obs = await verifyLIMJournalExport(input);
      if (obs.source.sessionId === lastLIMSession &&
          (obs.journalEntries < lastLIMCount ||
          (lastLIMCount > 0 && input.entries[lastLIMCount - 1]?.checksum !== lastLIMHead)))
        throw new Error('non-monotonic history or changed prior entry');
      const next = {
        lastLIMSession:obs.source.sessionId, lastLIMCount:obs.journalEntries,
        lastLIMHead:obs.journalHead,
        latestLIM:{...obs,receivedAt:new Date().toISOString()},
      };
      // Durable, HMAC-protected commit BEFORE publishing the new receipt.
      saveReceipt(credentials,next);
      ({lastLIMSession,lastLIMCount,lastLIMHead,latestLIM}=next);
      return obs;
    };
    const work=receiveQueue.then(processWrite);
    receiveQueue=work.catch(()=>{});
    try {
      const obs=await work;
      res.writeHead(201);res.end(JSON.stringify({accepted:true,simTick:obs.simTick,journalHead:obs.journalHead}));
    }catch(err){
      res.writeHead(422);res.end(JSON.stringify({accepted:false,error:String(err?.message||err)}));
    }
    return;
  }
  if (req.url === '/lim/observations' && req.method === 'GET') {
    if (origin && !gevReadOrigin.test(origin)) {
      res.writeHead(403); res.end(JSON.stringify({error:'origin denied'})); return;
    }
    if (!bearerMatches(req.headers.authorization,credentials.gevToken)) {
      unauthorized(res);return;
    }
    res.writeHead(200); res.end(JSON.stringify(latestLIM || {status:'awaiting-lim-journal'}));
    return;
  }
  if (req.method !== 'GET') { res.writeHead(405); res.end(JSON.stringify({error:'GET only'})); return; }
  if (req.url === '/health') { res.writeHead(200); res.end(JSON.stringify({status:'up',source:'gods-eye-view',revision,cached:!!cached,limObserved:!!latestLIM})); return; }
  if (req.url !== '/world') { res.writeHead(404); res.end(JSON.stringify({error:'not found'})); return; }
  if (origin && !allowedOrigin.test(origin)) { res.writeHead(403); res.end(JSON.stringify({error:'origin not allowed'})); return; }
  if (!bearerMatches(req.headers.authorization,credentials.limToken)) {
    unauthorized(res);return;
  }
  try { const snapshot = await capture(); res.writeHead(200); res.end(JSON.stringify(snapshot)); }
  catch (e) { res.writeHead(503); res.end(JSON.stringify({error:'GEV snapshot unavailable',detail:String(e?.message||e)})); }
});
server.listen(listenPort, '127.0.0.1', () =>
  console.log('GEV → LIM live world bridge: http://127.0.0.1:' + listenPort + '/world (GEV ' + revision + ')'));
