// The NUKE easter egg (type NUKE and submit; the word box locks).
//
//  0.0s  a 3D launcher slides in from the left and eases to a stop; its hatch
//        swings open
//  2.2s  a 3D missile launches and flies, at one steady speed, along an
//        unpredictable rollercoaster path to the achievement button, growing
//        as it comes. The screen warms to red, the alarm wails and the page
//        shakes harder as it gets close.
// ~22s   the moment the nose touches the button: flash, full red world, every
//        cube explodes, the UI falls apart and a slow, animated mushroom cloud
//        rises behind it all. "NUKE" sits in the word box 3s more, then lifts
//        out to the middle of the screen, gains a D (the debris stuck in the
//        cracked glass spirals in and morphs into it), and the letters flip
//        into cubes. Then "press any key".
import * as THREE from 'three';
import { PALETTE } from './cube3d.js';
import { buildCube } from './title.js';

const TOTAL = 22000; // launch to impact (it takes its time)
const LAUNCH = 2200; // the launcher slides in and opens before the missile fires
const SLIDE = 1500; // ...of which the slide in takes this long
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const lerp = (a, b, t) => a + (b - a) * t;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 3D launcher ----------
// An olive box with hazard stripes, a launch tube and a hatch that swings
// open. The base's bottom sits at y = -0.45. `mouth` marks the top of the tube.
function buildLauncher() {
  const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
  const root = new THREE.Group();
  const body = new THREE.Group(); // turned a little so it reads as 3D
  body.rotation.set(0.28, -0.55, 0);
  root.add(body);
  body.add(new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.9, 2.2), lam(0x55613f)));
  // Hazard stripes along the front and side
  for (let i = 0; i < 8; i++) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.04), lam(i % 2 ? 0x111111 : PALETTE.yellow));
    stripe.position.set(-1.4 + i * 0.4, 0.12, 1.12);
    body.add(stripe);
  }
  for (let i = 0; i < 5; i++) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.44), lam(i % 2 ? 0x111111 : PALETTE.yellow));
    stripe.position.set(1.62, 0.12, -0.88 + i * 0.44);
    body.add(stripe);
  }
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.85, 1.7, 18), lam(0x2f3529));
  tube.position.y = 1.3;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 0.88, 0.16, 18), lam(0x9aa58f));
  rim.position.y = 2.15;
  const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.02, 18), lam(0x0b0b0b));
  hole.position.y = 2.24;
  body.add(tube, rim, hole);
  // Hatch, hinged at the back edge of the rim
  const hinge = new THREE.Group();
  hinge.position.set(-0.88, 2.24, 0);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.1, 1.76), lam(0x6b7a63));
  lid.position.x = 0.88;
  hinge.add(lid);
  body.add(hinge);
  const mouth = new THREE.Object3D();
  mouth.position.y = 2.3;
  body.add(mouth);
  return { root, hatch: hinge, mouth };
}

// ---------- 3D missile ----------
// Built along +Y (nose up), about 4.6 units long.
function buildMissile() {
  const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
  const root = new THREE.Group(); // points along the path
  const tilt = new THREE.Group(); // leans toward the viewer
  const spin = new THREE.Group(); // rolls around its own axis
  root.add(tilt);
  tilt.add(spin);
  tilt.rotation.x = 0.45;

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 3, 20), lam(0xf2f2f2));
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.5, 20), lam(PALETTE.yellow));
  band.position.y = 0.55;
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.53, 0.53, 0.12, 20), lam(0x111111));
  stripe.position.y = 0.55;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.25, 20), lam(PALETTE.red));
  nose.position.y = 2.12;
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.46, 0.35, 16), lam(0x333333));
  nozzle.position.y = -1.67;
  spin.add(body, band, stripe, nose, nozzle);
  for (let k = 0; k < 4; k++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.95, 0.75), lam(0x6b7a63));
    const a = (k * Math.PI) / 2;
    fin.position.set(Math.sin(a) * 0.62, -1.15, Math.cos(a) * 0.62);
    fin.rotation.y = a;
    spin.add(fin);
  }
  const flame = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.5, 14), new THREE.MeshBasicMaterial({ color: PALETTE.orange }));
  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9, 12), new THREE.MeshBasicMaterial({ color: 0xfff3a0 }));
  outer.rotation.x = inner.rotation.x = Math.PI; // point backwards
  outer.position.y = -2.55;
  inner.position.y = -2.25;
  flame.add(outer, inner);
  spin.add(flame);
  return { root, spin, flame };
}

