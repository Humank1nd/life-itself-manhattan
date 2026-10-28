#!/usr/bin/env python3
"""Reproducible building semantic mask pilot (not restoration/inpainting).
Only already-licensed local evidence photos. Never modifies original images.
Model: Microsoft BEiT base ADE20K, Apache-2.0. Results must be visually reviewed.
"""
import argparse, hashlib, json
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
EVIDENCE=ROOT/'data/evidence-v1.json'
MODEL='microsoft/beit-base-finetuned-ade-640-640'
def main():
    p=argparse.ArgumentParser()
    p.add_argument('--limit',type=int,default=4)
    p.add_argument('--device',choices=['auto','cpu','cuda'],default='auto')
    args=p.parse_args()
    import torch
    import torch.nn.functional as F
    from transformers import AutoImageProcessor, BeitForSemanticSegmentation
    doc=json.loads(EVIDENCE.read_text())
    photos=[x for x in doc['photos'] if x['rights'] in ('original','licensed-for-web','public-domain') and
            x.get('license',{}).get('label') and x.get('modelTrainingPermission')!='denied'][:args.limit]
    if not photos: print('No eligible photos');return
    processor=AutoImageProcessor.from_pretrained(MODEL)
    model=BeitForSemanticSegmentation.from_pretrained(MODEL,use_safetensors=False).eval()  # official Apache-2.0 weights; weights-only loader
    device='cuda' if args.device=='auto' and torch.cuda.is_available() else ('cpu' if args.device=='auto' else args.device)
    model=model.to(device)
    labels={int(k):v.lower() for k,v in model.config.id2label.items()}
    building_ids=[i for i,v in labels.items() if v in ('building','building, edifice') or v.startswith('building,')]
    if not building_ids:raise RuntimeError('building not present in model label set')
    print('MODEL',MODEL,'DEVICE',device,'building labels',[(i,labels[i]) for i in building_ids],flush=True)
    outdir=ROOT/'assets/evidence/masks';outdir.mkdir(parents=True,exist_ok=True)
    for photo in photos:
        src=ROOT/photo['imageUri']
        if not src.resolve().is_relative_to((ROOT/'assets/evidence').resolve()):
            raise ValueError('image outside local asset directory')
        if hashlib.sha256(src.read_bytes()).hexdigest()!=photo['sha256']:
            raise ValueError('source image hash changed '+photo['id'])
        img=Image.open(src).convert('RGB')
        inp=processor(images=img,return_tensors='pt').to(device)
        with torch.no_grad(): logits=model(**inp).logits
        logits=F.interpolate(logits,size=(img.height,img.width),mode='bilinear',align_corners=False)
        pred=logits.argmax(dim=1)[0]
        mask=torch.zeros_like(pred,dtype=torch.uint8)
        for class_id in building_ids: mask[pred==class_id]=255
        mask=Image.fromarray(mask.cpu().numpy(),'L')
        frac=round(sum(1 for val in mask.get_flattened_data() if val>0)/(img.width*img.height),4)
        maskpath=outdir/(photo['id']+'-building.png')
        mask.save(maskpath,optimize=True)
        rgba=img.convert('RGBA');rgba.putalpha(mask)
        cutout=outdir/(photo['id']+'-cutout.png')
        rgba.save(cutout,optimize=True)
        photo['segmentation']={
           'model':MODEL, 'modelLicense':'Apache-2.0', 'task':'semantic-building-isolation',
           'maskUri':maskpath.relative_to(ROOT).as_posix(),
           'cutoutUri':cutout.relative_to(ROOT).as_posix(),
           'maskSha256':hashlib.sha256(maskpath.read_bytes()).hexdigest(),
           'sourceSha256':photo['sha256'],
           'buildingPixelFraction':frac,
           'status':'machine-proposed-unreviewed',
           'limitations':'Occluded building regions are not restored; nonbuilding pixels are masked, not hallucinated'}
        print('MASK',photo['id'],'building fraction',frac,flush=True)
    EVIDENCE.write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n')
if __name__=='__main__':main()
