#!/usr/bin/env python3
"""Permission-gated pilot of Commons geotagged Manhattan photographs.
No general scraping; uses Commons API. Training permission is never assumed.
Usage: python3 scripts/ingest-commons-times-square.py --limit 8
"""
import argparse, datetime, hashlib, html, json, re, time
from math import asin, cos, radians, sin, sqrt
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
ROOT=Path(__file__).resolve().parents[1]
REGISTRY=ROOT/'data/evidence-v1.json'
PHOTO_DIR=ROOT/'assets/evidence'
API='https://commons.wikimedia.org/w/api.php'
AGENT='LifeItselfManhattanEvidencePilot/0.1 (https://github.com/Humank1nd/life-itself-manhattan)'
ALLOWED={'CC BY 2.0','CC BY 2.5','CC BY 3.0','CC BY 4.0','CC BY-SA 2.0','CC BY-SA 2.5','CC BY-SA 3.0','CC BY-SA 4.0','CC0','CC0 1.0','Public domain'}
EXIF=re.compile(r'(18\d\d|19\d\d|20\d\d):(\d\d):(\d\d)(?:\D|$)')
CLEAN=re.compile(r'<[^>]*>')
def clean(txt):
    return ' '.join(html.unescape(CLEAN.sub(' ',txt or '')).split())[:500]
def dist_m(lat1,lon1,lat2,lon2):
    a,b=radians(lat2-lat1),radians(lon2-lon1)
    h=sin(a/2)**2+cos(radians(lat1))*cos(radians(lat2))*sin(b/2)**2
    return 2*6371000*asin(min(1,sqrt(h)))
def get(url,limit=1800000):
    req=Request(url,headers={'User-Agent':AGENT})
    with urlopen(req,timeout=25) as r:
        if r.headers.get('Content-Length') and int(r.headers['Content-Length'])>limit: raise ValueError('too large')
        data=r.read(limit+1)
        if len(data)>limit: raise ValueError('too large')
        return data,r.headers.get('Content-Type','').split(';')[0]
def ecef(lat,lon,h):
    a=6378137.0; ecc2=6.69437999014e-3
    t=radians(lat); l=radians(lon)
    n=a/sqrt(1-ecc2*sin(t)**2)
    return ((n+h)*cos(t)*cos(l),(n+h)*cos(t)*sin(l),(n*(1-ecc2)+h)*sin(t))
def to_enu(lat,lon,origin):
    lat0,lon0=map(radians,(origin['lat'],origin['lon']))
    x,y,z=ecef(lat,lon,origin['elev'])
    x0,y0,z0=ecef(origin['lat'],origin['lon'],origin['elev'])
    dx,dy,dz=x-x0,y-y0,z-z0
    east=-sin(lon0)*dx+cos(lon0)*dy
    north=-sin(lat0)*cos(lon0)*dx-sin(lat0)*sin(lon0)*dy+cos(lat0)*dz
    up=cos(lat0)*cos(lon0)*dx+cos(lat0)*sin(lon0)*dy+sin(lat0)*dz
    return {'lat':lat,'lon':lon,'x':round(east,4),'y':round(up,4),'z':round(-north,4),
        'accuracy':'approximate-geotag','geotagRole':'unspecified'}
def exif_date(info):
    for d in info.get('metadata',[]):
        if d.get('name')!='DateTimeOriginal':continue
        match=EXIF.search(str(d.get('value','')))
        if match:
            try:
                day=datetime.date(*map(int,match.groups()))
                if 1800<=day.year<=2026:return day.isoformat()
            except ValueError:pass
    return None
