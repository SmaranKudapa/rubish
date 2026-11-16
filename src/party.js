// HAPPY BIRTHDAY party (play the tune on the color squares): every cube on
// screen grows lit birthday candles, 3D cakes pop up along the floor, and
// balloons float up from the bottom of the screen to the top.
//  - Candles on the big cubes live in the stage's own 3D scene (they tilt with
//    the cube and cast shadows).
//  - Candles on the RUBISH title cubes and the cakes are drawn on a 3D overlay.
//  - Balloons are flat (DOM), drifting up past everything.
import * as THREE from 'three';
import { PALETTE } from './cube3d.js';

const easeOutBack = (t) => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const rand = (a, b) => a + Math.random() * (b - a);

const PARTY = 13000; // ms before the candles and cakes go away
const CANDLE_COLORS = ['red', 'blue', 'yellow', 'green', 'orange'];
const lam = (c) => new THREE.MeshLambertMaterial({ color: c });

// A striped candle with a wick and a flickering flame, standing on y = 0,
// 1 unit tall (plus the flame). Grows by scaling `grow` (0..1).
function buildCandle(color) {
  const root = new THREE.Group();
  const body = new THREE.Group(); // scaled in y while it grows
  root.add(body);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1, 14), lam(PALETTE[color]));
  stick.position.y = 0.5;
  stick.castShadow = true;
  body.add(stick);
  for (const y of [0.22, 0.5, 0.78]) { // candy stripes
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.09, 14), lam(0xffffff));
    band.position.y = y;
    body.add(band);
  }
  const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.14, 6), lam(0x222222));
  wick.position.y = 1.07;
  body.add(wick);
  const flame = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), new THREE.MeshBasicMaterial({ color: PALETTE.orange }));
  outer.scale.set(0.1, 0.2, 0.1);
  const inner = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff3a0 }));
  inner.scale.set(0.055, 0.12, 0.055);
  inner.position.set(0, -0.03, 0.02);
  flame.add(outer, inner);
  flame.position.y = 1.27;
  root.add(flame);
  const seed = Math.random() * 100;
  return {
    root,
    set(grow, t) {
      body.scale.set(1, Math.max(0.001, grow), 1);
      const lit = clamp01((grow - 0.85) / 0.15);
      const f = 1 + Math.sin(t * 23 + seed) * 0.12 + Math.sin(t * 37 + seed * 2) * 0.08;
      flame.position.y = 0.07 + 1.2 * grow;
      flame.scale.set(lit * (1 - (f - 1) * 0.5), lit * f, lit);
      flame.rotation.z = Math.sin(t * 9 + seed) * 0.12;
    },
  };
}

// A two-tier cake on a plate, radius 1 and about 1.45 tall (plus candles).
const CAKES = [
  { base: 0xf7a8c4, top: 0xfff3d6 }, // strawberry
  { base: 0x7b4a2e, top: 0xf7a8c4 }, // chocolate
  { base: 0x9fe3c4, top: 0xfff3d6 }, // mint
  { base: 0xffe680, top: 0x7b4a2e }, // lemon
];
function buildCake(look, candles) {
  const root = new THREE.Group();
  const add = (geo, color, y, shadow = true) => {
    const m = new THREE.Mesh(geo, lam(color));
    m.position.y = y;
    m.castShadow = shadow;
    root.add(m);
    return m;
  };
  add(new THREE.CylinderGeometry(1.28, 1.2, 0.08, 32), 0xe8e8e8, 0.04); // plate
  add(new THREE.CylinderGeometry(1, 1, 0.7, 32), look.base, 0.43);
  add(new THREE.CylinderGeometry(1.04, 1.04, 0.12, 32), 0xffffff, 0.79); // frosting rim
  for (let i = 0; i < 12; i++) { // drips
    const a = (i / 12) * Math.PI * 2;
    const drip = add(new THREE.SphereGeometry(1, 8, 6), 0xffffff, 0.68);
    drip.scale.set(0.11, 0.17 + (i % 3) * 0.05, 0.11);
    drip.position.set(Math.cos(a) * 1.0, 0.7 - (i % 3) * 0.04, Math.sin(a) * 1.0);
  }
  for (let i = 0; i < 18; i++) { // sprinkles on the lower tier
    const a = Math.random() * Math.PI * 2, r = rand(0.7, 0.95);
    const s = add(new THREE.BoxGeometry(0.1, 0.04, 0.04), PALETTE[CANDLE_COLORS[i % 5]], 0.86, false);
    s.position.set(Math.cos(a) * r, 0.86, Math.sin(a) * r);
    s.rotation.y = Math.random() * Math.PI;
  }
  add(new THREE.CylinderGeometry(0.62, 0.62, 0.5, 28), look.top, 1.1);
  add(new THREE.CylinderGeometry(0.65, 0.65, 0.08, 28), 0xffffff, 1.37);
  const flames = [];
  for (let i = 0; i < candles; i++) {
    const c = buildCandle(CANDLE_COLORS[(i + 2) % 5]);
    const a = (i / candles) * Math.PI * 2 + 0.4;
    c.root.position.set(Math.cos(a) * 0.32, 1.41, Math.sin(a) * 0.32);
    c.root.scale.setScalar(0.5);
    root.add(c.root);
    flames.push(c);
  }
  return { root, candles: flames };
}

