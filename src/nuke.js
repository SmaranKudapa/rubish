// The NUKE easter egg (type NUKE and submit; the word box locks).
//
//  0.0s  a little launcher rises out of the floor
//  1.2s  a 3D missile launches and flies, at one steady speed, along a single
//        smooth arc to the achievement button (10s total). The screen warms to
//        red, the alarm wails and the page shakes harder as it gets close.
// 10.0s  impact on the button: flash, full red world, every cube explodes, the
//        UI falls apart and a slow, animated mushroom cloud rises behind it
//        all. "NUKE" lifts out of the word box to the middle of the screen,
//        gains a D, and the letters flip into cubes. Then "press any key".
import * as THREE from 'three';
import { PALETTE } from './cube3d.js';
import { buildCube } from './title.js';

const TOTAL = 22000; // launch to impact (it takes its time)
const LAUNCH = 1200; // the launcher's rise before the missile fires
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const lerp = (a, b, t) => a + (b - a) * t;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Pixel launcher ----------
const COLORS = { k: '#111111', d: '#3d4a3a', g: '#6b7a63', l: '#9aa58f', y: PALETTE.yellow };
const LAUNCHER = [
  '....kkkkkkkk....',
  '...kllllllllk...',
  '..kkkkkkkkkkkk..',
  '..kdk......kdk..',
  'kkkkkkkkkkkkkkkk',
  'kykkykkykkykkykk',
  'kkykkykkykkykkyk',
  'kgggggggggggggdk',
  'kgdddgggggdddgdk',
  'kkkkkkkkkkkkkkkk',
];
function spriteFromRows(rows) {
  const w = Math.max(...rows.map((r) => r.length));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = rows.length;
  const g = c.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (!COLORS[ch]) return;
    g.fillStyle = COLORS[ch];
    g.fillRect(x, y, 1, 1);
  }));
  return { url: c.toDataURL(), w, h: rows.length };
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

// ---------- The flight path: loops around the screen, travelled at constant speed ----------
function cubic(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
}

