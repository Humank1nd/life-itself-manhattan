// Phase 014 readiness gate. Only inspect user-owned local paths.
// Never downloads, deletes, mounts, installs, or trains any model.
export const GIB=1024**3;
const mandatory={
  dit:['model.safetensors.index.json',...Array.from({length:6},(_,i)=>'model-'+String(i+1).padStart(5,'0')+'-of-00006.safetensors')],
  shared:['models_t5_umt5-xxl-enc-bf16.pth','Wan2.1_VAE.pth',
    'google/umt5-xxl/spiece.model']
};
export const OFFICIAL_DIT_EXPECTED_BYTES=6841668134;
export function assessLingbotReadiness({
 freeBytes,gpuVramMiB,checkpointFiles=[],sharedFiles=[],
 flashAttentionInstalled=false,modelLicenseReviewed=false,commercialUse=false}){
 const present=new Set(checkpointFiles),assets=new Set(sharedFiles);
 const missingDit=mandatory.dit.filter(f=>!present.has(f));
 const missingShared=mandatory.shared.filter(f=>!assets.has(f));
 const enoughDiskForInstall=Number.isFinite(freeBytes)&&freeBytes>=30*GIB;
 const single8GBExperiment=Number.isFinite(gpuVramMiB)&&gpuVramMiB>=8192;
 const licensing= commercialUse ? 'blocked-noncommercial-license' :
   modelLicenseReviewed ? 'reviewed-for-noncommercial-experiment' : 'needs-license-review';
 const blocks=[];
 if(missingDit.length)blocks.push('missing-1.3b-dit-files');
 if(missingShared.length)blocks.push('missing-shared-t5-vae-tokenizer');
 if(!enoughDiskForInstall)blocks.push('insufficient-safe-install-storage');
 if(!single8GBExperiment)blocks.push('gpu-below-unverified-local-experiment-baseline');
 if(!flashAttentionInstalled)blocks.push('flashattention-unavailable');
 if(licensing!=='reviewed-for-noncommercial-experiment')blocks.push(licensing);
 return {
  checkpointReady:missingDit.length===0&&missingShared.length===0,
  inferenceVerified:false, // Loading and generating are separately measured
  license:'CC BY-NC-SA 4.0',licensing,
  disk:{freeBytes,safeDownloadThresholdBytes:30*GIB,passes:enoughDiskForInstall},
  gpu:{vramMiB:gpuVramMiB,experimentalSingle8GB:single8GBExperiment,
    requiredOfficialGPUCount:4,singleGPUInferenceVerified:false},
  checkpoint:{sourceRepo:'robbyant/lingbot-world-v2-1.3b-causal-fast',
    expectedPublishedTotalBytes:OFFICIAL_DIT_EXPECTED_BYTES,
    missingDit,missingShared},
  flashAttentionInstalled,
  blockers:blocks,
  canDownload:false,
  canAttemptGeneration:false,
  action:'Recover storage and legal permissions first; independently validate GPU/weights before any inference'
 };
}
export const checkpointRequiredFiles=()=>structuredClone(mandatory);
