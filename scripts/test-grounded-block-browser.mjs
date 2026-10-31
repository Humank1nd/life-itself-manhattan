import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire('/tmp/opencode/gev-return-leg/package.json');
const puppeteer=require('puppeteer');
const screenshot=process.env.GRAYBOX_SHOT||'/tmp/s3-002-broad-street-graybox.png';
const evidence=process.env.GRAYBOX_EVIDENCE||'/tmp/s3-002-broad-street-graybox.json';
const browser=await puppeteer.launch({headless:true,executablePath:'/usr/bin/google-chrome',
  args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader'],
  defaultViewport:{width:1440,height:900}});
const result={pass:false,error:null};
try{
 const page=await browser.newPage();
 const errors=[];
 const responses=[];
 page.on('pageerror',e=>errors.push(String(e?.message||e)));
 page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text())});
 page.on('response',r=>{if(r.url().includes('manhattan-enu.json')||r.url().includes('streets-enu.json'))responses.push({url:r.url().split('/').at(-1),status:r.status()})});
 await page.goto('http://127.0.0.1:8187/s3-graybox.html',{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForFunction(()=>window.__s3Graybox!==undefined,{timeout:90000});
 await page.waitForFunction(()=>window.__s3Graybox?.()?.ready===true,{timeout:90000});
 await new Promise(r=>setTimeout(r,900));
 const status=await page.evaluate(()=>window.__s3Graybox());
 assert.equal(status.schemaVersion,'life-itself-playable-graybox/1.0.0');
 assert.equal(status.buildings,18);
 assert.equal(status.lanes,27);
 assert.equal(status.features,2);
 assert.equal(status.conflicts,55);
 assert.equal(status.blockedSpans,6);
 assert.equal(status.collisionFree,false,'do NOT hide geometry overlaps');
 assert.deepEqual(status.featureIds,['dumpster-1','dumpster-2']);
 assert.equal(errors.length,0,'zero page errors '+JSON.stringify(errors));
 assert(responses.length===2&&responses.every(r=>r.status===200));
 await page.screenshot({path:screenshot});
 Object.assign(result,{pass:true,status,responses,pageErrors:0,screenshot});
 console.log('PASS S3-002 browser '+JSON.stringify(result));
}catch(error){result.error=String(error?.message||error);console.error('FAIL S3-002 browser',result.error);process.exitCode=1;}
finally{await writeFile(evidence,JSON.stringify(result,null,2)+'\n');await browser.close();}
