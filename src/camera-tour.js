// Life Itself Manhattan — cinematic tour (Extraction 017, slice 3).
// Ports the gods-eye-view cinematicTour.js tour shape (sequential
// waypoint flights with holds, cancellable, HUD titles) onto the
// island's own flight machinery. Renderer-neutral: waypoints are ENU
// triples; the page converts to THREE. No imports beyond the verified
// WGS84→ENU projection; runs in Node and the browser unchanged.
import { wgs84ToEnu } from './streets.js';
const TOUR_WAYPOINTS = [
  { id: 'fidi-harbor', title: 'Lower Manhattan & Financial Harbor', lat: 40.7032, lon: -74.0165, alt: 560, durationSec: 6.0, holdSec: 2.0 },
  { id: 'wall-street', title: 'Wall Street Canyon & East River Bridges', lat: 40.7090, lon: -74.0040, alt: 580, durationSec: 6.0, holdSec: 2.0 },
  { id: 'soho-village', title: 'Greenwich Village & Flatiron Corridor', lat: 40.7300, lon: -73.9960, alt: 620, durationSec: 6.5, holdSec: 2.0 },
  { id: 'midtown-skyline', title: 'Midtown Skyline & Empire State', lat: 40.7484, lon: -73.9857, alt: 680, durationSec: 6.5, holdSec: 2.0 },
  { id: 'times-square', title: 'Times Square & Hudson Yards Panorama', lat: 40.7580, lon: -73.9910, alt: 660, durationSec: 6.0, holdSec: 2.0 },
  { id: 'central-park-south', title: 'Central Park South & Island Panorama', lat: 40.7660, lon: -73.9770, alt: 780, durationSec: 7.0, holdSec: 2.5 },
];
export function tourLegs() {
  return TOUR_WAYPOINTS.map((w) => {
    const [e, n] = wgs84ToEnu(w.lat, w.lon);
    return {
      id: w.id, title: w.title,
      toPos: [e, w.alt, n], toTgt: [e, 40, n],
      durMs: Math.round(w.durationSec * 1000), holdMs: Math.round(w.holdSec * 1000),
    };
  });
}
export function tourDurationMs() {
  return tourLegs().reduce((s, l) => s + l.durMs + l.holdMs, 0);
}
