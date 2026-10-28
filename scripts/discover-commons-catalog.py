#!/usr/bin/env python3
"""Bounded, idempotent Commons category discovery. Metadata only; no image downloads.
Two stages: catalog candidate -> separately reviewed locally ingested evidence.
Run: python3 scripts/discover-commons-catalog.py --max-files 360
"""
import argparse,datetime,html,json,re,time,urllib.parse,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
API='https://commons.wikimedia.org/w/api.php'
OUT=ROOT/'data/photo-catalog-v1.json'
UA='LifeItselfManhattanResearch/0.2 (https://github.com/Humank1nd/life-itself-manhattan)'
CATEGORIES=['Times Square in the 1900s','Times Square in the 1910s',
 'Times Square in the 1920s','Times Square in the 1930s',
 'Times Square in the 1940s','Times Square in the 1950s',
 'Times Square in the 1960s','Times Square in the 1970s',
 'Times Square in the 1980s','Times Square in the 2000s',
 'Times Square in the 2010s','2024 in Times Square']
ALLOWED={'CC BY 2.0','CC BY 2.5','CC BY 3.0','CC BY 4.0',
 'CC BY-SA 2.0','CC BY-SA 2.5','CC BY-SA 3.0','CC BY-SA 4.0',
 'CC0','CC0 1.0','Public domain'}
EXIF=re.compile(r'(18\d\d|19\d\d|20\d\d):(\d\d):(\d\d)(?:\D|$)')
ISO=re.compile(r'(?<!\d)((?:18|19|20)\d\d)-(\d\d)-(\d\d)(?!\d)')
HTML=re.compile(r'<[^>]*>')
def clean(s): return ' '.join(html.unescape(HTML.sub(' ',s or '')).split())[:380]
def request(params):
    url=API+'?'+urllib.parse.urlencode(params)
    for attempt in range(4):
        try:
            req=urllib.request.Request(url,headers={'User-Agent':UA})
            with urllib.request.urlopen(req,timeout=30) as resp:
                data=json.load(resp)
            if data.get('error'):
                code=data['error'].get('code','')
                if code in ('maxlag','cirrussearch-too-busy-error') and attempt<3:
                    time.sleep((attempt+1)*2);continue
                raise RuntimeError(str(data['error']))
            return data
        except (TimeoutError,OSError) as exc:
            if attempt==3:raise
            time.sleep(2*(attempt+1))
    raise RuntimeError('API retry exhausted')
def capture(info,ext):
    for m in info.get('metadata',[]):
        if m.get('name')=='DateTimeOriginal':
            e=EXIF.search(str(m.get('value','')))
            if e:
                try:return datetime.date(*map(int,e.groups())).isoformat(),'exif-original'
                except ValueError:pass
    raw=clean(ext.get('DateTimeOriginal',{}).get('value',''))
    e=ISO.search(raw)
    if e:
        try:return datetime.date(*map(int,e.groups())).isoformat(),'commons-original-date'
        except ValueError:pass
    return None,'unverified'
def get_page_ids(category,quota=80):
    ids=[];cont={}
    while len(ids)<quota:
        q={'action':'query','list':'categorymembers','cmtitle':'Category:'+category,
           'cmtype':'file','cmlimit':str(min(50,quota-len(ids))), 'format':'json','maxlag':'5',**cont}
        d=request(q)
        ids += [x['pageid'] for x in d.get('query',{}).get('categorymembers',[]) if x.get('ns')==6]
        token=d.get('continue')
        if not token: break
        cont={k:v for k,v in token.items() if k in ('continue','cmcontinue')}
        if not cont.get('cmcontinue'):break
        time.sleep(0.25)
    return ids[:quota]
