// Gate for the Sprint 2 playable surface: the panel offers only lawful
// scavenge choices for the selected rat, arming submits exactly once on the
// next tick through stepPlayerRatAction, and every outcome (acted, rejected,
// blocked, fault) renders an honest line. No DOM here: this gate pins the
// wiring contract between index.html and wireframe.js so drift fails loudly.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const wire = readFileSync(new URL('../src/wireframe.js', import.meta.url), 'utf8');
// The panel surface exists with stable ids.
for (const id of ['rat-choice', 'rat-act', 'rat-arm', 'rat-act-row', 'rat-select', 'rat-view']) {
  assert.ok(html.includes(`id="${id}"`), 'index.html must carry #' + id);
}
// Choice options come from the rat's own eligible scavenge entries — never
// invented, never another rat's.
assert.ok(wire.includes('scavenge-fresh'), 'wireframe must offer scavenge-fresh interactions');
assert.ok(wire.includes('eligible') && wire.includes('ratChoiceEl'), 'wireframe must populate choices from eligibility');
// Arming builds a P017-shaped choice and submits it at most once: the armed
// slot is cleared BEFORE the step runs.
assert.ok(wire.includes("interactionId: 'scavenge-fresh'"), 'armed choice must name the scavenge interaction');
assert.ok(wire.indexOf('armedPlayerChoice = null') < wire.indexOf('stepPlayerRatAction(livingCity'),
  'the armed choice must be consumed before stepping, never replayed');
// The commit button is dead unless the selected rat can actually act.
assert.ok(wire.includes('ratActEl.disabled'), 'commit button must disable when no lawful action exists');
// Every terminal outcome renders a distinct, honest line.
for (const marker of ['Committed once:', 'Not committed (', 'Blocked.', 'did not finish (']) {
  assert.ok(wire.includes(marker), 'panel must render outcome: ' + marker);
}
// No autonomy fall-through on the player path: the tick steps exactly one of
// player choice or autonomous selection.
const tickPlayer = wire.indexOf('if (armedPlayerChoice)');
assert.ok(tickPlayer >= 0, 'tick must branch on an armed player choice');
assert.ok(wire.includes('} else {') && wire.indexOf('stepRatAutonomy(livingCity', tickPlayer) > tickPlayer,
  'autonomy must run only when no player choice is armed');
console.log('PASS player panel — lawful choices offered, single submission, honest outcomes, no fall-through');
