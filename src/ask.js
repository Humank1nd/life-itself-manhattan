// Ask the Island — the question layer over Manhattan's real building records.
//
// Design rule: the island only ever says what the data proves. A question is
// turned into a structured query; the query runs locally over the 45,172
// records; every number in the answer is computed from those records.
//
// The interpreter is an interface with two implementations:
//   1. The Meta model (when window.ASK_ENDPOINT is set): the model reads the
//      plain-words question and returns the same structured query JSON.
//      It interprets; it never supplies facts.
//   2. A small local grammar (below), which carries development and serves
//      as the fallback. Credits are spent only when the founder says so.
//
// Structured query: { nb, nbPrefix, yrMin, yrMax, hMin, hMax, sort }
//   nb / nbPrefix — NTA neighborhood name (exact) or name prefix
//   yrMin / yrMax — construction year bounds (from the city record)
//   hMin / hMax   — roof height bounds, meters
//   sort          — 'tallest' | 'shortest' | 'oldest' | 'newest' | null

const FEET = 0.3048;

const ALIASES = [
  ['financial district', { nb: 'Financial District-Battery Park City' }],
  ['fidi', { nb: 'Financial District-Battery Park City' }],
  ['battery park', { nb: 'Financial District-Battery Park City' }],
  ['wall street', { nb: 'Financial District-Battery Park City' }],
  ['times square', { nb: 'Midtown-Times Square' }],
  ['theater district', { nb: 'Midtown-Times Square' }],
  ['upper west side', { nbPrefix: 'Upper West Side' }],
  ['upper east side', { nbPrefix: 'Upper East Side' }],
  ['east harlem', { nbPrefix: 'East Harlem' }],
  ['spanish harlem', { nbPrefix: 'East Harlem' }],
  ['harlem', { nbPrefix: 'Harlem' }],
  ['midtown', { nbPrefix: 'Midtown' }],
];

