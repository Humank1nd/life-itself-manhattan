#!/usr/bin/env node
// One fixed Times Square 2005 photo + three-step synthetic camera path.
// --prepare is safe/offline. --health reads service only. --execute is gated.
import {readFileSync,writeFileSync,mkdirSync}from'node:fs';
import {createHash}from'node:crypto';
import {dirname,resolve}from'node:path';
import {fileURLToPath}from'node:url';
import {createTimesSquareConditioning,validateConditioningPacket,
 pingLingbot,runLingbotOnce}from'../src/world-model-conditioning.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=name=>JSON.parse(readFileSync(new URL(name,new URL('../',import.meta.url)),'utf8'));
const args=new Set(process.argv.slice(2));
const allowed=new Set(['--prepare','--health','--execute','--approve-local-inference','--rights-reviewed']);
if([...args].some(a=>!allowed.has(a))){
 console.error('Usage: node scripts/lingbot-pilot.mjs --prepare | --health | --execute --approve-local-inference --rights-reviewed');
 process.exit(2);
}
const memory=read('data/spatial-memory-v1.json');
const evidence=read('data/evidence-v1.json');
const packet=createTimesSquareConditioning(memory,evidence);
validateConditioningPacket(packet);
const manifest='data/lingbot-conditioning-pilot-v1.json';
if(args.has('--prepare')||args.size===0){
 writeFileSync(new URL(manifest,new URL('../',import.meta.url)),JSON.stringify(packet,null,2)+'\n');
 console.log('PREPARED',manifest,'photo='+packet.photo.id,'year='+packet.year,
  'waypoints='+packet.camera.providerWaypointsCm.length,
  'history geometry='+packet.worldMemory.retrievedCurrentGeometryPlanes,
  'model training=NOT AUTHORIZED; no provider request');
}
if(args.has('--health')||args.has('--execute')){
 let state;
 try {state=await pingLingbot();}
 catch(e){ console.log('BLOCKED local LingBot unavailable:',e.message);process.exit(0);}
 console.log('LINGBOT HEALTH',JSON.stringify(state));
 if(args.has('--execute')){
  if(!args.has('--approve-local-inference')||!args.has('--rights-reviewed')){
   console.error('BLOCKED: explicit --approve-local-inference and --rights-reviewed required');
   process.exit(3);
  }
  if(!state.weightsReady){
   console.log('BLOCKED: weights not ready; no generation POST, no model frames');
   process.exit(0);
  }
  const imgPath=resolve(root,packet.photo.localAsset);
  const sha=createHash('sha256').update(readFileSync(imgPath)).digest('hex');
  if(sha!==packet.photo.sha256)throw new Error('original source digest mismatch');
  const result=await runLingbotOnce(packet,readFileSync(imgPath).toString('hex'),
    {approvedLocalInference:true,rightsReviewed:true});
  console.log('INFERENCE RESULT',JSON.stringify(result));
 }
}
