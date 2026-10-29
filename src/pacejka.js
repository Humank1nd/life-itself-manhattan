// Life Itself Manhattan — Pacejka MF96 tire core (slice 4 bonus port).
// Body verbatim from gods-eye-view src/life/pacejka.js (itself ported from
// 00 Systems and Tooling/pacejka_tire_model.py). Pure math, zero imports.
// src/life/pacejka.js — Pacejka '96 Magic Formula tire core (pure, Cesium-free)
// Ported from 00 Systems and Tooling/pacejka_tire_model.py:
//   F(x) = D * sin(C * atan(B*x - E*(B*x - atan(B*x))))
// plus NASA hydroplaning wet scaling and Kamm friction-circle coupling.
// stepVehicle consumes gripScale(); HUD contracts: muUtilPct, slipDeg,
// hydroplaning, wetMu.

export const LONG_COEFFS = { B: 10.5, C: 1.65, D: 1.05, E: -0.5 };
export const LAT_COEFFS = { B: 8.8, C: 1.30, D: 1.05, E: -0.8 };

// Per-profile peak-grip trims (sports stickier, truck范 lazy). Multiplies D.
export const PROFILE_MU = {
  sedan: 1.0, compact: 1.0, sports: 1.08, super: 1.12,
  muscle: 1.02, van: 0.95, truck: 0.9, cop: 1.05,
};

export function magicFormula(x, { B, C, D, E }) {
  const bx = B * x;
  const ax = Math.atan(bx);
  return D * Math.sin(C * Math.atan(bx - E * (bx - ax)));
}

/**
 * Weather grip factor (ported hydroplaning curve).
 * @param waterMm 0 = dry; bad weather feeds ~2.5mm
 * @param speedKmh current speed
 */
export function wetGripFactor(waterMm, speedKmh) {
  if (waterMm <= 0) return { factor: 1, hydroplaning: false };
  const threshold = 82 - waterMm * 4.5;
  const base = Math.max(0.55, 1 - waterMm * 0.08);
  if (speedKmh > threshold) {
    const f = Math.max(0.15, base - Math.min(0.4, (speedKmh - threshold) * 0.02));
    return { factor: f, hydroplaning: waterMm >= 2 && f < 0.6 };
  }
  return { factor: base, hydroplaning: false };
}

/**
 * Full tire evaluation for one axle-step.
 * @returns { muScale (× base grip), muUtilPct, slipDeg, hydroplaning }
 */
export function evalTires({ slipRatio = 0, slipAngleDeg = 0, speedKmh = 0, waterMm = 0, profileId = 'sedan' }) {
  const trim = PROFILE_MU[profileId] ?? 1;
  const { factor: wet, hydroplaning } = wetGripFactor(waterMm, speedKmh);
  const D = 1.05 * trim * wet;
  const muX = magicFormula(slipRatio, { ...LONG_COEFFS, D });
  const muY = magicFormula((slipAngleDeg * Math.PI) / 180, { ...LAT_COEFFS, D });
  // Kamm circle: couple against the wet peak
  const total = Math.hypot(muX, muY);
  const util = total > D ? 100 : (total / D) * 100;
  // Grip scale vs the dry reference the arcade model was tuned at (D=1.05):
  // profile trim × wet factor × mild saturation falloff past 12° slip.
  const aSlip = Math.abs(slipAngleDeg);
  const sat = 1 - 0.15 * Math.max(0, Math.min(1, (aSlip - 12) / 13));
  const muScale = Math.max(0.2, Math.min(1.15, trim * wet * sat));
  return {
    muScale: Math.round(muScale * 1000) / 1000,
    muUtilPct: Math.round(util),
    slipDeg: Math.round(aSlip * 10) / 10,
    hydroplaning,
    wetMu: Math.round(D * 100) / 100,
  };
}

/** Slip angle (deg) from ENU velocity vs heading. */
export function slipAngleDeg(vx, vy, heading) {
  const fwd = vx * Math.cos(heading) + vy * Math.sin(heading);
  const lat = vx * Math.sin(heading) - vy * Math.cos(heading);
  if (Math.hypot(vx, vy) < 0.5) return 0;
  return (Math.atan2(Math.abs(lat), Math.abs(fwd)) * 180) / Math.PI * Math.sign(lat || 0.001);
}
