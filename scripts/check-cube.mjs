// Checks the 3D cube model against the solver output: for every character and
// every letter/background color pair, orient the cube, play the moves, and read
// the front face. Also checks that solve() returns to a clean cube.
import { readFileSync } from 'node:fs';
import { RubiksCube, COLOR_ORDER, holdFor } from '../src/cube3d.js';

globalThis.performance ??= { now: () => Date.now() };
const data = JSON.parse(readFileSync(new URL('../src/solutions.json', import.meta.url)));
let failures = 0, checks = 0;

for (const [ch, entry] of Object.entries(data)) {
  for (const letter of COLOR_ORDER) {
    for (const bg of COLOR_ORDER) {
      if (letter === bg) continue;
      const cube = new RubiksCube();
      const hold = holdFor(entry, letter, bg);
      await cube.reorient(hold.front, hold.top);
      for (const m of hold.moves) await cube.turn(m);
      const want = entry.glyph.join('').split('').map((c) => (c === '#' ? letter : bg));
      const got = cube.frontFace();
      checks++;
      if (got.join() !== want.join()) {
        failures++;
        console.log(`FAIL ${ch} ${letter} on ${bg}\n  want ${want.join(' ')}\n  got  ${got.join(' ')}`);
      }
      await cube.solve();
      const o = cube.orientation();
      if (o.F !== hold.front || o.U !== hold.top || cube.frontFace().some((c) => c !== hold.front)) {
        failures++;
        console.log(`FAIL solve ${ch} ${letter} on ${bg}`);
      }
    }
  }
}
console.log(`${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
