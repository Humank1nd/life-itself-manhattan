import assert from 'node:assert/strict';
import { StateJournal } from '../src/journal.js';
import { verifyLIMJournalExport, makeLIMJournalPublisher } from '../src/lim-journal-export.js';
const journal=new StateJournal();
await journal.append('snapshot',0,{kind:'ground',buildings:45172});
await journal.append('tick_begin',1,{action:'city_tick'});
await journal.append('action',1,{kind:'city_tick',simTick:1,walkers:96,zones:5,city_state_hash:'b'.repeat(64)});
await journal.append('tick_end',1,{world_hash:'c'.repeat(64)});
const good={schemaVersion:'life-itself-journal-transfer/1.0.0',
 sessionId:'lim-'+'a'.repeat(32),entries:journal.entries};
const obs=await verifyLIMJournalExport(good);
assert.equal(obs.simTick,1);assert.equal(obs.walkers,96);assert.equal(obs.zones,5);
assert.equal(obs.classification,'simulated-observation');
assert(!('entries' in obs) && !('payload' in obs),'raw history must not escape');
for(const breakIt of [
 p=>p.entries[2].payload.walkers=900,
 p=>p.entries[3].checksum='0'.repeat(64),
 p=>p.entries[1].previous_hash='e'.repeat(64),
 p=>p.entries.pop(),
 p=>p.entries[2].payload.city_state_hash='invalid',
 p=>p.sessionId='bad',
]){
 const bad=structuredClone(good);breakIt(bad);
 await assert.rejects(()=>verifyLIMJournalExport(bad));
}
const requests=[];
const publisher=makeLIMJournalPublisher({getEntries:()=>journal.entries,
 sessionId:good.sessionId,endpoint:'http://loopback.test/lim/journal',
 fetchFn:async(_url,options)=>{
  requests.push(JSON.parse(options.body));
  const result=await verifyLIMJournalExport(JSON.parse(options.body));
  return {ok:true,json:async()=>({accepted:true,journalHead:result.journalHead})};
 }});
publisher.schedule();
for(let i=0;i<100 && publisher.diagnostics().inFlight;i++)await new Promise(r=>setTimeout(r,5));
assert.equal(requests.length,1);
assert.equal(publisher.diagnostics().publishedCount,1);
publisher.schedule();
await new Promise(r=>setTimeout(r,10));
assert.equal(requests.length,1,'same sealed tick is not sent twice');
console.log('PASS LIM return proof — complete hash-chain, sanitized derived receipt, 6 tampering/incompleteness rejects, single-writer duplicate guard');