def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--limit',type=int,default=8)
    ap.add_argument('--dry-run',action='store_true')
    a=ap.parse_args()
    if a.limit<1 or a.limit>25:ap.error('limit must be between 1 and 25')
    evidence=json.loads(REGISTRY.read_text())
    origin=json.loads((ROOT/'data/anchors-enu.json').read_text())['origin']
    existing={p['id'] for p in evidence['photos']}
    # Explicit discovered Commons titles avoid overloaded geosearch infrastructure.
    # This pilot can later be supplemented by a paginated geosearch indexer.
    titles=[
        'File:NYC Times Square wide angle.jpg',
        'File:Times Square at night in New York - NYC - USA - panoramio.jpg',
        'File:Times Square New York City - panoramio.jpg',
        'File:NYC – Broadway – Times Square - panoramio.jpg',
        # Exclude non-building subject images from the initial facade pilot.
    ]
    query={'action':'query','titles':'|'.join(titles),'prop':'imageinfo|coordinates',
        'iiprop':'url|extmetadata|metadata','iiurlwidth':'640','format':'json','maxlag':'5'}
    url=API+'?'+urlencode(query)
    for attempt in range(4):
        payload,_=get(url,4000000)
        answer=json.loads(payload)
        if not answer.get('error'):break
        print('Commons API busy; backing off',attempt+1,answer['error'].get('code'))
        if attempt==3:raise RuntimeError(str(answer['error']))
        time.sleep(2*(attempt+1))
    pages=sorted(answer.get('query',{}).get('pages',{}).values(),key=lambda x:x.get('pageid',0))
    accepted=[]
    for page in pages:
        if len(accepted)>=a.limit:break
        info=page.get('imageinfo',[{}])[0]
        meta=info.get('extmetadata',{})
        lic=clean(meta.get('LicenseShortName',{}).get('value',''))
        if lic not in ALLOWED:continue
        if info.get('mime') not in (None,'image/jpeg','image/png'):continue
        captured=exif_date(info)
        if not captured:continue
        coordinates=page.get('coordinates',[])
        if not coordinates:continue
        loc=coordinates[0]
        if abs(loc['lat']-40.758)>0.01 or abs(loc['lon']+73.9855)>0.015:continue
        asset_url=info.get('thumburl')
        if not asset_url or not asset_url.startswith('https://'): continue
        title=page.get('title','')
        if not title.lower().endswith(('.jpg','.jpeg','.png')): continue
        photo_id='commons-'+str(page['pageid'])
        if photo_id in existing:continue
        attribution=clean(meta.get('Artist',{}).get('value','')) or 'Author not specified in returned metadata'
        license_url=meta.get('LicenseUrl',{}).get('value','')
        source_url=info.get('descriptionurl','')
        if not source_url.startswith('https://commons.wikimedia.org/wiki/'):continue
        try:
            asset,mime=get(asset_url)
            if mime not in ('image/jpeg','image/png'):continue
            if asset[:3]!=b'\xff\xd8\xff' and asset[:8]!=b'\x89PNG\r\n\x1a\n':continue
        except Exception as e:
            print('SKIP_DOWNLOAD',page['pageid'],str(e))
            continue
        ext='jpg' if asset.startswith(b'\xff\xd8') else 'png'
        filename=photo_id+'.'+ext
        sha=hashlib.sha256(asset).hexdigest()
        rec={'id':photo_id,'anchorId':None,'location':to_enu(loc['lat'],loc['lon'],origin),
            'capturedAt':captured,'capturePrecision':'day',
            'recordedAt':datetime.date.today().isoformat(),'imageUri':'assets/evidence/'+filename,
            'rights':'licensed-for-web' if lic not in ('CC0','CC0 1.0','Public domain') else 'public-domain',
            'status':'reported','source':{'title':title,'url':source_url},
            'license':{'label':lic,'url':license_url,'author':attribution,'modifications':'Resized Commons preview; no image enhancement'},
            'conditions':{'weather':'unknown','lighting':'unknown'},
            'yawDeg':None,'buildingBin':None,
            'caption':clean(meta.get('ImageDescription',{}).get('value',''))[:180] or title[5:],
            'sha256':sha,'modelTrainingPermission':'unreviewed'}
        accepted.append((rec,asset,filename))
        print('ACCEPT',captured,lic,round(dist_m(40.758,-73.9855,loc['lat'],loc['lon'])),filename,rec['source']['url'])
        time.sleep(0.4)
    if not a.dry_run:
        PHOTO_DIR.mkdir(parents=True,exist_ok=True)
        for rec,asset,filename in accepted:
            location=PHOTO_DIR/filename
            if location.exists() and hashlib.sha256(location.read_bytes()).hexdigest()!=rec['sha256']:
                raise RuntimeError('collision '+filename)
            location.write_bytes(asset)
            evidence['photos'].append(rec)
        REGISTRY.write_text(json.dumps(evidence,indent=2,ensure_ascii=False)+'\n')
    print('ADDED',len(accepted),'dryrun' if a.dry_run else 'saved')
if __name__=='__main__':main()
