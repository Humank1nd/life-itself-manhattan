#!/usr/bin/env node
// GitHub-hosted CI only. No Houston/local execution or persistent render output.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {resolve,extname,isAbsolute,join,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import puppeteer from 'puppeteer';
import {PNG} from 'pngjs';

const ROOT=resolve('.');
const OUT=process.env.CAPTURE_OUT;
assert(process.env.GITHUB_ACTIONS==='true'&&process.env.RUNNER_TEMP,
 'Cloud-only capture: requires GitHub-hosted Actions environment; never run on Houston');
assert(process.env.RUNNER_ENVIRONMENT==='github-hosted',
 'Cloud-only capture: no self-hosted runner permitted');
assert(typeof OUT==='string'&&isAbsolute(OUT) &&
 OUT.startsWith(resolve(process.env.RUNNER_TEMP)+sep),
 'Capture output must be under ephemeral GitHub runner.temp');
const HOST='127.0.0.1';
const snapshot='2026-10-28';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const mime={'.js':'text/javascript','.json':'application/json',
 '.html':'text/html','.css':'text/css','.wasm':'application/wasm'};
const server=createServer((req,res)=>{
 try{
  const uri=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=resolve(ROOT,'.'+uri);
  if(!file.startsWith(ROOT+sep)||!['GET','HEAD'].includes(req.method)){
   res.writeHead(403);res.end();return;
  }
  const stream=createReadStream(file);
  stream.on('error',()=>{if(!res.headersSent)res.writeHead(404);res.end();});
  res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');
  if(req.method==='HEAD'){res.writeHead(200);res.end();stream.destroy();return;}
  stream.pipe(res);
 }catch{res.writeHead(400);res.end();}
});
const listen=()=>new Promise((ok,fail)=>server.once('error',fail).listen(0,HOST,ok));
const close=()=>new Promise(ok=>server.close(ok));
const pngInfo=buffer=>{
 assert(buffer.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')),
  'non-PNG capture output');
 const image=PNG.sync.read(buffer);
 assert.equal(image.width,640);assert.equal(image.height,360);
 return image;
};
function nonBackgroundPixels(png){
 let n=0;
 for(let i=0;i<png.data.length;i+=4) {
  if(png.data[i]||png.data[i+1]||png.data[i+2])n++;
 }
 return n;
}
let browser;
try {
 await listen();
 await mkdir(OUT,{recursive:true});
 browser=await puppeteer.launch({
  headless:true,
  args:['--no-sandbox','--disable-dev-shm-usage',
   '--use-gl=angle','--use-angle=swiftshader','--enable-webgl',
   '--disable-features=UseSkiaRenderer']
 });
 const page=await browser.newPage();
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.setViewport({width:640,height:360,deviceScaleFactor:1});
 await page.goto(`http://${HOST}:${server.address().port}/capture/times-square.html`,{
  waitUntil:'domcontentloaded',timeout:30000
 });
 await page.waitForFunction(()=>window.__captureReady===true||window.__captureError,{
  timeout:60000
 });
 const info=await page.evaluate(()=>({info:window.__captureInfo(),error:window.__captureError}));
 assert(!info.error,'browser initialization error: '+info.error);
 assert(info.info?.snapshotAt===snapshot && info.info.geometryStatus==='current-snapshot-only',
  'capture not sourced from current snapshot');
 assert.equal(info.info.buildingVersions,622);
 assert.equal(info.info.cameras.length,3);
 assert(!info.info.trainingDataApproved && info.info.modelsExecuted.length===0,
  'capture must not imply world-model training');
 const original=JSON.parse(await readFile(join(ROOT,'data/times-square-building-versions-v1.json'),'utf8'));
 assert.equal(original.versions.length,622);
 const sourceHashes={
  cityManifestSha256:hash(await readFile(join(ROOT,'data/city-scene-v1.json'))),
  buildingVersionsSha256:hash(await readFile(join(ROOT,'data/times-square-building-versions-v1.json')))
 };
 const captures=[];
 const samples={};
 for(const pose of info.info.cameras){
  for(const pass of ['rgb','depth','building-id']){
   const base64=await page.evaluate((i,p)=>window.__captureFrame(i,p),pose.index,pass);
   const data=Buffer.from(base64,'base64');
   const decoded=pngInfo(data);
   const foreground=nonBackgroundPixels(decoded);
   assert(foreground>150,'empty '+pass+' frame '+pose.index);
   const filename=`pose-${String(pose.index).padStart(2,'0')}-${pass}.png`;
   const output=join(OUT,filename);
   await writeFile(output,data,{flag:'wx'});
   captures.push({cameraIndex:pose.index,pass,filename,sha256:hash(data),
    bytes:data.length,width:decoded.width,height:decoded.height,nonBlackPixels:foreground});
   if(pose.index===0)samples[pass]={hash:hash(data),image:decoded};
  }
 }
 const identities=info.info.identity;
 // Zero is background; every observed foreground ID must resolve to an
 // authoritative 2026 building version (no arbitrary generated labels).
 const observed=new Set(), ids=samples['building-id'].image.data;
 for(let i=0;i<ids.length;i+=4){
  const id=(ids[i]<<16)|(ids[i+1]<<8)|ids[i+2];
  if(!id)continue;
  assert(identities[id],'building-id pass contains unknown ID '+id);
  observed.add(id);
 }
 assert(observed.size>=3,'too few visible, source-identified building meshes');
 assert.notEqual(samples.rgb.hash,samples['building-id'].hash,
  'RGB and building-ID captures accidentally identical');
 assert.notEqual(samples.depth.hash,samples['building-id'].hash,
  'depth and building-ID captures accidentally identical');
 // Render the same camera/pass twice; exact re-capture in the same runner must match.
 for(const pass of ['rgb','depth','building-id']){
  const repeated=Buffer.from(await page.evaluate(p=>window.__captureFrame(0,p),pass),'base64');
  assert.equal(hash(repeated),samples[pass].hash,
   'nondeterministic same-run recapture for '+pass);
 }
 assert.equal(errors.length,0,'browser errors: '+errors.join('; ').slice(0,1000));
 const metadata={
  ...info.info,
  ...sourceHashes,
  gitCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  workflow:'cloud-times-square-capture',
  environment:'github-hosted-ephemeral',
  artifactRetentionDays:3,
  licensePolicy:'current NYC Open Data geometry only; no third-party pretrained model or historical image',
  outputsAreHistoricalGroundTruth:false,
  trainingUseAuthorization:'not-established',
  outputCount:captures.length,
  observedVisibleBuildingIds:[...observed].sort((a,b)=>a-b),
  captures
 };
 await writeFile(join(OUT,'manifest.json'),JSON.stringify(metadata,null,2)+'\n',{flag:'wx'});
 assert.equal(captures.length,9);
 console.log('PASS cloud Times Square capture:',{
  buildingVersions:info.info.buildingVersions,
  meshes:info.info.meshes,frames:captures.length,
  visibleBuildingIds:observed.size,
  sourceHashes,manifest:join(OUT,'manifest.json'),
  deterministic:true,sceneErrors:errors.length
 });
} finally {
 if(browser)await browser.close();
 await close();
}
