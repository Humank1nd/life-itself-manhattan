// Public-tree safeguard: inspect tracked files, not just an ignored folder.
// Deliberately limited signatures; passing is not comprehensive IP clearance.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const forbidden = [
  ['tha','nos'], ['aven','gers'], ['end','game'],
  ['infinity',' stones'], ['quantum',' tunnel'],
  ['earth','-1218'], ['mar','vel'],
];
const signatures = forbidden.map((parts) => parts.join('').toLowerCase());
const normalize = (p) => p.replaceAll('\\', '/').toLowerCase();
export function scanTracked(entries) {
  const findings = [];
  for (const { path, bytes } of entries) {
    const p = normalize(path);
    if (p.split('/').includes('licensed')) findings.push(path + ': restricted overlay directory tracked');
    if (p.includes('..')) findings.push(path + ': unsafe path');
    if (signatures.some((word) => p.includes(word))) findings.push(path + ': prohibited identifier in path');
    if (!bytes.includes(0)) {
      const text = Buffer.from(bytes).toString('utf8').toLowerCase();
      for (const word of signatures) {
        if (text.includes(word)) findings.push(path + ': prohibited identifier in content');
      }
    }
  }
  return findings;
}
// Synthetic checks include renamed and force-added paths.
const synthetic = (path, value = '') => ({ path, bytes: Buffer.from(value) });
assert.deepEqual(scanTracked([synthetic('src/original.js', 'ordinary world')]), []);
assert(scanTracked([synthetic('licensed/manifest.json', 'sample')]).length > 0);
assert(scanTracked([synthetic('src/licensed/nested.txt', 'sample')]).length > 0);
assert(scanTracked([synthetic('renamed/' + forbidden[0].join('') + '.txt')]).length > 0);
assert(scanTracked([synthetic('docs/neutral.md', forbidden[1].join(''))]).length > 0);
assert(scanTracked([synthetic('licensed/force-added.txt', 'sample')]).length > 0);
const files = execFileSync('git', ['ls-files', '-z', '--cached'], { encoding: 'buffer' }).toString('utf8').split('\0').filter(Boolean);
const tracked = files.map((path) => ({ path, bytes: readFileSync(path) }));
const failures = scanTracked(tracked);
assert.equal(failures.length, 0, 'public-tree violations:\n' + failures.join('\n'));
console.log('PASS public tree — ' + files.length + ' tracked paths scanned, adversarial directory/name/content fixtures checked');
