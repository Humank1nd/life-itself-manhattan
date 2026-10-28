import { validateEvidenceGraph, photosInYear, occupanciesInYear, spatialAnchorEdges } from './evidence-graph.js';
import { validateCatalog, catalogForYear, catalogYears } from './photo-catalog.js';

// The timeline is an evidence filter, not a claim that an AI restored history.
// Anchors identify capture sites; a photo plane is an approximate display card,
// never a calibrated 3D reconstruction or a world-model training checkpoint.
export function mountTemporalLayer({ THREE, scene, camera, anchors, bins, evidence,
  photoCatalog=null, projectEnu=null, origin=null, onAnchorPick }) {
  validateEvidenceGraph(evidence, anchors, bins);
  const catalogMetrics=photoCatalog ? validateCatalog(photoCatalog):null;
  if(photoCatalog && (!projectEnu||!origin))throw new Error('photo catalog requires city projection');
  const byId = new Map(anchors.map(a=>[a.id,a]));
  const layer = document.getElementById('timeline');
  const yearSlider = document.getElementById('timeline-year');
  const yearLabel = document.getElementById('timeline-year-label');
  const summary = document.getElementById('timeline-summary');
  const catalogCount=document.getElementById('timeline-catalog-count');
  const cards = document.getElementById('timeline-photos');
  const yearPresets = document.getElementById('timeline-year-presets');
  const businessList = document.getElementById('timeline-businesses');
  const locationLabel = document.getElementById('timeline-location');
  const resetBtn = document.getElementById('timeline-all');
  const toggle = document.getElementById('timeline-graph-toggle');
  const buildingToggle = document.getElementById('timeline-building-only');
  const yearPrevious = document.getElementById('timeline-prev');
  const yearNext = document.getElementById('timeline-next');
  let anchorId = null, buildingBin = null, year = Number(yearSlider.value), generation = 0, displayedPhotos = 0;
  let photoMeshes = [];
  const adjacency = spatialAnchorEdges(anchors,2);
  const vertices = [];
  for (const edge of adjacency) {
    const a = byId.get(edge.from), b = byId.get(edge.to);
    vertices.push(a.x, Math.max(a.y,0)+3, a.z, b.x, Math.max(b.y,0)+3, b.z);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  const graphLines = new THREE.LineSegments(geo,new THREE.LineBasicMaterial({
    color:0x62e6d5,opacity:0.48,transparent:true,depthWrite:false
  }));
  graphLines.visible = false; // opt-in, so the existing wireframe is not obscured
  graphLines.renderOrder = 4;
  scene.add(graphLines);
  const loader = new THREE.TextureLoader();
  function clearPlates() {
    ++generation;
    for (const m of photoMeshes) {
      scene.remove(m);
      m.geometry.dispose();
      m.material.map?.dispose();
      m.material.dispose();
    }
    photoMeshes = [];
  }
  function addPlates(photos) {
    const activeGeneration = generation;
    for (let idx=0;idx<photos.length;idx++) {
      const p=photos[idx], a=p.location || byId.get(p.anchorId);
      if (!a) continue;
      loader.load(buildingToggle.checked ? p.segmentation?.cutoutUri : p.imageUri,texture=>{
        if (activeGeneration!==generation) { texture.dispose(); return; }
        texture.colorSpace = THREE.SRGBColorSpace;
        const aspect = Math.max(0.5,Math.min(2.0,texture.image.width/texture.image.height));
        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(14*aspect,14),
          new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,transparent:true,opacity:0.77,depthWrite:false})
        );
        // Small display offset separates concurrent observations at one anchor.
        const order = photos.slice(0,idx).filter(q=>q.anchorId===p.anchorId).length;
        mesh.position.set(a.x+order*2.0, Math.max(a.y,0)+20+order*3, a.z);
        // Yaw is approximate; positional evidence does not imply calibrated camera pose.
        if (p.yawDeg === null) mesh.quaternion.copy(camera.quaternion);
        else mesh.rotation.y = -p.yawDeg*Math.PI/180;
        mesh.renderOrder = 6;
        mesh.userData.evidenceId = p.id;
        photoMeshes.push(mesh);
        scene.add(mesh);
      },undefined,()=>console.warn('Evidence asset unavailable:',p.id));
    }
  }
  function chip(textValue) {
    const e=document.createElement('span');
    e.className='evidence-chip';e.textContent=textValue;return e;
  }
  function renderCards(photos) {
    cards.replaceChildren();
    if (!photos.length) {
      const p=document.createElement('p');
      p.className='timeline-empty';
      p.textContent = 'No attributed photographs recorded for '+year+(anchorId?' at this anchor':'')+'. Missing history is not generated or guessed.';
      cards.append(p);return;
    }
    for (const p of photos) {
      const a=p.location || byId.get(p.anchorId);
      const card=document.createElement('article'); card.className='timeline-photo-card';
      const img=document.createElement('img');
      img.src=(buildingToggle.checked ? p.segmentation?.cutoutUri : p.imageUri); img.alt=p.caption || ('Photo from '+(p.capturePrecision==='year'?'year '+p.capturedYear:p.capturedAt));
      img.loading='lazy'; card.append(img);
      const info=document.createElement('div'); info.className='timeline-photo-meta';
      const title=document.createElement('strong');
      title.textContent=(p.caption||p.id)+' · '+(p.capturePrecision==='year' ? String(p.capturedYear)+' (year only)' : p.capturedAt);info.append(title);
      const located=document.createElement('span');
      located.textContent=(a.name||'Approximate mapped geotag')+' · '+
        (p.isCatalog ? 'UNREVIEWED CATALOG / may depict landmark, not camera position' : p.status);
      info.append(located);
      const conditionLine=document.createElement('span');
      conditionLine.textContent='Weather: '+p.conditions.weather+' · Light: '+p.conditions.lighting;
      info.append(conditionLine);
      const source=document.createElement('a');source.href=p.source.url;source.rel='noopener noreferrer';
      source.target='_blank';source.textContent='Source: '+p.source.title;
      info.append(source);
      if(p.license) {
        const credit=document.createElement('span');
        credit.textContent='© / credit: '+p.license.author+' · '+p.license.label+' · '+p.license.modifications;
        info.append(credit);
        if(/^https:\/\/creativecommons\.org\/licenses\/|^https:\/\/creativecommons\.org\/publicdomain\//.test(p.license.url)) {
          const terms=document.createElement('a');
          terms.href=p.license.url;terms.target='_blank';terms.rel='noopener noreferrer';
          terms.textContent='License terms';info.append(terms);
        }
        if(p.segmentation) {
          const review=document.createElement('span');
          review.textContent='Building mask: automated / unreviewed; occluded façades are NOT restored';
          info.append(review);
        }
      }
      card.append(info);
      const move=document.createElement('button');
      move.type='button';move.textContent='Locate';
      if(p.anchorId) move.addEventListener('click',()=>onAnchorPick(byId.get(p.anchorId)));
      else move.disabled=true;
      card.append(move);
      cards.append(card);
    }
  }
  function draw() {
    yearLabel.textContent=String(year);
    yearSlider.value=String(year);
    const discovered=photoCatalog ? catalogForYear(photoCatalog,year,projectEnu,origin) : [];
    const trustedIds=new Set(evidence.photos.map(p=>p.id));
    const photos=[...photosInYear(evidence,year),...discovered.filter(p=>!trustedIds.has(p.id))].filter(p=>
      (anchorId===null || p.anchorId===anchorId ||
      (p.location && Math.hypot(p.location.x-byId.get(anchorId).x,p.location.z-byId.get(anchorId).z)<=85)) &&
      (buildingBin===null||p.buildingBin===buildingBin));
    const occupancy=occupanciesInYear(evidence,year,buildingBin);
    const pastBusiness = buildingBin!==null ? occupancy.length+' sourced occupancy record(s) overlap '+year : occupancy.length+' occupancy record(s) overlap '+year+' (island-wide)';
    const pending=photos.filter(p=>p.isCatalog).length;
    summary.textContent=photos.length+' dated photo(s) in '+year+' ('+pending+
      ' catalog-only, unreviewed) · '+pastBusiness+
      '. Geotags approximate, copyright attribution retained; no training approval.';
    locationLabel.textContent = anchorId ? ('Location: '+byId.get(anchorId).name) :
      buildingBin ? ('Building BIN '+buildingBin) : 'Manhattan geotagged photos + 25 surveyed anchors';
    yearPrevious.disabled=year<=Number(yearSlider.min);
    yearNext.disabled=year>=Number(yearSlider.max);
    resetBtn.hidden=anchorId===null&&buildingBin===null;
    businessList.replaceChildren();
    if (buildingBin !== null) {
      if (!occupancy.length) businessList.textContent='No sourced business history recorded for this building in '+year+'.';
      else for (const entry of occupancy.slice(0,12)) {
        const item=document.createElement('div');
        const range=entry.validFrom+' to '+(entry.validTo||'open end');
        item.append(chip(entry.businessName+' · '+range+' · '+entry.status+' · '));
        const link=document.createElement('a');link.href=entry.source.url;
        link.target='_blank';link.rel='noopener noreferrer';link.textContent=entry.source.title;
        item.append(link);businessList.append(item);
      }
    }
    const selectedPhotos=buildingToggle.checked ? photos.filter(p=>p.segmentation?.cutoutUri) : photos;
    displayedPhotos=selectedPhotos.length;
    if(buildingToggle.checked) summary.textContent += ' Showing '+selectedPhotos.length+' proposed building masks; missing masks are hidden, not reconstructed.';
    renderCards(selectedPhotos);
    clearPlates();
    addPlates(selectedPhotos);
  }
  const updateYear=v=> {year=Math.max(Number(yearSlider.min),Math.min(Number(yearSlider.max),Math.trunc(Number(v))));draw();};
  // Derived from genuine capture years; do not interpolate missing history.
  const availableYears=[...new Set([...evidence.photos.map(p=>p.capturePrecision==='year'?p.capturedYear:Number(p.capturedAt.slice(0,4))),
    ...(photoCatalog?catalogYears(photoCatalog):[])])].sort((a,b)=>a-b);
  if(availableYears.length) {
    yearPresets.textContent='Photos from: ';
    for(const y of availableYears) {
      const btn=document.createElement('button');btn.type='button';btn.textContent=String(y);
      btn.setAttribute('aria-label','Show photographs captured in '+y);
      btn.addEventListener('click',()=>updateYear(y));yearPresets.append(btn);
    }
  } else yearPresets.textContent='No imported photo years yet';
  catalogCount.textContent=catalogMetrics ?
    'Discovery queue: '+catalogMetrics.candidates+' licensed metadata candidates · '+
    catalogMetrics.dated+' with date metadata · '+catalogMetrics.mapped+
    ' with coordinates · '+catalogMetrics.mappedAndDated+
    ' with both (preview-only, unreviewed). Original archive records are preserved.' :
    'Discovery queue unavailable; only locally sourced evidence is shown.';
  yearSlider.addEventListener('input',()=>updateYear(yearSlider.value));
  yearPrevious.addEventListener('click',()=>updateYear(year-1));
  yearNext.addEventListener('click',()=>updateYear(year+1));
  toggle.addEventListener('change',()=>{graphLines.visible=toggle.checked;});
  buildingToggle.addEventListener('change',draw);
  resetBtn.addEventListener('click',()=>{anchorId=null;buildingBin=null;draw();});
  layer.hidden=false;
  draw();
  return {
    setAnchor(id) { if(!byId.has(id)) return; anchorId=id;buildingBin=null;draw(); },
    setBuilding(bin) { if(!bins.has(bin)) return; buildingBin=bin;anchorId=null;draw(); },
    setYear:updateYear,
    getYear:()=>year,
    getMetrics:()=>({year,catalogMetrics,photoCount:displayedPhotos,anchoredNodes:anchors.length,edges:adjacency.length}),
    dispose() { clearPlates();scene.remove(graphLines);geo.dispose();graphLines.material.dispose(); }
  };
}
