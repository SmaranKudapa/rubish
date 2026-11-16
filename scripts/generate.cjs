// Precomputes, for each glyph, a move sequence that takes a SOLVED cube
// (white on top / U, green in front / F) to a state whose front face shows the glyph.
// Method: build a random legal cube state with the desired front face, solve it
// with Kociemba's algorithm (cubejs), then invert the solution. Keep the shortest
// sequence found over many random tries.
const fs = require('fs');
const path = require('path');
const Cube = require('cubejs');
const glyphs = require('./glyphs.cjs');

const TRIES = Number(process.env.TRIES || 60);
const CENTER = 'F'; // green front center
const OTHER = 'U'; // white

const CORNER_COLORS = [['U', 'R', 'F'], ['U', 'F', 'L'], ['U', 'L', 'B'], ['U', 'B', 'R'], ['D', 'F', 'R'], ['D', 'L', 'F'], ['D', 'B', 'L'], ['D', 'R', 'B']];
const EDGE_COLORS = [['U', 'R'], ['U', 'F'], ['U', 'L'], ['U', 'B'], ['D', 'R'], ['D', 'F'], ['D', 'L'], ['D', 'B'], ['F', 'R'], ['F', 'L'], ['B', 'L'], ['B', 'R']];
// Front-face slots: [slot index, position of the F facelet within the slot, F-face cell 0..8]
const F_CORNERS = [[1, 1, 0], [0, 2, 2], [5, 2, 6], [4, 1, 8]]; // UFL, URF, DLF, DFR
const F_EDGES = [[1, 1, 1], [9, 0, 3], [8, 0, 5], [5, 1, 7]]; // UF, FL, FR, DF
const OTHER_CORNERS = [2, 3, 6, 7];
const OTHER_EDGES = [0, 2, 3, 4, 6, 7, 10, 11];

const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const mod = (x, m) => ((x % m) + m) % m;
const sum = (a) => a.reduce((x, y) => x + y, 0);
const parity = (p) => {
  let s = 0;
  const seen = [];
  for (let i = 0; i < p.length; i++) {
    if (seen[i]) continue;
    let j = i;
    let len = 0;
    while (!seen[j]) { seen[j] = 1; j = p[j]; len++; }
    s += len - 1;
  }
  return s % 2;
};

// `other` is the second color's face: 'U' (adjacent to the front) or 'B' (opposite).
function faceColors(glyph, other = OTHER) {
  const cells = glyph.join('').split('');
  // The center sticker can't move, so it decides which color is the letter.
  const centerOn = cells[4] === '#';
  const on = centerOn ? CENTER : other;
  const off = centerOn ? other : CENTER;
  return { colors: cells.map((c) => (c === '#' ? on : off)), on, off };
}

function buildState(target) {
  const cp = Array(8).fill(-1), co = Array(8).fill(0);
  const ep = Array(12).fill(-1), eo = Array(12).fill(0);
  const usedC = new Set(), usedE = new Set();
  for (const [slot, k, cell] of shuffle([...F_CORNERS])) {
    const c = target[cell];
    const cands = shuffle([...Array(8).keys()].filter((x) => !usedC.has(x) && CORNER_COLORS[x].includes(c)));
    if (!cands.length) return null;
    const x = cands[0];
    usedC.add(x);
    cp[slot] = x;
    co[slot] = mod(k - CORNER_COLORS[x].indexOf(c), 3);
  }
  for (const [slot, k, cell] of shuffle([...F_EDGES])) {
    const c = target[cell];
    const cands = shuffle([...Array(12).keys()].filter((x) => !usedE.has(x) && EDGE_COLORS[x].includes(c)));
    if (!cands.length) return null;
    const x = cands[0];
    usedE.add(x);
    ep[slot] = x;
    eo[slot] = mod(k - EDGE_COLORS[x].indexOf(c), 2);
  }
  const restC = shuffle([...Array(8).keys()].filter((x) => !usedC.has(x)));
  OTHER_CORNERS.forEach((s, i) => { cp[s] = restC[i]; co[s] = Math.floor(Math.random() * 3); });
  const restE = shuffle([...Array(12).keys()].filter((x) => !usedE.has(x)));
  OTHER_EDGES.forEach((s, i) => { ep[s] = restE[i]; eo[s] = Math.floor(Math.random() * 2); });
  // Make the state legal using only non-front pieces.
  co[2] = mod(co[2] - sum(co), 3);
  eo[0] = mod(eo[0] - sum(eo), 2);
  if (parity(cp) !== parity(ep)) {
    [ep[0], ep[2]] = [ep[2], ep[0]];
    [eo[0], eo[2]] = [eo[2], eo[0]];
  }
  const cube = new Cube();
  Object.assign(cube, { cp, co, ep, eo });
  return cube;
}

const frontFace = (s) => s.slice(18, 27);

console.log('Initialising solver...');
Cube.initSolver();

function shortest(ch, colors) {
  const want = colors.join('');
  let best = null;
  for (let t = 0; t < TRIES; t++) {
    const state = buildState(colors);
    if (!state || frontFace(state.asString()) !== want) continue;
    // A tight maxDepth makes Kociemba search for a very long time, so solve at the
    // default depth and just keep the shortest result.
    const sol = state.solve();
    if (!sol) continue;
    const moves = Cube.inverse(sol).trim().split(/\s+/).filter(Boolean);
    if (!best || moves.length < best.length) best = moves;
  }
  if (!best) throw new Error(`No solution for ${ch}`);
  const cube = new Cube();
  for (const m of best) cube.move(m);
  if (frontFace(cube.asString()) !== want) throw new Error(`Verification failed for ${ch}`);
  return best;
}

// Two variants per character: background on an adjacent face (U) for letter and
// background colors that touch on a real cube, and on the opposite face (B) for
// opposite pairs like white/yellow.
const out = {};
for (const [ch, glyph] of Object.entries(glyphs)) {
  const adj = faceColors(glyph, 'U');
  const opp = faceColors(glyph, 'B');
  const moves = shortest(ch, adj.colors);
  const oppMoves = shortest(ch, opp.colors);
  out[ch] = { glyph, letterColor: adj.on, backgroundColor: adj.off, moves, opposite: { moves: oppMoves } };
  console.log(`${ch}: ${moves.length} / ${oppMoves.length} moves`);
}

fs.writeFileSync(path.join(__dirname, '..', 'src', 'solutions.json'), JSON.stringify(out));
console.log('Wrote src/solutions.json');