// Flat balloons that rise from below the screen to above it.
function releaseBalloons(W) {
  const box = document.createElement('div');
  box.className = 'party-balloons';
  document.body.appendChild(box);
  const n = Math.round(Math.min(26, Math.max(10, W / 60)));
  const colors = ['red', 'orange', 'yellow', 'green', 'blue', 'white'];
  let longest = 0;
  for (let i = 0; i < n; i++) {
    const b = document.createElement('div');
    b.className = 'balloon';
    const dur = rand(6, 9), delay = rand(0, 3.5);
    longest = Math.max(longest, dur + delay);
    b.style.left = `${((i + rand(0.1, 0.9)) / n) * 100}%`;
    b.style.setProperty('--c', PALETTE[colors[i % colors.length]]);
    b.style.setProperty('--w', `${Math.round(rand(38, 62))}px`);
    b.style.setProperty('--dur', `${dur.toFixed(2)}s`);
    b.style.setProperty('--delay', `${delay.toFixed(2)}s`);
    b.style.setProperty('--sway', `${rand(1.8, 3).toFixed(2)}s`);
    b.innerHTML = `<div class="balloon-sway"><div class="balloon-body"></div>
      <svg class="balloon-string" viewBox="0 0 20 80" width="20" height="80"><path d="M10 0 C 2 14, 18 26, 10 40 S 2 66, 10 80" fill="none" stroke="#111" stroke-width="2"/></svg></div>`;
    box.appendChild(b);
  }
  setTimeout(() => box.remove(), (longest + 0.5) * 1000);
}

