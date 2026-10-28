// Life Itself — Shoreline & Neighborhood Boundaries.
// Renders the 38 official 2020 NYC Neighborhood Tabulation Area (NTA) polygons
// and outer Manhattan shoreline perimeter in the ENU local coordinate frame.

import * as THREE from 'three';

export async function loadBoundaries(colorHex = 0x1e3a5f) {
  const res = await fetch('data/manhattan-boundaries-enu.json');
  if (!res.ok) throw new Error(`boundaries HTTP ${res.status}`);
  const ntas = await res.json();

  let segCount = 0;
  for (const nta of ntas) {
    for (const ring of nta.rings) {
      segCount += ring.length;
    }
  }

  const positions = new Float32Array(segCount * 6);
  let pIdx = 0;

  for (const nta of ntas) {
    for (const ring of nta.rings) {
      for (let i = 0; i < ring.length; i++) {
        const [x1, z1] = ring[i];
        const [x2, z2] = ring[(i + 1) % ring.length];

        positions[pIdx++] = x1;
        positions[pIdx++] = 0.2; // Sit just above the grid
        positions[pIdx++] = z1;

        positions[pIdx++] = x2;
        positions[pIdx++] = 0.2;
        positions[pIdx++] = z2;
      }
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.LineBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });

  const lines = new THREE.LineSegments(geom, mat);
  return { lines, material: mat, ntas };
}