// ---------- The flight path, travelled at constant speed ----------
// A random zigzag of waypoints around the screen, with every corner rounded
// off by a circular arc that's tangent to both sides. So the path is smooth
// everywhere (its direction never jumps), and:
//  - every arc is wide (radius at least a quarter of the screen's short side)
//    and no single corner turns more than 70°, so it can only come about in a
//    big sweeping loop, never a hairpin or a snap 180;
//  - a rounded corner stays inside the waypoints' outline, so with every
//    waypoint on screen the whole flight stays on screen.
// It climbs straight up out of the launcher first and finishes on a straight
// run into the target.
const MAX_TURN = (70 * Math.PI) / 180;
const MIN_RADIUS = 0.25; // × the screen's short side

function rollercoaster(W, H, start, target) {
  for (let attempt = 0; attempt < 1500; attempt++) {
    const way = waypoints(W, H, start, target);
    if (way) return roundCorners(way);
  }
  // Practically never: just climb, swing over and dive.
  return roundCorners([start, [start[0], start[1] - H * 0.3], [W * 0.5, H * 0.35], target]);
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const angTo = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);

function waypoints(W, H, start, target) {
  const m = Math.min(W, H);
  const pad = m * 0.09;
  const inBox = ([x, y]) => x > pad && x < W - pad && y > pad && y < H - pad * 1.8;
  const pts = [start, [start[0], start[1] - Math.max(H * 0.2, m * 0.25)]];
  let h = -Math.PI / 2;
  let prevLen = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) * 1.2; // first corner may use more of the climb
  const legs = 6 + Math.floor(Math.random() * 3);
  const mx = W / 2 - target[0], my = H * 0.5 - target[1], ml = Math.hypot(mx, my) || 1;
  const lineup = [target[0] + (mx / ml) * m * 0.6, target[1] + (my / ml) * m * 0.6];
  // The arc at a corner uses up to half of each leg; it must stay wide.
  const okTurn = (t, inLen, outLen) => Math.abs(t) <= MAX_TURN
    && Math.min(inLen * 0.5, outLen * 0.5) / Math.tan(Math.max(Math.abs(t), 1e-6) / 2) >= m * MIN_RADIUS;
  for (let i = 0; i < legs; i++) {
    const p = pts[pts.length - 1];
    let next = null;
    // Lean each turn toward a random spot around the middle (so it steers
    // away from the edges before it gets cornered), plus a random swerve.
    // The last legs lean toward a spot in line with the target instead, so the
    // final run in is a gentle turn.
    const aim = i >= legs - 2 ? lineup : [W * (0.25 + Math.random() * 0.5), H * (0.2 + Math.random() * 0.45)];
    const lean = wrap(angTo(p, aim) - h) * 0.9;
    for (let tries = 0; tries < 40 && !next; tries++) {
      const t = Math.max(-MAX_TURN, Math.min(MAX_TURN, lean + (Math.random() * 2 - 1) * MAX_TURN * 0.85));
      const len = m * (0.3 + Math.random() * 0.25);
      if (!okTurn(t, prevLen, len)) continue;
      const c = [p[0] + Math.cos(h + t) * len, p[1] + Math.sin(h + t) * len];
      if (inBox(c)) { next = c; h += t; prevLen = len; }
    }
    if (!next) return null;
    pts.push(next);
  }
  // The final run into the target must also be a gentle turn, and long enough.
  const p = pts[pts.length - 1];
  const t = wrap(angTo(p, target) - h);
  const finalLen = Math.hypot(target[0] - p[0], target[1] - p[1]);
  if (finalLen < m * 0.45 || !okTurn(t, prevLen, finalLen * 0.9)) return null;
  pts.push(target);
  return pts;
}

