// A discovered catalog is not approved evidence, even if Commons permits display.
const allowed=new Set(['CC BY 2.0','CC BY 2.5','CC BY 3.0','CC BY 4.0',
  'CC BY-SA 2.0','CC BY-SA 2.5','CC BY-SA 3.0','CC BY-SA 4.0',
  'CC0','CC0 1.0','Public domain']);
export const isCaptureDate = value => typeof value==='string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) &&
  new Date(value+'T00:00:00Z').toISOString().startsWith(value);
function check(ok,message){ if(!ok) throw new Error('photo catalog: '+message); }
export function validateCatalog(catalog){
  check(catalog?.schemaVersion==='life-itself-photo-catalog/1.0.0' &&
    catalog.worldId==='life-itself:manhattan', 'version/world mismatch');
  check(Array.isArray(catalog.records) && catalog.records.length<=1000, 'record bounds');
  const ids=new Set();
  let mapped=0, dated=0, both=0;
  for(const p of catalog.records){
    check(/^commons-\d+$/.test(p.id) && !ids.has(p.id), 'ID or duplicate');ids.add(p.id);
    check(p.discoveryStatus==='candidate-unreviewed' && p.modelTrainingPermission==='unreviewed',
      'catalog cannot grant evidential or training clearance');
    check(p.sourceUrl.startsWith('https://commons.wikimedia.org/wiki/File:'),
      'source must be canonical Commons file');
    check(p.previewUrl.startsWith('https://thumb.wikimedia.org/') || p.previewUrl.startsWith('https://upload.wikimedia.org/'),
      'image must be Wikimedia thumbnail');
    check(allowed.has(p.license?.label) && typeof p.license?.author==='string' &&
      p.license.author.length>0, 'source attribution incomplete');
    check(p.capturedAt===null || isCaptureDate(p.capturedAt),'capture date invalid');
    check(p.dateBasis==='exif-original' || p.dateBasis==='commons-original-date' ||
      p.dateBasis==='unverified','unsupported capture basis');
    if(p.capturedAt!==null){dated++;check(p.dateBasis!=='unverified','date source missing');}
    if(p.location){
      const l=p.location;
      check(Number.isFinite(l.lat)&&Number.isFinite(l.lon)&&l.lat>=40.68&&l.lat<=40.89&&
        l.lon>=-74.04&&l.lon<=-73.90&&l.accuracy==='unverified-commons-geotag',
        'geotag or accuracy unsafe');
      mapped++; if(p.capturedAt!==null)both++;
    }
  }
  return {candidates:catalog.records.length,mapped,dated,mappedAndDated:both};
}
// The existing Rust projection is preferred; this source-matched WGS84 fallback
// keeps catalog rendering available when WASM is not initialized (e.g. Node).
export function fallbackCatalogEnu(origin,lat,lon,elev=origin.elev){
  const a=6378137, f=1/298.257223563,e2=f*(2-f),rad=Math.PI/180;
  function ecef(la,lo,h){
    const t=la*rad,l=lo*rad,n=a/Math.sqrt(1-e2*Math.sin(t)**2);
    return [(n+h)*Math.cos(t)*Math.cos(l),(n+h)*Math.cos(t)*Math.sin(l),
      (n*(1-e2)+h)*Math.sin(t)];
  }
  const p=ecef(lat,lon,elev),o=ecef(origin.lat,origin.lon,origin.elev);
  const [dx,dy,dz]=p.map((n,i)=>n-o[i]);
  const la=origin.lat*rad,lo=origin.lon*rad;
  const east=-Math.sin(lo)*dx+Math.cos(lo)*dy;
  const north=-Math.sin(la)*Math.cos(lo)*dx-Math.sin(la)*Math.sin(lo)*dy+Math.cos(la)*dz;
  const up=Math.cos(la)*Math.cos(lo)*dx+Math.cos(la)*Math.sin(lo)*dy+Math.sin(la)*dz;
  return [east,north,up];
}
export function catalogForYear(catalog,year,projection,origin){
  if(!Number.isInteger(year)||year<1800||year>2100)throw new Error('invalid year');
  return catalog.records.filter(p=>p.capturedAt?.startsWith(String(year))&&p.location)
    .map(p=>{
      const projected=projection?.(origin,p.location.lat,p.location.lon,origin.elev) ?? fallbackCatalogEnu(origin,p.location.lat,p.location.lon);
      if(!projected||!projected.every(Number.isFinite))return null;
      return {
        id:p.id, anchorId:null, capturedAt:p.capturedAt, capturePrecision:'day',
        imageUri:p.previewUrl, rights:'licensed-for-web', status:'candidate-unreviewed',
        source:{title:p.title,url:p.sourceUrl}, license:{...p.license,modifications:'Commons resized thumbnail (source unchanged)'},
        conditions:{lighting:'unknown',weather:'unknown'}, yawDeg:null, buildingBin:null,
        location:{lat:p.location.lat,lon:p.location.lon, x:projected[0], y:projected[2], z:-projected[1],
          accuracy:'unverified-commons-geotag',geotagRole:'unspecified'},
        caption:p.title.replace(/^File:/,'').replace(/\.(?:jpg|jpeg|png)$/i,''),
        isCatalog:true,modelTrainingPermission:'unreviewed',segmentation:null
      };
    }).filter(Boolean);
}
export function catalogYears(catalog){
  return [...new Set(catalog.records.filter(p=>p.capturedAt&&p.location)
    .map(p=>Number(p.capturedAt.slice(0,4))))].sort((a,b)=>a-b);
}
