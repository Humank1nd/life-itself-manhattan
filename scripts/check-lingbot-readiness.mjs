#!/usr/bin/env node
// Read-only local readiness inventory; no installs, downloads or deletion.
import {existsSync,statfsSync}from'node:fs';
import {homedir}from'node:os';
import {join}from'node:path';
import {execFileSync}from'node:child_process';
import {assessLingbotReadiness,checkpointRequiredFiles}from'../src/lingbot-readiness.js';
const home=homedir();
const dir=process.env.LINGBOT_CHECKPOINT_DIR||join(home,'lingbot-world-v2-1.3b-causal-fast');
const shared=process.env.LINGBOT_ASSETS_DIR||join(home,'lingbot-world-v2-14b-causal-fast');
const fs=statfsSync(home);
const freeBytes=Number(fs.bavail)*Number(fs.bsize);
const files=checkpointRequiredFiles();
const present=(root,required)=>required.filter(name=>existsSync(join(root,name)));
let gpuVramMiB=null;
try{
 const out=execFileSync('nvidia-smi',['--query-gpu=memory.total','--format=csv,noheader,nounits'],
  {encoding:'utf8',timeout:3000});
 gpuVramMiB=Number(out.trim().split('\n')[0]);
}catch{}
let flashAttentionInstalled=false;
try{
 execFileSync('python3',['-c','import flash_attn'],{stdio:'ignore',timeout:3500});
 flashAttentionInstalled=true;
}catch{}
const report=assessLingbotReadiness({freeBytes,gpuVramMiB,
 checkpointFiles:present(dir,files.dit),sharedFiles:present(shared,files.shared),
 flashAttentionInstalled,modelLicenseReviewed:false,commercialUse:false});
console.log(JSON.stringify({paths:{checkpoint:dir,sharedAssets:shared},
 checkedAt:'unspecified-local-run',...report},null,2));
if(process.argv.includes('--enforce'))process.exit(report.blockers.length?2:0);