export function interpretLocal(question, nbNames) {
  const s = ' ' + question.toLowerCase().replace(/[’']/g, "'") + ' ';
  const q = { sort: null };

  // Neighborhood: aliases first, then exact NTA names (longest match wins).
  let aliasHit = false;
  for (const [alias, target] of ALIASES) {
    if (s.includes(' ' + alias) || s.includes(alias + ' ') || s.includes(' ' + alias + ' ')) {
      Object.assign(q, target); aliasHit = true; break;
    }
  }
  if (!aliasHit) {
    const names = [...nbNames].sort((a, b) => b.length - a.length);
    for (const name of names) {
      if (s.includes(' ' + name.toLowerCase() + ' ') || s.includes(' ' + name.toLowerCase() + ',')) { q.nb = name; break; }
    }
  }

  // Years.
  if (/\bpre[-\s]?war\b/.test(s)) q.yrMax = 1944;
  if (/\bpost[-\s]?war\b/.test(s)) q.yrMin = 1945;
  let m;
  if ((m = s.match(/\bbuilt (?:in|during) (\d{4})\b/))) { q.yrMin = +m[1]; q.yrMax = +m[1]; }
  if ((m = s.match(/\bbefore (\d{4})\b/))) q.yrMax = +m[1] - 1;
  if ((m = s.match(/\bafter (\d{4})\b/))) q.yrMin = +m[1] + 1;
  if ((m = s.match(/\bfrom the (\d{3}0)s\b/))) { q.yrMin = +m[1]; q.yrMax = +m[1] + 9; }
  if (/\b19th century\b/.test(s)) q.yrMax = 1899;
  if (/\b1800s\b/.test(s)) { q.yrMin = 1800; q.yrMax = 1899; }

  // Heights. "under 50 feet", "taller than 300 ft", "over 100 meters".
  const hRe = /\b(under|below|less than|shorter than|over|above|more than|taller than|at least|at most)\s+(\d+(?:\.\d+)?)\s*(feet|foot|ft|meters|metres|m)\b/;
  if ((m = s.match(hRe))) {
    const val = parseFloat(m[2]) * (m[3].startsWith('f') ? FEET : 1);
    if (/under|below|less than|shorter than|at most/.test(m[1])) q.hMax = val; else q.hMin = val;
  }

  // Superlatives.
  if (/\btallest\b/.test(s)) q.sort = 'tallest';
  else if (/\bshortest|smallest\b/.test(s)) q.sort = 'shortest';
  else if (/\boldest\b/.test(s)) q.sort = 'oldest';
  else if (/\bnewest|most recent\b/.test(s)) q.sort = 'newest';

  return q;
}

export async function interpret(question, nbNames) {
  if (typeof window !== 'undefined' && window.ASK_ENDPOINT) {
    try {
      const res = await fetch(window.ASK_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
        signal: AbortSignal.timeout(25000), // a slow model never keeps the island waiting
      });
      if (res.ok) {
        const q = await res.json();
        if (q && typeof q === 'object') return { query: q, via: 'model' };
      }
    } catch { /* fall through to local */ }
  }
  return { query: interpretLocal(question, nbNames), via: 'local' };
}

export function runQuery(buildings, q) {
  const matches = [];
  for (const b of buildings) {
    if (q.nb && b.nb !== q.nb) continue;
    if (q.nbPrefix && !(b.nb || '').startsWith(q.nbPrefix)) continue;
    if (q.yrMin != null && (b.yr == null || b.yr < q.yrMin)) continue;
    if (q.yrMax != null && (b.yr == null || b.yr > q.yrMax)) continue;
    if (q.hMin != null && b.h < q.hMin) continue;
    if (q.hMax != null && b.h > q.hMax) continue;
    matches.push(b);
  }
  const stats = { count: matches.length, tallest: null, oldest: null, newest: null, withYear: 0 };
  for (const b of matches) {
    if (!stats.tallest || b.h > stats.tallest.h) stats.tallest = b;
    if (b.yr != null) {
      stats.withYear++;
      if (!stats.oldest || b.yr < stats.oldest.yr) stats.oldest = b;
      if (!stats.newest || b.yr > stats.newest.yr) stats.newest = b;
    }
  }
  if (q.sort === 'tallest') matches.sort((a, b) => b.h - a.h);
  if (q.sort === 'shortest') matches.sort((a, b) => a.h - b.h);
  if (q.sort === 'oldest') matches.sort((a, b) => (a.yr ?? 9999) - (b.yr ?? 9999));
  if (q.sort === 'newest') matches.sort((a, b) => (b.yr ?? 0) - (a.yr ?? 0));
  return { matches, stats };
}

const ft = (meters) => Math.round(meters / FEET).toLocaleString();

export function describe(q, stats, via) {
  const where = q.nb || (q.nbPrefix ? `the ${q.nbPrefix} neighborhoods` : 'Manhattan');
  const filters = [];
  if (q.yrMin != null && q.yrMax != null && q.yrMin === q.yrMax) filters.push(`built in ${q.yrMin}`);
  else {
    if (q.yrMax != null) filters.push(`built by ${q.yrMax}`);
    if (q.yrMin != null) filters.push(`built from ${q.yrMin} on`);
  }
  if (q.hMax != null) filters.push(`under ${ft(q.hMax)} ft`);
  if (q.hMin != null) filters.push(`over ${ft(q.hMin)} ft`);
  const what = filters.length ? ` buildings ${filters.join(', ')}` : ' buildings';
  if (!stats.count) {
    return `The island has no${what} in ${where}. The record is the record. (Answered from NYC Open Data, ${via === 'model' ? 'question read by the Meta model' : 'local interpreter'}.)`;
  }
  let out = `${stats.count.toLocaleString()}${what} in ${where}.`;
  if (stats.tallest) out += ` Tallest among them: ${ft(stats.tallest.h)} ft${stats.tallest.yr ? `, built ${stats.tallest.yr}` : ''} (BIN ${stats.tallest.bin}).`;
  if (stats.oldest && stats.count > 1) out += ` Oldest: built ${stats.oldest.yr}.`;
  out += ` (Every number computed from NYC Open Data records; question read by ${via === 'model' ? 'the Meta model' : 'the local interpreter'}.)`;
  return out;
}
