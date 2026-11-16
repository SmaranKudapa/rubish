// 3D Rubik's cube model: 26 cubies with stickers, animated layer turns,
// whole-cube rotations, and helpers for reading/orienting the cube.
// Moves use the viewer's frame: R/L = x axis, U/D = y axis, F/B = z axis.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Classic Rubik's colors.
export const PALETTE = {
  white: '#ffffff',
  yellow: '#ffd500',
  red: '#c41e3a',
  orange: '#ff5800',
  green: '#009e60',
  blue: '#0051ba',
};
export const COLOR_ORDER = ['red', 'orange', 'yellow', 'green', 'blue', 'white'];

// Physical color scheme of the cube in its home orientation.
const HOME = { U: 'white', D: 'yellow', F: 'green', B: 'blue', R: 'red', L: 'orange' };
const DIRS = { U: [0, 1, 0], D: [0, -1, 0], R: [1, 0, 0], L: [-1, 0, 0], F: [0, 0, 1], B: [0, 0, -1] };
// [axis, layer (null = whole cube), sign of a clockwise quarter turn]
const TURNS = {
  R: ['x', 1, -1], L: ['x', -1, 1],
  U: ['y', 1, -1], D: ['y', -1, 1],
  F: ['z', 1, -1], B: ['z', -1, 1],
  x: ['x', null, -1], y: ['y', null, -1], z: ['z', null, -1],
};
const SP = 1.03; // cubie spacing

export const linear = (t) => t;
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutBack = (t) => {
  const c1 = 1.4, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export const invertMove = (m) => (m.endsWith('2') ? m : m.endsWith("'") ? m[0] : m + "'");

// ---------- Orientation (which color faces where) ----------

// Whole-cube rotations as "new[face] = old[src[face]]".
const ROT = {
  x: { U: 'F', F: 'D', D: 'B', B: 'U', R: 'R', L: 'L' },
  y: { F: 'R', R: 'B', B: 'L', L: 'F', U: 'U', D: 'D' },
  z: { U: 'L', R: 'U', D: 'R', L: 'D', F: 'F', B: 'B' },
};
function rotateMap(map, m) {
  const times = m.endsWith('2') ? 2 : m.endsWith("'") ? 3 : 1;
  let cur = map;
  for (let i = 0; i < times; i++) {
    const next = {};
    for (const f in ROT[m[0]]) next[f] = cur[ROT[m[0]][f]];
    cur = next;
  }
  return cur;
}

// Shortest sequence of whole-cube rotations taking `current` to front/top colors.
export function findReorient(current, front, top) {
  const ROTS = ['x', "x'", 'x2', 'y', "y'", 'y2', 'z', "z'", 'z2'];
  let frontier = [[current, []]];
  for (let depth = 0; depth <= 3; depth++) {
    const next = [];
    for (const [map, seq] of frontier) {
      if (map.F === front && map.U === top) return seq;
      for (const r of ROTS) next.push([rotateMap(map, r), [...seq, r]]);
    }
    frontier = next;
  }
  throw new Error(`Cannot orient ${front}/${top}`);
}

const VEC = { white: [0, 1, 0], yellow: [0, -1, 0], green: [0, 0, 1], blue: [0, 0, -1], red: [1, 0, 0], orange: [-1, 0, 0] };
const colorOfVec = (v) => Object.keys(VEC).find((c) => VEC[c].every((x, i) => x === v[i]));

// Colors of every face when holding the cube with `front` facing you and `top` up.
export function faceColors(front, top) {
  const u = VEC[top], f = VEC[front];
  const r = [u[1] * f[2] - u[2] * f[1], u[2] * f[0] - u[0] * f[2], u[0] * f[1] - u[1] * f[0]];
  const neg = (v) => v.map((x) => -x || 0);
  return { U: top, F: front, R: colorOfVec(r), D: colorOfVec(neg(u)), B: colorOfVec(neg(f)), L: colorOfVec(neg(r)) };
}

export const OPPOSITE = { white: 'yellow', yellow: 'white', red: 'orange', orange: 'red', green: 'blue', blue: 'green' };

// How to hold the cube, and which moves to use, so `entry` draws the glyph in
// `letter` on `bg`. The glyph's center sticker can't move, so whichever color
// the center needs faces you. Two solution sets exist:
//  - adjacent colors: the other color is on top    (entry.moves)
//  - opposite colors: the other color is at the back (entry.opposite.moves)
export function holdFor(entry, letter, bg) {
  if (letter === bg) throw new Error('Letter and background colors must differ');
  const centerOn = entry.letterColor === 'F';
  const front = centerOn ? letter : bg;
  const other = centerOn ? bg : letter;
  if (OPPOSITE[front] !== other) return { letter, bg, front, top: other, moves: entry.moves };
  // Opposite pair: any color beside the front can go on top.
  const top = ['white', 'green', 'red'].find((c) => c !== front && c !== other);
  return { letter, bg, front, top, moves: entry.opposite.moves };
}

// ---------- The cube ----------

function roundedRect(size, r) {
  const s = size / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-s + r, -s);
  shape.lineTo(s - r, -s);
  shape.quadraticCurveTo(s, -s, s, -s + r);
  shape.lineTo(s, s - r);
  shape.quadraticCurveTo(s, s, s - r, s);
  shape.lineTo(-s + r, s);
  shape.quadraticCurveTo(-s, s, -s, s - r);
  shape.lineTo(-s, -s + r);
  shape.quadraticCurveTo(-s, -s, -s + r, -s);
  return new THREE.ShapeGeometry(shape, 6);
}

