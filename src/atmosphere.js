// Life Itself — Diurnal Atmosphere Engine.
// Extracted from gods-eye-view/src/life/diurnalAtmosphere.js.
// Calculates real astronomical solar elevation, azimuth, and photometric
// lighting factors for Manhattan's WGS84 coordinates (40.7580° N).
// Zero external dependencies; runs identically in Node.js and browser.

export const LATITUDE_NYC_RAD = (40.7580 * Math.PI) / 180.0;
export const SOLAR_DECLINATION_RAD = (23.44 * Math.PI) / 180.0;

export function computeSolarElevation(timeHours) {
  const h = ((timeHours % 24.0) + 24.0) % 24.0;
  const hourAngleRad = (h - 12.0) * (Math.PI / 12.0);

  const sinElevation =
    Math.sin(LATITUDE_NYC_RAD) * Math.sin(SOLAR_DECLINATION_RAD) +
    Math.cos(LATITUDE_NYC_RAD) * Math.cos(SOLAR_DECLINATION_RAD) * Math.cos(hourAngleRad);

  const elevationDeg = (Math.asin(Math.max(-1.0, Math.min(1.0, sinElevation))) * 180.0) / Math.PI;
  return Math.round(elevationDeg * 100) / 100;
}

export function evaluateAtmosphere(timeHours) {
  const elevDeg = computeSolarElevation(timeHours);

  if (elevDeg > 20.0) {
    // Full Daylight
    return {
      timeHours,
      elevationDeg: elevDeg,
      phase: 'DAYLIGHT',
      label: '12:00 Solar Daylight',
      bgHex: 0x081326,
      fogHex: 0x081326,
      lowWireHex: 0x2b6cb0,
      highWireHex: 0xaee7ff,
      streetHex: 0x38bdf8,
      boundaryHex: 0x1e3a5f,
      gridHex: 0x111e30,
    };
  } else if (elevDeg > 0.0) {
    // Golden Hour Dusk / Dawn
    const isDusk = timeHours > 12.0;
    return {
      timeHours,
      elevationDeg: elevDeg,
      phase: isDusk ? 'GOLDEN_DUSK' : 'GOLDEN_DAWN',
      label: isDusk ? '18:30 Golden Hour Dusk' : '06:30 Golden Hour Dawn',
      bgHex: 0x1a0d14,
      fogHex: 0x1a0d14,
      lowWireHex: 0x9a3412,   // burnt terracotta
      highWireHex: 0xfde047,  // warm radiant gold
      streetHex: 0xf97316,    // fiery amber street ribbons
      boundaryHex: 0x4a2030,
      gridHex: 0x24111d,
    };
  } else if (elevDeg > -12.0) {
    // Twilight
    return {
      timeHours,
      elevationDeg: elevDeg,
      phase: 'TWILIGHT',
      label: '20:00 Blue Twilight',
      bgHex: 0x0a0c16,
      fogHex: 0x0a0c16,
      lowWireHex: 0x1e3a8a,
      highWireHex: 0x93c5fd,
      streetHex: 0xf59e0b,
      boundaryHex: 0x1e293b,
      gridHex: 0x131a29,
    };
  } else {
    // Deep Night Urban Grid
    return {
      timeHours,
      elevationDeg: elevDeg,
      phase: 'NIGHT',
      label: '23:00 Urban Night Grid',
      bgHex: 0x030508,
      fogHex: 0x030508,
      lowWireHex: 0x0f1c2e,   // dark steel
      highWireHex: 0x38bdf8,  // electric neon cyan
      streetHex: 0xfbbf24,    // glowing yellow night street grid
      boundaryHex: 0x162438,
      gridHex: 0x0a101a,
    };
  }
}
