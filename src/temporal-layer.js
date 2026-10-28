import { validateEvidenceGraph, photosInYear, occupanciesInYear, spatialAnchorEdges } from './evidence-graph.js';

// The timeline is an evidence filter, not a claim that an AI restored history.
// Anchors identify capture sites; a photo plane is an approximate display card,
// never a calibrated 3D reconstruction or a world-model training checkpoint.
export function mountTemporalLayer({ THREE, scene, camera, anchors, bins, evidence, onAnchorPick }) {
  validateEvidenceGraph(evidence, anchors, bins);
  const byId = new Map(anchors.map(a=>[a.id,a]));
  const layer = document.getElementById('timeline');
  const yearSlider = document.getElementById('timeline-year');
  const yearLabel = document.getElementById('timeline-year-label');
  const summary = document.getElementById('timeline-summary');
  const cards = document.getElementById('timeline-photos');
  const businessList = document.getElementById('timeline-businesses');
  const locationLabel = document.getElementById('timeline-location');
  const resetBtn = document.getElementById('timeline-all');
  const toggle = document.getElementById('timeline-graph-toggle');
  const yearPrevious = document.getElementById('timeline-prev');
  const yearNext = document.getElementById('timeline-next');
  let anchorId = null, buildingBin = null, year = Number(yearSlider.value), generation = 0;
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
      const p=photos[idx], a=byId.get(p.anchorId);
      if (!a) continue;
      loader.load(p.imageUri,texture=>{
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
      const a=byId.get(p.anchorId);
      const card=document.createElement('article'); card.className='timeline-photo-card';
      const img=document.createElement('img');
      img.src=p.imageUri; img.alt=p.caption || ('Photo from '+(p.capturePrecision==='year'?'year '+p.capturedYear:p.capturedAt));
      img.loading='lazy'; card.append(img);
      const info=document.createElement('div'); info.className='timeline-photo-meta';
      const title=document.createElement('strong');
      title.textContent=(p.caption||p.id)+' · '+(p.capturePrecision==='year' ? String(p.capturedYear)+' (year only)' : p.capturedAt);info.append(title);
      const located=document.createElement('span');located.textContent=a.name+' · '+p.status;info.append(located);
      const conditionLine=document.createElement('span');
      conditionLine.textContent='Weather: '+p.conditions.weather+' · Light: '+p.conditions.lighting;
      info.append(conditionLine);
      const source=document.createElement('a');source.href=p.source.url;source.rel='noopener noreferrer';
      source.target='_blank';source.textContent='Source: '+p.source.title;
      info.append(source);card.append(info);
      const move=document.createElement('button');
      move.type='button';move.textContent='Locate';
      move.addEventListener('click',()=>onAnchorPick(a));card.append(move);
      cards.append(card);
    }
  }
  function draw() {
    yearLabel.textContent=String(year);
    yearSlider.value=String(year);
    const photos=photosInYear(evidence,year,anchorId).filter(p=>buildingBin===null||p.buildingBin===buildingBin);
    const occupancy=occupanciesInYear(evidence,year,buildingBin);
    const pastBusiness = buildingBin!==null ? occupancy.length+' sourced occupancy record(s) overlap '+year : occupancy.length+' occupancy record(s) overlap '+year+' (island-wide)';
    summary.textContent=photos.length+' photograph(s) captured in '+year+' · '+pastBusiness+'. Source status stays attached to each record.';
    locationLabel.textContent = anchorId ? ('Location: '+byId.get(anchorId).name) :
      buildingBin ? ('Building BIN '+buildingBin) : 'All 25 surveyed locations';
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
    renderCards(photos);
    clearPlates();
    addPlates(photos);
  }
  const updateYear=v=> {year=Math.max(Number(yearSlider.min),Math.min(Number(yearSlider.max),Math.trunc(Number(v))));draw();};
  yearSlider.addEventListener('input',()=>updateYear(yearSlider.value));
  yearPrevious.addEventListener('click',()=>updateYear(year-1));
  yearNext.addEventListener('click',()=>updateYear(year+1));
  toggle.addEventListener('change',()=>{graphLines.visible=toggle.checked;});
  resetBtn.addEventListener('click',()=>{anchorId=null;buildingBin=null;draw();});
  layer.hidden=false;
  draw();
  return {
    setAnchor(id) { if(!byId.has(id)) return; anchorId=id;buildingBin=null;draw(); },
    setBuilding(bin) { if(!bins.has(bin)) return; buildingBin=bin;anchorId=null;draw(); },
    setYear:updateYear,
    getYear:()=>year,
    getMetrics:()=>({year,photoCount:photosInYear(evidence,year,anchorId).filter(p=>buildingBin===null||p.buildingBin===buildingBin).length,anchoredNodes:anchors.length,edges:adjacency.length}),
    dispose() { clearPlates();scene.remove(graphLines);geo.dispose();graphLines.material.dispose(); }
  };
}