// Lines between the waypoints, each corner replaced by a tangent circular arc.
function roundCorners(pts) {
  const out = [pts[0]];
  const STEP = 3; // px between samples
  // Skip repeats: a zero-length step has no direction (the nose would flick).
  const put = (q) => { const l = out[out.length - 1]; if (Math.hypot(q[0] - l[0], q[1] - l[1]) > 0.5) out.push(q); };
  const line = (a, b) => {
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / STEP));
    for (let i = 1; i <= n; i++) put([lerp(a[0], b[0], i / n), lerp(a[1], b[1], i / n)]);
  };
  let from = pts[0];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], p = pts[i], b = pts[i + 1];
    const lin = Math.hypot(p[0] - a[0], p[1] - a[1]), lout = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const ui = [(p[0] - a[0]) / lin, (p[1] - a[1]) / lin], uo = [(b[0] - p[0]) / lout, (b[1] - p[1]) / lout];
    const turn = wrap(Math.atan2(uo[1], uo[0]) - Math.atan2(ui[1], ui[0]));
    if (Math.abs(turn) < 1e-3) continue;
    // Use as much of each leg as possible (half of it; the first and last
    // legs keep a straight bit at the launcher and before the target).
    const capIn = i === 1 ? lin * 0.6 : lin * 0.5, capOut = i === pts.length - 2 ? lout * 0.45 : lout * 0.5;
    const tl = Math.min(capIn, capOut);
    const r = tl / Math.tan(Math.abs(turn) / 2);
    const s = [p[0] - ui[0] * tl, p[1] - ui[1] * tl];
    line(from, s);
    const side = Math.sign(turn); // +1 turns clockwise on screen (y down)
    const cx = s[0] - ui[1] * r * side, cy = s[1] + ui[0] * r * side;
    const a0 = Math.atan2(s[1] - cy, s[0] - cx);
    const n = Math.max(2, Math.ceil((Math.abs(turn) * r) / STEP));
    for (let k = 1; k <= n; k++) {
      const ang = a0 + (turn * k) / n;
      put([cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]);
    }
    from = out[out.length - 1];
  }
  line(from, pts[pts.length - 1]);
  return out;
}

// Arc-length lookup: point and heading at a fraction of the total length.
function constantSpeed(pts) {
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = lens[lens.length - 1];
  let i = 1;
  return (f) => {
    const s = clamp01(f) * total;
    if (lens[i - 1] > s) i = 1;
    while (i < lens.length - 1 && lens[i] < s) i++;
    const k = (s - lens[i - 1]) / (lens[i] - lens[i - 1] || 1);
    const a = pts[i - 1], b = pts[i];
    return { x: lerp(a[0], b[0], k), y: lerp(a[1], b[1], k), dx: b[0] - a[0], dy: b[1] - a[1] };
  };
}

