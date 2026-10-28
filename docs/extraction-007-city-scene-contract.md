# Extraction 007 — City Scene Contract v1

Status: feature branch; not merged, not yet accepted on a physical headset.

## One world, multiple engines

The versioned manifest at data/city-scene-v1.json points to existing world
data. The machine-readable contract is contracts/city-scene-v1.schema.json.
Validate with npm run validate:city. The browser viewer reads the manifest
and resolves buildings, streets and Twin Earth anchors through it.

World coordinates: WGS84 source, Twin Earth Times Square origin
(40.758 N, -73.9855 W, elevation 10m). Local ENU meters are represented
as X east, Y up, Z south (negative north). Building records have stable
NYC BINs, h as roof height in meters, yr construction year, nb neighborhood,
and rings of [x,z] points. Do not silently change the frame or elevation datum.

## Four existing layers

- 45,172 building footprints from NYC Open Data.
- 11 surveyed God’s Eye View street corridors, projected into Twin Earth ENU.
- 25 canonical Twin Earth NYC geographic anchors.
- 38 NYC neighborhood boundaries.

The living city adapter reuses five city zones and sidewalk-crowd behavior
from the founder's God’s Eye View work. It uses a 5-second logical tick and
a fixed random seed; each tick journals a hash of the mutable city state
while the immutable NYC ground-data hash remains distinct.

## Assets and Unreal

Unreal Engine/City Sample is an upstream **reference laboratory** and an
optional processing node, not a WebXR dependency. Study Mass AI, procedural
construction and streaming ideas; rebuild with original or licensed-for-web
assets. Asset manifests require explicit source and allowed usage rights.
Do not export Unreal-only City Sample meshes, textures, crowds or vehicles
into the browser project. No external 3D assets are currently bundled.

## Next integrations

1. Generate solid extruded buildings from the existing footprint polygons,
   with chunking and LOD to avoid loading all geometry at close-up fidelity.
2. Connect this data loader to compatible IWSDK/Three.js WebXR systems, with
   a desktop emulation fallback. Verify the coordinate origin.
3. Add crowd/traffic behaviors in isolated testable increments, and measure
   headset framerate, memory and navigation behavior.

This file records implemented interfaces and proposed later work. It does
not claim Unreal feature parity or a completed headset build.