export function birthdayParty({ stage, physics, sound = {} }) {
  return new Promise((resolve) => {
    const W = innerWidth, H = innerHeight;
    const t0 = performance.now();
    const all = []; // { candle, at (ms it starts growing) }

    // ---- Candles on the big cubes (in the stage's 3D scene) ----
    const AX = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((a) => new THREE.Vector3(...a));
    const onStage = [];
    stage.cubes().forEach((cube, ci) => {
      cube.group.updateMatrixWorld(true);
      const q = cube.group.getWorldQuaternion(new THREE.Quaternion());
      // Whichever face is pointing up right now gets the candles.
      const up = AX.reduce((b, a) => (a.clone().applyQuaternion(q).y > b.clone().applyQuaternion(q).y ? a : b));
      const u = AX.find((a) => Math.abs(a.dot(up)) < 0.5);
      const v = up.clone().cross(u);
      const holder = new THREE.Group();
      holder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
      holder.position.copy(up).multiplyScalar(1.53);
      for (const [k, [a, b]] of [[-0.85, 0.5], [0, -0.55], [0.85, 0.5]].entries()) {
        const c = buildCandle(CANDLE_COLORS[(ci + k) % 5]);
        // Spread across the face (in the holder's own frame: x and z lie on the face).
        const p = u.clone().multiplyScalar(a).add(v.clone().multiplyScalar(b));
        c.root.position.copy(p.applyQuaternion(holder.quaternion.clone().invert()));
        c.root.scale.set(1.15, 1.3, 1.15);
        holder.add(c.root);
        all.push({ candle: c, at: 150 + ci * 160 + k * 130 });
      }
      cube.group.add(holder);
      onStage.push({ cube, holder });
    });

    // ---- 3D overlay: candles on the title cubes, and the cakes ----
    const canvas = document.createElement('canvas');
    canvas.className = 'party-3d';
    document.body.appendChild(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(W, H, false);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(0, W, 0, -H, -3000, 3000);
    const sun = new THREE.DirectionalLight(0xffffff, 1.7);
    sun.position.set(-0.4, 1, 1);
    scene.add(sun, new THREE.AmbientLight(0xffffff, 1.3));

    const minis = [...document.querySelectorAll('.title .mini')];
    const titled = minis.map((mini, i) => {
      const c = buildCandle(CANDLE_COLORS[i % 5]);
      c.root.rotation.x = 0.35; // lean the top toward us a bit so it reads as 3D
      scene.add(c.root);
      all.push({ candle: c, at: 100 + i * 110 });
      return { mini, c };
    });

    const cakeR = Math.min(50, Math.max(24, W * 0.035));
    const floor = physics.floorY(1);
    // Cakes go along the floor on either side of the controls (never on top of
    // the word box or the color squares).
    let uiL = W, uiR = 0;
    for (const id of ['form', 'swatches', 'swatches-bg']) {
      const r = document.getElementById(id)?.getBoundingClientRect();
      if (r && r.width) { uiL = Math.min(uiL, r.left); uiR = Math.max(uiR, r.right); }
    }
    const gap = cakeR * 1.6;
    const spots = [];
    for (const [a, b] of [[0, uiL - gap], [uiR + gap, W]]) {
      const n = Math.floor((b - a) / (cakeR * 4.2));
      for (let i = 0; i < Math.min(n, 3); i++) spots.push(a + ((i + 0.5) / Math.min(n, 3)) * (b - a));
    }
    if (!spots.length) spots.push(cakeR * 1.4, W - cakeR * 1.4); // narrow screens: one in each corner
    const cakes = [];
    spots.forEach((x0, i) => {
      const cake = buildCake(CAKES[i % CAKES.length], 3 + (i % 2));
      const x = x0 + rand(-0.1, 0.1) * cakeR;
      cake.root.position.set(x, -(floor - cakeR * 0.25), 0);
      cake.root.rotation.set(0.42, rand(0, Math.PI * 2), 0);
      scene.add(cake.root);
      const at = 300 + i * 220;
      for (const c of cake.candles) all.push({ candle: c, at: at + 500 });
      cakes.push({ cake, at, popped: false, spin: rand(-0.25, 0.25) });
    });

    setTimeout(() => releaseBalloons(W), 500);

    const frame = (now) => {
      const ms = now - t0, t = ms / 1000;
      // Everything shrinks away together at the end.
      const out = 1 - clamp01((ms - PARTY) / 600);
      for (const { candle, at } of all) {
        const g = clamp01((ms - at) / 700);
        candle.set(Math.max(0.001, easeOutBack(g) * out), t);
      }
      for (const { mini, c } of titled) {
        const r = mini.getBoundingClientRect();
        const gone = mini.classList.contains('gone') || !r.width;
        c.root.visible = !gone;
        if (gone) continue;
        c.root.position.set(r.left + r.width * 0.5, -(r.top + r.height * 0.14), 50);
        c.root.scale.set(r.width * 0.6, r.width * 0.55, r.width * 0.6);
      }
      for (const ck of cakes) {
        const g = clamp01((ms - ck.at) / 650);
        if (g > 0 && !ck.popped) { ck.popped = true; sound.pop?.(); }
        ck.cake.root.scale.setScalar(Math.max(0.0001, easeOutBack(g) * out * cakeR));
        ck.cake.root.rotation.y += ck.spin / 60;
      }
      renderer.render(scene, camera);
      if (ms < PARTY + 650) { requestAnimationFrame(frame); return; }
      for (const { cube, holder } of onStage) cube.group.remove(holder);
      renderer.dispose();
      canvas.remove();
      resolve();
    };
    requestAnimationFrame(frame);
  });
}