// ---------- A cracked screen (pixel style), from a point of impact ----------
function crackScreen(x, y) {
  const W = innerWidth, H = innerHeight;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const c = document.createElement('canvas');
  c.className = 'nuke-crack';
  c.width = Math.round(W * dpr);
  c.height = Math.round(H * dpr);
  document.body.appendChild(c);
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const P = 2; // crack "pixel" size
  const plot = (px, py, col) => { g.fillStyle = col; g.fillRect(Math.round(px / P) * P, Math.round(py / P) * P, P, P); };
  const line = (x0, y0, x1, y1) => {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / P));
    for (let i = 0; i <= n; i++) {
      const px = lerp(x0, x1, i / n), py = lerp(y0, y1, i / n);
      plot(px + 1.5, py + 1.5, 'rgba(0, 0, 0, 0.45)');
      plot(px, py, 'rgba(255, 255, 255, 0.92)');
    }
  };
  const crack = (sx, sy, ang, len, depth) => {
    let px = sx, py = sy, a = ang, done = 0;
    while (done < len) {
      const step = 22 + Math.random() * 34;
      a += (Math.random() - 0.5) * 0.28; // glass cracks run fairly straight
      const nx = px + Math.cos(a) * step, ny = py + Math.sin(a) * step;
      line(px, py, nx, ny);
      if (depth < 1 && Math.random() < 0.13) crack(nx, ny, a + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5), len * 0.3, depth + 1);
      px = nx; py = ny; done += step;
    }
  };
  // Glare and a shattered core
  const glare = g.createRadialGradient(x, y, 0, x, y, 70);
  glare.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
  glare.addColorStop(1, 'rgba(255, 255, 255, 0)');
  g.fillStyle = glare;
  g.fillRect(x - 70, y - 70, 140, 140);
  const spokes = 8 + Math.floor(Math.random() * 4);
  for (let k = 0; k < spokes; k++) crack(x, y, (k / spokes) * Math.PI * 2 + Math.random() * 0.4, 110 + Math.random() * Math.max(W, H) * 0.28, 0);
  // Broken rings around the impact
  for (const r of [16, 38, 70]) {
    const n = 18;
    for (let k = 0; k < n; k++) {
      if (Math.random() < 0.35) continue;
      const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
      const r0 = r * (0.85 + Math.random() * 0.3), r1 = r * (0.85 + Math.random() * 0.3);
      line(x + Math.cos(a0) * r0, y + Math.sin(a0) * r0, x + Math.cos(a1) * r1, y + Math.sin(a1) * r1);
    }
  }
}

// ---------- Animated pixel mushroom cloud ----------
const h2 = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(h2(xi, yi), h2(xi + 1, yi), u), lerp(h2(xi, yi + 1), h2(xi + 1, yi + 1), u), v);
}
const CLOUD_RAMP = [[0.82, [255, 246, 200]], [0.64, [255, 213, 0]], [0.46, [255, 88, 0]], [0.28, [196, 30, 58]], [0.14, [110, 22, 22]], [-Infinity, [70, 52, 52]]];

function cloudPainter(canvas) {
  const N = canvas.width;
  const g = canvas.getContext('2d');
  const img = g.createImageData(N, N);
  return (T) => {
    const grow = easeOut(clamp01(T / 3.8));
    const cool = clamp01(T / 14) * 0.45; // slowly cools from white-hot to red and smoke
    const cx = N / 2, ground = N - 4;
    const capY = lerp(ground - 8, 15, grow), capRx = 5 + 22 * grow, capRy = 3 + 10 * grow;
    const ringRx = 7 + 23 * grow;
    const d = img.data;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const churn = noise(x * 0.16 + T * 0.35, y * 0.16 - T * 1.3); // rolling upward
      const wobble = (noise(x * 0.11 - T * 0.5, y * 0.11 + T * 0.2) - 0.5) * 0.5;
      let k = -9;
      const cap = Math.hypot((x - cx) / capRx, (y - capY) / capRy) + wobble;
      if (cap < 1) k = Math.max(k, 1.05 - cap * 0.85 - (y - capY + capRy) / (N * 1.4));
      const stemHalf = (2.5 + 2.5 * grow) * (1 + Math.max(0, (y - ground + 12) / 9)) + wobble * 3;
      if (y > capY && y < ground && Math.abs(x - cx) < stemHalf) k = Math.max(k, 0.7 - Math.abs(x - cx) / 10 - (y - capY) / (N * 1.6));
      const ring = Math.hypot((x - cx) / ringRx, (y - ground) / 4.5) + wobble * 0.6;
      if (ring < 1) k = Math.max(k, 0.55 - ring * 0.45);
      const i = (y * N + x) * 4;
      if (k < -1) { d[i + 3] = 0; continue; }
      const heat = k + (churn - 0.5) * 0.35 - cool;
      const col = CLOUD_RAMP.find(([t]) => heat > t)[1];
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  };
}

function el(cls, parent, tag = 'div') {
  const e = document.createElement(tag);
  e.className = cls;
  parent.appendChild(e);
  return e;
}

