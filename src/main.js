// Life Itself — Manhattan: stand the real island up in the browser.
// Ground truth: NYC Open Data building footprints, extruded by real roof height.
// No Cesium ion token: the island is our own pulled city data, not a hosted asset.

const statusEl = document.getElementById('status');
const FEET_TO_METERS = 0.3048;

// Manhattan, roughly the middle of the island.
const MANHATTAN = { lon: -73.9712, lat: 40.7831 };

const viewer = new Cesium.Viewer('cesiumContainer', {
  baseLayer: false,
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  animation: false,
  timeline: false,
  terrainProvider: new Cesium.EllipsoidTerrainProvider(),
});
viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#101418');
viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#05070a');

viewer.camera.flyTo({
  destination: Cesium.Cartesian3.fromDegrees(MANHATTAN.lon, MANHATTAN.lat - 0.09, 9000),
  orientation: {
    heading: Cesium.Math.toRadians(0),
    pitch: Cesium.Math.toRadians(-38),
    roll: 0,
  },
  duration: 0,
});

async function loadIsland() {
  const source = await Cesium.GeoJsonDataSource.load('data/manhattan-footprints-slim.geojson', {
    clampToGround: false,
  });
  const entities = source.entities.values;
  let withHeight = 0;
  for (const entity of entities) {
    if (!entity.polygon) continue;
    const feet = parseFloat(entity.properties && entity.properties.height_roof);
    const meters = Number.isFinite(feet) && feet > 0 ? feet * FEET_TO_METERS : 10;
    if (Number.isFinite(feet) && feet > 0) withHeight += 1;
    entity.polygon.extrudedHeight = meters;
    entity.polygon.height = 0;
    entity.polygon.material = Cesium.Color.fromCssColorString('#8fa3b8').withAlpha(0.92);
    entity.polygon.outline = false;
  }
  await viewer.dataSources.add(source);
  statusEl.textContent =
    `Manhattan is up: ${entities.length.toLocaleString()} buildings, ` +
    `${withHeight.toLocaleString()} extruded at their real roof height. ` +
    `Ground truth: NYC Open Data.`;
}

loadIsland().catch((err) => {
  console.error(err);
  statusEl.textContent =
    'The island data has not been pulled yet. Run: node scripts/fetch-data.mjs, then reload.';
});
