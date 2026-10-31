// Read-only LIM → GEV evidence projection. Verifies the existing journal;
 // never alters either simulator or promotes simulation into physical truth.
import { canonical, sha256Hex } from './journal.js';

const fail = (reason) => { throw new Error('LIM journal return: ' + reason); };
const hex = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/i.test(v);

export async function verifyLIMJournalExport(packet) {
  if (!packet || packet.schemaVersion !== 'life-itself-journal-transfer/1.0.0' ||
      typeof packet.sessionId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(packet.sessionId) ||
      !Array.isArray(packet.entries) || packet.entries.length === 0 ||
      packet.entries.length > 5000) fail('envelope');
  const entries = packet.entries;
  let previous = '';
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!e || e.sequence !== i || !Number.isInteger(e.tick) || e.tick < 0 ||
        !['tick_begin','tick_end','action','snapshot'].includes(e.event_type) ||
        e.previous_hash !== previous || !hex(e.checksum) ||
        !e.payload || typeof e.payload !== 'object' || Array.isArray(e.payload)) fail('entry structure/continuity');
    const digest = await sha256Hex(canonical({
      sequence: e.sequence, tick: e.tick, event_type: e.event_type,
      payload: e.payload, previous_hash: e.previous_hash,
    }));
    if (digest !== e.checksum) fail('tampered journal checksum');
    previous = e.checksum;
  }
  const last = entries.at(-1);
  if (last.event_type !== 'tick_end') fail('incomplete tick');
  const cityActions = entries.filter((e) => e.event_type === 'action' &&
    e.payload?.kind === 'city_tick' && Number.isInteger(e.payload.simTick) &&
    Number.isInteger(e.payload.walkers) && Number.isInteger(e.payload.zones) &&
    hex(e.payload.city_state_hash));
  const lastAction = cityActions.at(-1);
  if (!lastAction || lastAction.tick !== last.tick) fail('missing sealed city tick');
  // Return only a derived, small simulated-observation receipt—not the
  // full journal, which may include player messages and other private data.
  return Object.freeze({
    schemaVersion:'life-itself-lim-observation/1.0.0',
    classification:'simulated-observation',
    verification:'complete-journal-hash-chain',
    source:{ system:'life-itself-manhattan', sessionId:packet.sessionId },
    simTick:lastAction.payload.simTick,
    walkers:lastAction.payload.walkers,
    zones:lastAction.payload.zones,
    cityStateHash:lastAction.payload.city_state_hash,
    journalHead:previous,
    journalEntries:entries.length,
    tickEnd:last.tick,
  });
}

// A single-writer outbound observer. Full history crosses loopback for
// verification only; the bridge stores/returns only a derived receipt.
export function makeLIMJournalPublisher({
  endpoint, getEntries, fetchFn = fetch, getAuthToken = () => '',
  sessionId = 'lim-' + crypto.randomUUID().replaceAll('-', ''),
}) {
  if (typeof getEntries !== 'function' || !/^lim-[a-f0-9]{32}$/.test(sessionId))
    fail('publisher configuration');
  let inFlight = false;
  let queued = false;
  let lastPublishedTick = -1;
  let lastError = null;
  let publishedCount = 0;
  async function flush() {
    if (inFlight) { queued = true; return; }
    inFlight = true;
    try {
      do {
        queued = false;
        const entries = getEntries();
        const tail = entries.at(-1);
        if (!tail || tail.event_type !== 'tick_end' || tail.tick <= lastPublishedTick) continue;
        const payload = { schemaVersion:'life-itself-journal-transfer/1.0.0', sessionId, entries };
        const token=getAuthToken();
        if (!/^[a-f0-9]{64}$/.test(token||'')) throw new Error('bridge pairing required');
        const response = await fetchFn(endpoint, {
          method:'POST', headers:{ 'Content-Type':'application/json',Authorization:'Bearer '+token },
          body:JSON.stringify(payload),
        });
        if (!response.ok) throw new Error('return bridge HTTP ' + response.status);
        const receipt = await response.json();
        if (!receipt.accepted || receipt.journalHead !== tail.checksum)
          throw new Error('return bridge receipt mismatch');
        lastPublishedTick = tail.tick;
        publishedCount++;
        lastError = null;
      } while (queued);
    } catch (e) {
      lastError = String(e?.message || e);
    } finally {
      inFlight = false;
    }
  }
  return Object.freeze({
    schedule:() => { void flush(); },
    diagnostics:() => ({ sessionId, inFlight, lastPublishedTick, lastError, publishedCount }),
  });
}