def extract(page,source_category):
    if page.get('missing') or not page.get('imageinfo'):return None
    info=page['imageinfo'][0]
    if info.get('mime') not in ('image/jpeg','image/png'):return None
    lic=clean(info.get('extmetadata',{}).get('LicenseShortName',{}).get('value',''))
    if lic not in ALLOWED:return None
    thumb=info.get('thumburl')
    if not thumb or not thumb.startswith(('https://upload.wikimedia.org/','https://thumb.wikimedia.org/')):return None
    src=info.get('descriptionurl','')
    if not src.startswith('https://commons.wikimedia.org/wiki/File:'):return None
    ext=info.get('extmetadata',{})
    capture_date,precision=capture(info,ext)
    # A digitized historical photo may have modern scanning EXIF; never
    # mislabel the scan date as its early-1900s historical capture year.
    m=re.search(r'(18|19|20)[0-9]0s',source_category)
    year_cat=re.search(r'^(18|19|20)[0-9][0-9] in Times Square$',source_category)
    year_start=int(m.group()[:4]) if m else (int(year_cat.group().split()[0]) if year_cat else None)
    year_end=(year_start+9 if m else year_start) if year_start is not None else None
    if capture_date and year_start is not None and not year_start<=int(capture_date[:4])<=year_end:
        capture_date,precision=None,'unverified'
    coord=page.get('coordinates',[None])[0]
    location=None
    if isinstance(coord,dict):
        lat,lon=coord.get('lat'),coord.get('lon')
        if isinstance(lat,(int,float)) and isinstance(lon,(int,float)) and 40.68<=lat<=40.89 and -74.04<=lon<=-73.90:
            location={'lat':lat,'lon':lon,'accuracy':'unverified-commons-geotag','geotagRole':'unspecified'}
    return {
      'id':'commons-'+str(page['pageid']),
      'title':page.get('title',''),
      'sourceUrl':src,
      'previewUrl':thumb,
      'originalUrl':info.get('url',''),
      'license':{'label':lic,'url':ext.get('LicenseUrl',{}).get('value',''),'author':clean(ext.get('Artist',{}).get('value','')) or 'Unknown — attribution needs review'},
      'capturedAt':capture_date,'dateBasis':precision,
      'location':location,'sourceCategory':source_category,
      'discoveryStatus':'candidate-unreviewed',
      'modelTrainingPermission':'unreviewed'
    }
def main():
    p=argparse.ArgumentParser()
    p.add_argument('--max-files',type=int,default=360)
    p.add_argument('--per-category',type=int,default=85)
    p.add_argument('--dry-run',action='store_true')
    a=p.parse_args()
    if a.max_files<1 or a.max_files>1000 or a.per_category<1 or a.per_category>500:p.error('bounds exceeded')
    seen=set();ordered=[]
    for cat in CATEGORIES:
        try: ids=get_page_ids(cat,min(a.per_category,a.max_files-len(ordered)))
        except Exception as e:
            print('CATEGORY_FAILED',cat,type(e).__name__,str(e),flush=True);continue
        for page_id in ids:
            if page_id not in seen:seen.add(page_id);ordered.append((page_id,cat))
        print('DISCOVER',cat,len(ids),'unique',len(ordered),flush=True)
        if len(ordered)>=a.max_files:break
        time.sleep(0.3)
    candidates=[];errors=0
    for offset in range(0,len(ordered),25):
        chunk=ordered[offset:offset+25]
        cats=dict(chunk)
        try:
            q={'action':'query','pageids':'|'.join(map(str,cats)),
               'prop':'imageinfo|coordinates','iiprop':'url|extmetadata|metadata|mime',
               'iiurlwidth':'480','format':'json','maxlag':'5'}
            data=request(q)
            for page in data.get('query',{}).get('pages',{}).values():
                rec=extract(page,cats.get(int(page.get('pageid',-1)),'unknown'))
                if rec:candidates.append(rec)
        except Exception as e:
            errors+=1;print('DETAIL_FAILED',offset,type(e).__name__,str(e),flush=True)
        time.sleep(0.4)
    records=sorted(candidates,key=lambda p:p['id'])
    out={'schemaVersion':'life-itself-photo-catalog/1.0.0','worldId':'life-itself:manhattan',
         'ingestionPolicy':'Metadata discovery only. No mass download or automatic historical assertion.',
         'source':'Wikimedia Commons categorymember + imageinfo/coordinates APIs',
         'categories':CATEGORIES,'records':records}
    placed=sum(1 for x in records if x['location'])
    timed=sum(1 for x in records if x['capturedAt'])
    grounded=sum(1 for x in records if x['location'] and x['capturedAt'])
    print('SUMMARY',json.dumps({'enumerated':len(ordered),'licensedCandidates':len(records),
     'mappedUnreviewed':placed,'datedUnreviewed':timed,'mappedAndDatedUnreviewed':grounded,'detailFailures':errors}),flush=True)
    if not a.dry_run:
        OUT.write_text(json.dumps(out,indent=2,ensure_ascii=False)+'\n')
        print('WROTE',OUT,flush=True)
if __name__=='__main__':main()