const tmpM = new THREE.Matrix4();
function snap(c, scale = 1) {
  c.position.set(Math.round(c.position.x / SP) * SP, Math.round(c.position.y / SP) * SP, Math.round(c.position.z / SP) * SP);
  tmpM.makeRotationFromQuaternion(c.quaternion);
  for (let i = 0; i < 16; i++) tmpM.elements[i] = Math.round(tmpM.elements[i]);
  c.quaternion.setFromRotationMatrix(tmpM);
  c.scale.setScalar(scale);
}

export class RubiksCube {
  constructor() {
    this.group = new THREE.Group();
    this.cubies = [];
    this.history = []; // face moves applied since the cube was last solved
    this.spread = 0; // exploded-view amount: 0 = normal, bigger = wider gaps
    this.queue = Promise.resolve();
    this.materials = {};
    for (const name of COLOR_ORDER) {
      // Matte, flat-shaded stickers: a classic 80s cube, not a glossy speedcube.
      this.materials[name] = new THREE.MeshLambertMaterial({
        color: PALETTE[name], emissive: PALETTE[name], emissiveIntensity: 0, flatShading: true,
      });
    }
    const body = new THREE.MeshLambertMaterial({ color: 0x111111, flatShading: true });
    const box = new RoundedBoxGeometry(0.99, 0.99, 0.99, 1, 0.02);
    const sticker = roundedRect(0.86, 0.04);
    const zAxis = new THREE.Vector3(0, 0, 1);
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
      if (!x && !y && !z) continue;
      const c = new THREE.Group();
      c.position.set(x * SP, y * SP, z * SP);
      c.add(new THREE.Mesh(box, body));
      for (const [f, d] of Object.entries(DIRS)) {
        if ((d[0] && d[0] !== x) || (d[1] && d[1] !== y) || (d[2] && d[2] !== z)) continue;
        const n = new THREE.Vector3(...d);
        const s = new THREE.Mesh(sticker, this.materials[HOME[f]]);
        s.position.copy(n).multiplyScalar(0.5);
        s.quaternion.setFromUnitVectors(zAxis, n);
        s.userData = { normal: n, color: HOME[f] };
        c.add(s);
      }
      this.group.add(c);
      this.cubies.push(c);
    }
  }

  // Exploded view: the stage scales the whole group by (1 + k) and each cubie
  // shrinks back by 1 / (1 + k), so cubies keep their size but the gaps grow.
  setSpread(k) {
    this.spread = k;
    const s = 1 / (1 + k);
    for (const c of this.cubies) c.scale.setScalar(s);
  }

  // Queue a move. duration 0 = instant. record=false keeps it out of history.
  turn(move, duration = 0, ease = easeInOutCubic, record = true) {
    const run = async () => {
      await this._turn(move, duration, ease);
      if (record && !'xyz'.includes(move[0])) this._record(move);
    };
    this.queue = this.queue.then(run, run);
    return this.queue;
  }

  // Push to history, merging with the previous move on the same face
  // (R + R = R2, R + R' = nothing) so solving back takes fewer turns.
  _record(move) {
    const q = (m) => (m.endsWith('2') ? 2 : m.endsWith("'") ? 3 : 1);
    const last = this.history[this.history.length - 1];
    if (last && last[0] === move[0]) {
      this.history.pop();
      const t = (q(last) + q(move)) % 4;
      if (t) this.history.push(move[0] + ['', '', '2', "'"][t]);
    } else {
      this.history.push(move);
    }
  }

  _turn(move, duration, ease) {
    const [axis, layer, sign] = TURNS[move[0]];
    let angle = (sign * Math.PI) / 2;
    if (move.endsWith("'")) angle = -angle;
    else if (move.endsWith('2')) angle *= 2;
    const sel = this.cubies.filter((c) => layer === null || Math.round(c.position[axis] / SP) === layer);
    const pivot = new THREE.Group();
    this.group.add(pivot);
    for (const c of sel) pivot.add(c);
    const finish = () => {
      pivot.rotation[axis] = angle;
      pivot.updateMatrix();
      for (const c of sel) {
        c.applyMatrix4(pivot.matrix);
        this.group.add(c);
        snap(c, 1 / (1 + this.spread));
      }
      this.group.remove(pivot);
    };
    if (!duration) {
      finish();
      return Promise.resolve();
    }
    RubiksCube.onTurn?.(duration);
    return new Promise((resolve) => {
      const t0 = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - t0) / duration);
        pivot.rotation[axis] = angle * ease(t);
        if (t < 1) requestAnimationFrame(step);
        else { finish(); resolve(); }
      };
      requestAnimationFrame(step);
    });
  }

  // Undo every recorded move, returning to the solved state.
  async solve(duration = 0, ease = easeInOutCubic, alive = () => true) {
    await this.queue;
    while (this.history.length) {
      if (!alive()) return false;
      await this.turn(invertMove(this.history.pop()), duration, ease, false);
    }
    return true;
  }

  // Colors currently facing each direction, read from the center pieces.
  orientation() {
    const map = {};
    for (const [f, d] of Object.entries(DIRS)) {
      for (const c of this.cubies) {
        const p = c.position;
        if (Math.round(p.x / SP) !== d[0] || Math.round(p.y / SP) !== d[1] || Math.round(p.z / SP) !== d[2]) continue;
        const s = c.children.find((ch) => ch.userData.normal);
        map[f] = s.userData.color;
      }
    }
    return map;
  }

  async reorient(front, top, duration = 0, ease = easeInOutCubic, alive = () => true) {
    await this.queue;
    for (const m of findReorient(this.orientation(), front, top)) {
      if (!alive()) return false;
      await this.turn(m, duration, ease, false);
    }
    return true;
  }

  // The 9 colors of the front face, row by row from the top-left.
  frontFace() {
    const out = Array(9);
    const n = new THREE.Vector3();
    for (const c of this.cubies) {
      if (Math.round(c.position.z / SP) !== 1) continue;
      for (const s of c.children) {
        if (!s.userData.normal) continue;
        n.copy(s.userData.normal).applyQuaternion(c.quaternion).round();
        if (n.z !== 1) continue;
        const row = 1 - Math.round(c.position.y / SP);
        const col = Math.round(c.position.x / SP) + 1;
        out[row * 3 + col] = s.userData.color;
      }
    }
    return out;
  }
}

// Optional hook, called at the start of every animated turn (used for sound).
RubiksCube.onTurn = null;
