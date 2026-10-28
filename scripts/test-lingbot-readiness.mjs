import assert from 'node:assert/strict';
import {assessLingbotReadiness,checkpointRequiredFiles,GIB}from'../src/lingbot-readiness.js';
const req=checkpointRequiredFiles();
assert.equal(req.dit.length,7);
assert.equal(req.shared.length,3);
const missing=assessLingbotReadiness({freeBytes:92*1024**2,gpuVramMiB:8192,
 checkpointFiles:[],sharedFiles:[],flashAttentionInstalled:false});
assert.equal(missing.checkpointReady,false);
assert.equal(missing.disk.passes,false);
assert.equal(missing.canDownload,false);
assert.equal(missing.inferenceVerified,false);
assert.ok(missing.blockers.includes('missing-1.3b-dit-files'));
assert.ok(missing.blockers.includes('missing-shared-t5-vae-tokenizer'));
assert.ok(missing.blockers.includes('insufficient-safe-install-storage'));
const complete=assessLingbotReadiness({freeBytes:60*GIB,gpuVramMiB:24576,
 checkpointFiles:req.dit,sharedFiles:req.shared,
 flashAttentionInstalled:true,modelLicenseReviewed:true,commercialUse:false});
assert.equal(complete.checkpointReady,true);
assert.equal(complete.blockers.length,0);
assert.equal(complete.inferenceVerified,false,'files/VRAM do not prove inference');
assert.equal(complete.canAttemptGeneration,false,'no automatic inference from file presence');
const commercial=assessLingbotReadiness({freeBytes:60*GIB,gpuVramMiB:24576,
 checkpointFiles:req.dit,sharedFiles:req.shared,
 flashAttentionInstalled:true,modelLicenseReviewed:true,commercialUse:true});
assert.ok(commercial.blockers.includes('blocked-noncommercial-license'));
console.log('PASS: real disk/weight/shared-assets readiness gates, no auto-download or commercial licensing bypass');
