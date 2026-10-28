#!/usr/bin/env python3
"""Panoptic building regions and preliminary vertical façade-region partitions.
Model sees 'building' as a stuff class; splits are hypotheses, NOT identified
individual buildings. Never call candidates reliable building-instance masks.
"""
import argparse,hashlib,json,math,torch,numpy as np
from pathlib import Path
from PIL import Image
from scipy.ndimage import label
from transformers import OneFormerForUniversalSegmentation,OneFormerProcessor
ROOT=Path(__file__).resolve().parents[1]
INPUT=ROOT/'data/evidence-v1.json'
OUTPUT=ROOT/'data/facade-instances-v1.json'
ASSETS=ROOT/'assets/evidence/facades'
MODEL='shi-labs/oneformer_ade20k_swin_tiny'
def main():
  ap=argparse.ArgumentParser()
  ap.add_argument('--limit',type=int,default=4)
  ap.add_argument('--device',choices=['auto','cpu','cuda'],default='auto')
  opt=ap.parse_args()
  if opt.limit<1 or opt.limit>12:ap.error('pilot only: 1..12')
  photos=json.loads(INPUT.read_text())['photos'][:opt.limit]
  device='cuda' if opt.device=='auto' and torch.cuda.is_available() else ('cpu' if opt.device=='auto' else opt.device)
  print('Loading OneFormer MIT-licensed panoptic model',flush=True)
  processor=OneFormerProcessor.from_pretrained(MODEL)
  model=OneFormerForUniversalSegmentation.from_pretrained(MODEL,use_safetensors=False).to(device).eval()
  ASSETS.mkdir(parents=True,exist_ok=True)
  result=[]
  for photo in photos:
    uri=ROOT/photo['imageUri']
    if not uri.resolve().is_relative_to((ROOT/'assets/evidence').resolve()):
      raise RuntimeError('source path outside evidence assets')
    if hashlib.sha256(uri.read_bytes()).hexdigest()!=photo['sha256']:
      raise RuntimeError('source checksum mismatch')
    im=Image.open(uri).convert('RGB')
    img=np.asarray(im)
    inp=processor(images=im,task_inputs=['panoptic'],return_tensors='pt').to(device)
    with torch.no_grad(): pred=model(**inp)
    out=processor.post_process_panoptic_segmentation(pred,target_sizes=[(im.height,im.width)])[0]
    seg=out['segmentation'].cpu().numpy()
    regions=[]
    for entry in out['segments_info']:
      if model.config.id2label.get(entry['label_id'],'').lower()!='building':continue
      mask=seg==entry['id']
      cc,n=label(mask)
      for k in range(1,n+1):
        part=cc==k
        if part.sum()<im.width*im.height*.02:continue
        regions.append((part,float(entry['score'])))
    # ADE20K building is a stuff class and often combines multiple physical buildings.
    # Partition broad building masses into candidate regions by image-column seams.
    # A visual/pose model must later prove which are separate facades.
    partitions=[]
    for part,score in regions:
      yy,xx=np.nonzero(part)
      x0,x1=int(xx.min()),int(xx.max())+1
      y0,y1=int(yy.min()),int(yy.max())+1
      width=x1-x0
      count=1 if width<im.width*.28 else min(4,max(2,round(width/(im.width*.28))))
      if count==1: partitions.append((part,score,'oneformer-connected-panoptic-building-region')); continue
      # Heuristic seams chosen from strong vertical image gradients near even slices.
      gray=(img[:,:,0].astype('float32')*.299+img[:,:,1].astype('float32')*.587+img[:,:,2].astype('float32')*.114)
      grad=np.abs(gray[:,2:]-gray[:,:-2])
      col=np.zeros(im.width)
      col[1:-1]=(grad*part[:,1:-1]).sum(axis=0)/np.maximum(part[:,1:-1].sum(axis=0),1)
      cuts=[x0]
      for j in range(1,count):
        center=x0+round(j*width/count)
        span=max(4,int(width*.065))
        lo=max(cuts[-1]+int(width*.12),center-span)
        hi=min(x1-int(width*.12),center+span)
        if lo>=hi:continue
        cut=int(lo+np.argmax(col[lo:hi]))
        cuts.append(cut)
      cuts.append(x1)
      for left,right in zip(cuts,cuts[1:]):
        proposed=np.zeros_like(part)
        proposed[:,left:right]=part[:,left:right]
        if proposed.sum()<im.width*im.height*.015:continue
        partitions.append((proposed,score,'panoptic-building-region-vertical-edge-partition'))
    for idx,(part,score,method) in enumerate(partitions[:12],1):
      yy,xx=np.nonzero(part)
      if len(xx)==0: continue
      x0,x1=int(xx.min()),int(xx.max())+1
      y0,y1=int(yy.min()),int(yy.max())+1
      fn=photo['id']+'-facade-'+str(idx).zfill(2)+'.png'
      mask=Image.fromarray((part*255).astype('uint8'),'L')
      mask.save(ASSETS/fn,optimize=True)
      rec={
        'id':photo['id']+'-facade-'+str(idx).zfill(2),
        'photoId':photo['id'],'maskUri':'assets/evidence/facades/'+fn,
        'maskSha256':hashlib.sha256((ASSETS/fn).read_bytes()).hexdigest(),
        'bboxXYWH':[x0,y0,x1-x0,y1-y0],
        'segmentationConfidence':round(score,5),
        'pixelArea':int(part.sum()),'imageWidth':im.width,'imageHeight':im.height,
        'method':method,'model':MODEL,'modelLicense':'MIT',
        'uniqueInstance':False,
        'status':'machine-proposed-unreviewed',
        'modelTrainingPermission':'unreviewed',
        'note':'Building-like segment/vertical partition; may span or split physical buildings. Require independent camera pose and visual match to identify facade.'
      }
      result.append(rec)
    print(photo['id'],'building segments',len(regions),'candidate masks',len(partitions),flush=True)
  doc={'schemaVersion':'life-itself-facade-instances/1.0.0',
     'worldId':'life-itself:manhattan',
     'segmentationMethod':'OneFormer ADE20K panoptic + bounded vertical partitions; NOT guaranteed one physical facade per region',
     'instances':result}
  OUTPUT.write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n')
  print('UNREVIEWED CANDIDATES:',len(result),'verified individual building identities: 0',flush=True)
if __name__=='__main__':main()