// stage, physics, title: the app's parts. uiEls: things that fall off on impact.
// input: the (locked) word box holding "NUKE". target: the button that gets hit.
// data: letter glyphs for the cubes.
export async function runNuke({ stage, physics, title, uiEls, input, target, data, sound = {}, onImpact = () => {}, canHover = true }) {
  const W = innerWidth, H = innerHeight;
  const layer = el('nuke-layer', document.body);
  const tint = el('nuke-tint', layer);
  const vignette = el('nuke-vignette', layer);

  const floorTop = physics.floorY(0);
  const lx = W * 0.18; // where the launcher stands

  // 3D missile, drawn on its own transparent canvas over the page.
  const canvas = el('nuke-3d', layer, 'canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(W, H, false);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, W, 0, -H, -2000, 2000);
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(-0.4, 1, 1);
  scene.add(sun, new THREE.AmbientLight(0xffffff, 1.3));
  const missile = buildMissile();
  missile.root.visible = false;
  scene.add(missile.root);
  const LEN = 4.6; // model length in units
  const basePx = 48; // on-screen length at launch...
  const endPx = Math.max(input.getBoundingClientRect().width * 1.05, 200); // ...and at impact

  // 3D launcher standing on the floor.
  const launcher = buildLauncher();
  const LSCALE = 30; // px per unit
  launcher.root.scale.setScalar(LSCALE);
  scene.add(launcher.root);
  const launcherY = -(floorTop - 0.45 * LSCALE);
  const offLeft = -LSCALE * 3; // starts fully off the left edge
  // Nose tip, in model units ahead of the missile's origin (as seen on screen,
  // with the lean toward the viewer).
  const TIP = (2.12 + 0.625) * Math.cos(0.45);
  const hitBox = { l: 0, r: 0, t: 0, b: 0 };

  // The path is made at launch time, starting at the top of the launch tube.
  const tr = target.getBoundingClientRect();
  const tx = tr.left + tr.width / 2, ty = tr.top + tr.height / 2;
  let path = null;

  const panelish = [document.querySelector('.title'), document.querySelector('.panel')];
  const stopSiren = sound.siren?.(TOTAL / 1000);
  let launched = false, hit = false;

  // ---------- The flight ----------
  await new Promise((resolve) => {
    const t0 = performance.now();
    const frame = (now) => {
      const ms = now - t0;
      const t = ms / 1000;

      // Launcher slides in from the left, easing to a stop (with a little
      // rock as it brakes); then its hatch swings open.
      const sl = clamp01(ms / SLIDE);
      launcher.root.position.set(lerp(offLeft, lx, easeOut(sl)), launcherY, 0);
      const brake = ms < SLIDE ? -0.06 * Math.sin(Math.PI * sl) : 0.05 * Math.sin((ms - SLIDE) / 70) * Math.exp(-(ms - SLIDE) / 260);
      launcher.root.rotation.z = brake;
      launcher.hatch.rotation.z = 1.9 * easeInOut(clamp01((ms - SLIDE - 50) / 600));

      if (ms >= LAUNCH) {
        if (!launched) {
          launched = true;
          launcher.root.rotation.z = 0;
          launcher.root.updateMatrixWorld(true);
          const r0 = target.getBoundingClientRect();
          Object.assign(hitBox, { l: r0.left - 3, r: r0.right + 3, t: r0.top - 3, b: r0.bottom + 3 });
          const mouth = launcher.mouth.getWorldPosition(new THREE.Vector3());
          path = constantSpeed(rollercoaster(W, H, [mouth.x, -mouth.y], [tx, ty]));
          missile.root.visible = true;
          sound.launch?.();
        }
        // Same speed the whole way: position is a straight fraction of the path length.
        const f = (ms - LAUNCH) / (TOTAL - LAUNCH);
        const p = path(f);
        const px = lerp(basePx, endPx, f); // grows steadily all the way to the target
        missile.root.position.set(p.x, -p.y, 0);
        missile.root.scale.setScalar(px / LEN);
        missile.root.rotation.z = Math.atan2(-p.dy, p.dx) - Math.PI / 2;
        missile.spin.rotation.y = t * 2.2;
        missile.flame.scale.set(1, 0.8 + Math.random() * 0.5, 1);
        // Goes off the instant the nose touches the button.
        const dl = Math.hypot(p.dx, p.dy) || 1;
        const tipX = p.x + (p.dx / dl) * TIP * (px / LEN), tipY = p.y + (p.dy / dl) * TIP * (px / LEN);
        if (f > 0.5 && tipX >= hitBox.l && tipX <= hitBox.r && tipY >= hitBox.t && tipY <= hitBox.b) hit = true;
      }
      renderer.render(scene, camera);

      // A warm red glow builds while it's in the air (only half of the full
      // red; the rest comes with the blast), plus alarm pulse and shaking.
      const k = clamp01(ms / TOTAL);
      const pulse = 0.5 + 0.5 * Math.sin(t * 7);
      tint.style.opacity = String(0.42 * Math.pow(k, 1.3) + 0.06 * pulse * k);
      vignette.style.opacity = String(Math.pow(k, 1.5) * (0.4 + 0.25 * pulse));
      stage.fx.shake = Math.pow(k, 2.2) * 0.7;
      const j = Math.pow(k, 2.5) * 7;
      for (const n of panelish) if (n) n.style.transform = `translate(${(Math.random() - 0.5) * j}px, ${(Math.random() - 0.5) * j}px)`;

      if (ms < TOTAL && !hit) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });

  // ---------- Impact on the button ----------
  stopSiren?.();
  onImpact();
  sound.nukeBoom?.();
  renderer.dispose();
  canvas.remove();
  const flash = el('nuke-flash', layer);
  flash.style.opacity = '1';
  requestAnimationFrame(() => { flash.style.transition = 'opacity 1.6s ease-out'; flash.style.opacity = '0'; });
  const burst = el('nuke-burst', layer);
  burst.style.left = `${tx}px`;
  burst.style.top = `${ty}px`;
  // The button itself is blown to bits.
  target.style.visibility = 'hidden';
  physics.explode(tx, ty, Math.max(tr.width, 40) * 1.2);

  stage.fx.shake = 1;
  document.body.classList.add('nuked');
  tint.style.transition = 'opacity 1s ease';
  tint.style.opacity = '0.5';
  vignette.style.transition = 'opacity 1s ease';
  vignette.style.opacity = '0.85';

  // The word lifts out of the box before the box falls away.
  const box = input.getBoundingClientRect();
  const boxFont = parseFloat(getComputedStyle(input).fontSize) || 18;

  // Every cube blows up; debris rains down.
  stage.shatterAll();
  title.explodeAll();
  physics.confetti(160);
  // One piece of debris flies into the glass, cracks it, and sticks there
  // (half in the screen) until it becomes the D of NUKED.
  let stuck = null;
  setTimeout(() => {
    const p = physics.pickPiece();
    if (!p) return; // no debris, no crack
    const cx2 = W * (0.22 + Math.random() * 0.56), cy2 = H * (0.18 + Math.random() * 0.2);
    // It comes at the glass slower and slower (a cartoon whistle as it
    // closes in), visibly growing all the way, then smashes into it.
    // Colored on every side, so it reads as a solid little cube.
    physics.colorAll(p);
    const DUR = 4500;
    sound.slideWhistle?.(DUR / 1000);
    physics.sendTo(p, {
      x: cx2, y: cy2, size: Math.min(W, H) * 0.15, dur: DUR, lift: 0, stay: true, freeze: true,
      ease: (t) => 1 - (1 - t) ** 2.6,
      sizeEase: (t) => t * t, // grows quadratically: slowly at first, ballooning as it gets close
      onArrive: () => { crackScreen(cx2, cy2); sound.glass?.(); stuck = p; },
    });
  }, 1500);

  // Near misses: lots of other bits of debris come at the screen too, at all
  // sorts of speeds, ballooning as they close in. Most whoosh off past an edge;
  // some fly right past the camera, close by the side of the screen (never
  // over the middle). None of them hit the glass (only the one above does that).
  for (let i = 0; i < 24; i++) {
    setTimeout(() => {
      const p = physics.pickPiece();
      if (!p) return;
      physics.colorAll(p);
      const flyby = Math.random() < 0.35;
      const speed = Math.random(); // 0 = slow drifter, 1 = streaks past
      const dur = flyby ? 700 + (1 - speed) * 900 : 900 + (1 - speed) * 3100;
      let tx, ty, size;
      if (flyby) {
        // Past the camera by the left or right side: it ends centered just
        // beyond that edge, so at its biggest only a strip of it covers the side.
        const right = Math.random() < 0.5;
        size = Math.min(H * (0.7 + Math.random() * 0.35), W * 0.8); // (narrow phone screens too)
        const out = size * (0.18 + Math.random() * 0.15); // how far past the edge its middle ends up
        tx = right ? W + out : -out;
        ty = H * (0.2 + Math.random() * 0.6);
      } else {
        // Off past an edge, mostly the top and sides (as if flying past your head).
        const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5;
        tx = W / 2 + Math.cos(a) * W * 0.8;
        ty = H / 2 + Math.sin(a) * H * 0.85;
        size = Math.min(W, H) * (0.25 + Math.random() * 0.3);
      }
      physics.sendTo(p, {
        x: tx, y: ty, size, dur, lift: 0,
        fade: flyby ? 40 : 200, // a fly-by is just gone, past the lens
        ease: (t) => t * t * (3 - 2 * t) * 0.35 + t * t * 0.65, // drifts, then rushes past
        sizeEase: flyby ? (t) => t ** 3 : (t) => t * t, // grows faster and faster as it gets close
        onArrive: () => { if (!flyby) sound.whoosh?.(); },
      });
      // A fly-by gets a loud rushing whoosh as it tears past.
      if (flyby) setTimeout(() => sound.flyby?.(), Math.max(0, dur - 260));
    }, 600 + Math.random() * 6400);
  }

  // Bits of the UI shake loose and fall, at random.
  for (const n of panelish) if (n) { n.style.transform = ''; n.classList.add('quake'); }
  for (const node of uiEls) {
    if (!node || !node.isConnected || node === target || node === input) continue;
    node.style.setProperty('--delay', `${(Math.random() * 1.4).toFixed(2)}s`);
    node.style.setProperty('--dur', `${(1.3 + Math.random() * 0.9).toFixed(2)}s`);
    node.style.setProperty('--rot', `${Math.round((Math.random() - 0.5) * 220)}deg`);
    node.style.setProperty('--dx', `${Math.round((Math.random() - 0.5) * 240)}px`);
    node.classList.add('fall');
  }

  // Slow, animated mushroom cloud rising behind everything, under the impact.
  const back = el('nuke-back', document.body);
  const cloudCanvas = el('nuke-cloud', back, 'canvas');
  cloudCanvas.width = cloudCanvas.height = 64;
  const cw = Math.min(W * 0.85, H * 1.05);
  const cx = Math.min(Math.max(tx, cw / 2), W - cw / 2);
  Object.assign(cloudCanvas.style, { width: `${cw}px`, height: `${cw}px`, left: `${cx - cw / 2}px`, top: `${floorTop - cw * 0.97}px` });
  const paint = cloudPainter(cloudCanvas);
  const cloudStart = performance.now();
  const CLOUD_SLOW = 12; // 12x slower than real time
  const animateCloud = (now) => {
    paint((now - cloudStart) / 1000 / CLOUD_SLOW);
    if (back.isConnected) requestAnimationFrame(animateCloud);
  };
  requestAnimationFrame(animateCloud);

  // NUKE sits in the (still standing) word box for 3 more seconds...
  await sleep(700);
  for (const n of panelish) if (n) n.classList.remove('quake');
  stage.fx.shake = 0.35;
  await sleep(3000);

  // ...then floats out of the box to the middle of the screen as plain text,
  // and the empty box falls away.
  const looks = [['N', 'white', 'red'], ['U', 'white', 'orange'], ['K', 'white', 'yellow'], ['E', 'white', 'red'], ['D', 'white', 'orange']];
  const word = el('title intro nuke-word instant', layer);
  const cubes = looks.map((look, i) => buildCube(data, look, i).mini);
  for (const c of cubes.slice(0, 4)) { c.classList.add('letter-in'); word.appendChild(c); }
  const m = cubes[0].offsetWidth;
  const s0 = boxFont / (m * 0.9);
  const centerY = H * 0.44;
  word.style.top = `${centerY}px`;
  word.style.transform = `translate(-50%, -50%) translate(${box.left + box.width / 2 - W / 2}px, ${box.top + box.height / 2 - centerY}px) scale(${s0})`;
  input.value = '';
  input.placeholder = '';
  for (const [k, v] of [['--delay', '0.3s'], ['--dur', '1.6s'], ['--rot', '-40deg'], ['--dx', '-60px']]) input.style.setProperty(k, v);
  input.classList.add('fall');
  await sleep(60);
  word.classList.remove('instant'); // from here on, slow transitions
  void word.offsetWidth;
  word.style.transition = 'transform 8.5s cubic-bezier(0.65, 0, 0.35, 1)';
  word.style.transform = 'translate(-50%, -50%) scale(1)';
  sound.whoosh?.();
  await sleep(1800);
  stage.fx.shake = 0;
  await sleep(6900);

  // ...gains a D. The piece stuck in the glass wrenches free, and as it
  // spirals in (spinning faster and faster) the D's slot opens at the same
  // time, NUKE sliding over to make room; the piece lands in the slot and
  // morphs into the D in a flash. With no stuck piece, the slot opens and the
  // D spins in by itself.
  const d = cubes[4];
  const showD = () => {
    d.classList.add('letter-in', 'd-morph');
    d.addEventListener('animationend', () => d.classList.remove('d-morph'), { once: true });
    sound.pop?.();
    sound.blip?.(5);
  };
  const openSlot = () => {
    d.classList.add('squeezed');
    word.appendChild(d);
    void d.offsetWidth;
    d.classList.remove('squeezed'); // opens over 2s (CSS)
  };
  const SLOT_OPEN = 2000; // matches the slot's CSS transition
  if (stuck) {
    stuck.w.set(0, 0, 9); // a wobble as it's pulled out of the glass
    sound.glass?.();
    await sleep(350);
    openSlot();
    sound.whoosh?.();
    // Aim at the slot's middle as it opens (it moves while NUKE slides over).
    const at = () => d.getBoundingClientRect();
    physics.sendTo(stuck, {
      x: () => { const r = at(); return r.left + r.width / 2; },
      y: () => { const r = at(); return r.top + r.height / 2; },
      size: m * 0.75, dur: SLOT_OPEN, lift: 60, fade: 450, spin: 26, spiral: Math.min(W, H) * 0.16, onArrive: showD,
    });
    await sleep(SLOT_OPEN);
  } else {
    openSlot();
    sound.whoosh?.();
    await sleep(SLOT_OPEN);
    showD();
  }
  await sleep(2600);

  // ...and the letters flip into cubes, like the opening.
  cubes.forEach((c, i) => setTimeout(() => { c.classList.add('cube-in'); sound.tick?.(0.2); }, i * 120));
  await sleep(cubes.length * 120 + 900);

  // ---------- Aftermath ----------
  const prompt = el('nuke-sub', layer, 'p');
  prompt.textContent = canHover ? 'PRESS ANY KEY TO REBUILD' : 'TAP TO REBUILD';
  await sleep(400);
  await new Promise((resolve) => {
    const go = () => resolve();
    window.addEventListener('keydown', go, { once: true });
    window.addEventListener('pointerdown', go, { once: true });
  });
  location.reload(); // rebuild the world: the opening plays again
}