// Points: straight up out of the launcher, two big wobbly spiral loops around
// the middle of the screen (stalling for suspense), then a swoop onto the target.
function flightPoints(W, H, start, target) {
  const pts = [];
  const cx = W * 0.5, cy = H * 0.46;
  const rx = Math.max(cx - start[0], W * 0.25), ry = H * 0.3;
  const loopStart = [cx - rx, cy];
  for (let i = 0; i <= 40; i++) pts.push(cubic(start, [start[0], lerp(start[1], cy, 0.6)], [loopStart[0], cy + ry * 0.3], loopStart, i / 40));
  // Loops: from the left-most point, clockwise on screen, two turns, slowly
  // tightening, with a little wobble so it never looks mechanical.
  const turns = 2;
  const N = 600;
  for (let i = 1; i <= N; i++) {
    const k = i / N;
    const a = Math.PI + k * turns * Math.PI * 2;
    const shrink = 1 - 0.32 * k;
    const wob = 1 + 0.08 * Math.sin(k * Math.PI * 9);
    pts.push([cx + Math.cos(a) * rx * shrink * wob, cy - Math.sin(a) * ry * shrink * wob]);
  }
  // Swoop: up over the top and down onto the target.
  const last = pts[pts.length - 1];
  for (let i = 1; i <= 120; i++) {
    pts.push(cubic(last, [last[0], last[1] - ry * 1.1], [lerp(last[0], target[0], 0.6), Math.max(10, target[1] - H * 0.12)], target, i / 120));
  }
  return pts;
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
const CLOUD_RAMP = [[0.82, [255, 246, 200]], [0.64, [255, 213, 0]], [0.46, [255, 88, 0]], [0.28, [196, 30, 58]], [0.14, [110, 22, 22]], [-1, [70, 52, 52]]];

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

  // Launcher (pixel art) on the floor.
  const floorTop = physics.floorY(0);
  const ls = spriteFromRows(LAUNCHER);
  const LS = 4;
  const launcher = el('nuke-sprite', layer, 'img');
  launcher.src = ls.url;
  launcher.alt = '';
  const lw = ls.w * LS, lh = ls.h * LS;
  Object.assign(launcher.style, { width: `${lw}px`, height: `${lh}px` });
  const lx = W * 0.18, ly = floorTop - lh / 2 + 6;

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
  const basePx = 64; // on-screen length at launch

  // The path: straight up out of the launcher, one smooth arc, down onto the button.
  const tr = target.getBoundingClientRect();
  const tx = tr.left + tr.width / 2, ty = tr.top + tr.height / 2;
  const path = constantSpeed(flightPoints(W, H, [lx, ly - lh / 2], [tx, ty]));

  const panelish = [document.querySelector('.title'), document.querySelector('.panel')];
  sound.siren?.(TOTAL / 1000);
  let launched = false;

  // ---------- The flight ----------
  await new Promise((resolve) => {
    const t0 = performance.now();
    const frame = (now) => {
      const ms = now - t0;
      const t = ms / 1000;

      // Launcher rises out of the floor.
      const up = easeInOut(clamp01(ms / LAUNCH));
      launcher.style.transform = `translate(${lx - lw / 2}px, ${ly - lh / 2 + (1 - up) * 80}px)`;

      if (ms >= LAUNCH) {
        if (!launched) {
          launched = true;
          missile.root.visible = true;
          sound.launch?.();
        }
        // Same speed the whole way: position is a straight fraction of the path length.
        const f = (ms - LAUNCH) / (TOTAL - LAUNCH);
        const p = path(f);
        const px = basePx * (1 + 0.6 * f); // a little bigger as it nears the front
        missile.root.position.set(p.x, -p.y, 0);
        missile.root.scale.setScalar(px / LEN);
        missile.root.rotation.z = Math.atan2(-p.dy, p.dx) - Math.PI / 2;
        missile.spin.rotation.y = t * 2.2;
        missile.flame.scale.set(1, 0.8 + Math.random() * 0.5, 1);
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

      if (ms < TOTAL) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });

  // ---------- Impact on the button ----------
  onImpact();
  sound.nukeBoom?.();
  renderer.dispose();
  canvas.remove();
  launcher.remove();
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
  input.value = '';
  input.placeholder = '';

  // Every cube blows up; debris rains down.
  stage.shatterAll();
  title.explodeAll();
  physics.confetti(160);
  setTimeout(() => {
    const p = physics.pickPiece();
    if (!p) return; // no debris, no crack
    const cx2 = W * (0.25 + Math.random() * 0.5), cy2 = H * (0.2 + Math.random() * 0.4);
    physics.sendTo(p, {
      x: cx2, y: cy2, size: Math.min(W, H) * 0.22, dur: 750, lift: 0, fade: 450,
      onArrive: () => { crackScreen(cx2, cy2); sound.glass?.(); },
    });
  }, 1500);

  // Bits of the UI shake loose and fall, at random.
  for (const n of panelish) if (n) { n.style.transform = ''; n.classList.add('quake'); }
  for (const node of uiEls) {
    if (!node || !node.isConnected || node === target) continue;
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
  const CLOUD_SLOW = 4; // 4x slower than real time
  const animateCloud = (now) => {
    paint((now - cloudStart) / 1000 / CLOUD_SLOW);
    if (back.isConnected) requestAnimationFrame(animateCloud);
  };
  requestAnimationFrame(animateCloud);

  // "NUKE" floats out of the word box to the middle of the screen as plain text.
  const looks = [['N', 'white', 'red'], ['U', 'white', 'orange'], ['K', 'white', 'yellow'], ['E', 'white', 'red'], ['D', 'white', 'orange']];
  const word = el('title intro nuke-word instant', layer);
  const cubes = looks.map((look, i) => buildCube(data, look, i).mini);
  for (const c of cubes.slice(0, 4)) { c.classList.add('letter-in'); word.appendChild(c); }
  const m = cubes[0].offsetWidth;
  const s0 = boxFont / (m * 0.9);
  const centerY = H * 0.44;
  word.style.top = `${centerY}px`;
  word.style.transform = `translate(-50%, -50%) translate(${box.left + box.width / 2 - W / 2}px, ${box.top + box.height / 2 - centerY}px) scale(${s0})`;
  requestAnimationFrame(() => word.classList.remove('instant')); // from here on, slow transitions
  await sleep(700);
  for (const n of panelish) if (n) n.classList.remove('quake');
  stage.fx.shake = 0.35;
  word.style.transition = 'transform 8.5s cubic-bezier(0.65, 0, 0.35, 1)';
  word.style.transform = 'translate(-50%, -50%) scale(1)';
  sound.whoosh?.();
  await sleep(1800);
  stage.fx.shake = 0;
  await sleep(6900);

  // ...gains a D: its slot opens slowly so NUKE slides over, then it fades in...
  const d = cubes[4];
  d.classList.add('squeezed');
  word.appendChild(d);
  void d.offsetWidth;
  d.classList.remove('squeezed');
  sound.whoosh?.();
  await sleep(1600);
  d.classList.add('letter-in');
  sound.blip?.(5);
  await sleep(2800);

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
