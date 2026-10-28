// Pull the Manhattan ground truth from NYC Open Data (Socrata).
// Manhattan = every building whose BIN is 1000000-1999999.
// Datasets: BUILDING (5zhs-2jue, polygons) and BUILDING_P (u9wf-3gbt, points).
// Output lands in data/ as GeoJSON. Public city data; no key required.

import { writeFile, mkdir } from 'node:fs/promises';

const WHERE = encodeURIComponent("bin between '1000000' and '1999999'");
const pulls = [
  {
    name: 'manhattan-footprints.geojson',
    url:
      'https://data.cityofnewyork.us/resource/5zhs-2jue.geojson' +
      `?$select=the_geom,bin,construction_year,height_roof,ground_elevation&$where=${WHERE}&$order=bin&$limit=50000`,
  },
  {
    name: 'manhattan-buildings.geojson',
    url:
      'https://data.cityofnewyork.us/resource/u9wf-3gbt.geojson' +
      `?$select=the_geom,bin,construction_year,feature_code,height_roof,ground_elevation,last_status_type&$where=${WHERE}&$order=bin&$limit=50000`,
  },
];

await mkdir('data', { recursive: true });
for (const pull of pulls) {
  console.log(`Fetching ${pull.name} ...`);
  const res = await fetch(pull.url);
  if (!res.ok) throw new Error(`${pull.name}: HTTP ${res.status}`);
  const text = await res.text();
  const parsed = JSON.parse(text);
  await writeFile(`data/${pull.name}`, text);
  console.log(`  ${parsed.features.length.toLocaleString()} features written to data/${pull.name}`);
}
console.log('Done. Manhattan ground truth is in data/.');
