// HAPPY BIRTHDAY party (play the start of the tune on the color squares):
// every cube on screen grows lit retro candles, and pixel balloons float up
// from the bottom of the screen to the top.
//  - Candles are blocky voxels with black edges and a stepped, flickering
//    voxel flame. They stay put until their cube explodes; then each one is
//    flung off whole, tumbling like a ragdoll, and only breaks into pieces
//    when it hits the floor. The candles on the big cubes also go when a new
//    word is started.
//  - Candles on the big cubes live in the stage's own 3D scene (they tilt with
//    the cube and cast shadows); the ones on the RUBISH title cubes are drawn
//    on a 3D overlay that follows each title cube.
//  - Balloons are flat pixel art.
import * as THREE from 'three';
import { PALETTE } from './cube3d.js';

const clamp01 = (t) => Math.min(1, Math.max(0, t));
const rand = (a, b) => a + Math.random() * (b - a);
const CANDLE_COLORS = ['red', 'blue', 'yellow', 'green', 'orange'];
const UP = new THREE.Vector3(0, 1, 0);

// ---------- Retro voxel candle ----------
// Stands on y = 0, 1 unit tall plus the flame. set(grow, t) grows it in
// chunky steps and flickers the flame at a low, game-like frame rate.
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const edgeGeo = new THREE.EdgesGeometry(boxGeo);
const inkLine = new THREE.LineBasicMaterial({ color: 0x111111 });
const mats = {};
const lam = (c) => (mats[c] ||= new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
const glow = (c) => (mats[`g${c}`] ||= new THREE.MeshBasicMaterial({ color: c }));

function voxel(parent, mat, [sx, sy, sz], [x, y, z], edges = true, shadow = true) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(boxGeo, mat);
  m.castShadow = shadow;
  g.add(m);
  if (edges) g.add(new THREE.LineSegments(edgeGeo, inkLine));
  g.scale.set(sx, sy, sz);
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

function buildCandle(colorName) {
  const root = new THREE.Group();
  const body = new THREE.Group(); // grows in y
  root.add(body);
  const W = 0.24;
  voxel(body, lam(PALETTE[colorName]), [W, 1, W], [0, 0.5, 0]);
  for (const y of [0.3, 0.7]) voxel(body, lam(0xffffff), [W + 0.02, 0.1, W + 0.02], [0, y, 0], false);
  voxel(body, lam(0x222222), [0.06, 0.12, 0.06], [0, 1.06, 0], false, false); // wick
  // Voxel flame: an orange block, a yellow one, a pale tip.
  const flame = new THREE.Group();
  const f1 = voxel(flame, glow(PALETTE.orange), [0.2, 0.2, 0.2], [0, 0.1, 0], false, false);
  const f2 = voxel(flame, glow(PALETTE.yellow), [0.13, 0.15, 0.13], [0, 0.24, 0], false, false);
  const f3 = voxel(flame, glow(0xfff6c8), [0.07, 0.09, 0.07], [0, 0.35, 0], false, false);
  root.add(flame);
  const seed = Math.floor(Math.random() * 1000);
  return {
    root,
    color: colorName,
    set(grow, t) {
      const g = Math.ceil(clamp01(grow) * 6) / 6; // chunky steps
      body.scale.set(1, Math.max(0.001, g), 1);
      flame.position.y = 1.12 * g;
      flame.visible = g >= 1;
      // A new flame "frame" 8 times a second.
      const frame = Math.floor(t * 8) + seed;
      const j = (k) => (((frame * 9301 + k * 49297) % 233280) / 233280 - 0.5);
      f2.position.x = j(1) * 0.06;
      f3.position.x = j(2) * 0.1;
      f3.position.y = 0.35 + j(3) * 0.06;
      f1.scale.y = 0.2 + j(4) * 0.06;
    },
  };
}

// ---------- Retro pixel balloons ----------
const balloonArt = {};
function balloonURL(colorName) {
  if (balloonArt[colorName]) return balloonArt[colorName];
  const Wp = 14, Hp = 30, cx = 6.5, cy = 7, rx = 6.3, ry = 7.4;
  const c = document.createElement('canvas');
  c.width = Wp;
  c.height = Hp;
  const g = c.getContext('2d');
  const inside = (x, y) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
  const base = PALETTE[colorName];
  const n = parseInt(base.slice(1), 16);
  const shade = `rgb(${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * 0.72)).join(',')})`;
  const put = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  for (let y = 0; y < 16; y++) for (let x = 0; x < Wp; x++) {
    if (!inside(x, y)) continue;
    const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
    if (edge) put(x, y, '#111');
    else if ((x === 3 && y >= 3 && y <= 5) || (x === 4 && y === 3)) put(x, y, '#ffffff');
    else if (x - cx + (y - cy) * 0.8 > 4.2) put(x, y, shade);
    else put(x, y, base);
  }
  // Knot right under the balloon's lowest row, then a wiggly string hanging
  // from the knot (no gaps between them).
  let bottom = 0;
  for (let y = 0; y < 16; y++) if (inside(6, y) || inside(7, y)) bottom = y;
  put(6, bottom + 1, '#111'); put(7, bottom + 1, '#111');
  for (let x = 5; x <= 8; x++) put(x, bottom + 2, '#111');
  const wig = [0, 0, 1, 1, 1, 0, 0, -1, -1, -1, 0, 0, 1];
  let prevX = 7;
  wig.forEach((d, i) => {
    const x = 7 + d, y = bottom + 3 + i;
    if (y >= Hp) return;
    if (x !== prevX) put(prevX, y, '#111'); // join diagonal steps so the line never breaks
    put(x, y, '#111');
    prevX = x;
  });
  return (balloonArt[colorName] = c.toDataURL('image/png'));
}

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
    const px = Math.round(rand(3, 5)); // size of one balloon pixel
    b.style.left = `${((i + rand(0.1, 0.9)) / n) * 100}%`;
    b.style.setProperty('--dur', `${dur.toFixed(2)}s`);
    b.style.setProperty('--delay', `${delay.toFixed(2)}s`);
    b.style.setProperty('--sway', `${rand(1.6, 2.6).toFixed(2)}s`);
    const img = document.createElement('img');
    img.src = balloonURL(colors[i % colors.length]);
    img.alt = '';
    img.width = 14 * px;
    img.height = 30 * px;
    b.appendChild(img);
    box.appendChild(b);
  }
  setTimeout(() => box.remove(), (longest + 0.5) * 1000);
}

// ---------- The party ----------
export function createParty({ stage, physics, sound = {} }) {
  const onStage = []; // { cube, holder, candles: [{ c, at }], leaving: null | ms }
  const onTitle = []; // { mini, c, at }
  const flying = []; // candles thrown off an exploding cube (on the overlay)
  let overlay = null;
  let running = false;
  let lastFrame = 0;
  const t0 = performance.now();

  function ensureOverlay() {
    if (overlay) return overlay;
    const W = innerWidth, H = innerHeight;
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
    const resize = () => {
      renderer.setSize(innerWidth, innerHeight, false);
      Object.assign(camera, { right: innerWidth, bottom: -innerHeight });
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', resize);
    overlay = { canvas, renderer, scene, camera, resize };
    return overlay;
  }
  function dropOverlay() {
    if (!overlay) return;
    window.removeEventListener('resize', overlay.resize);
    overlay.renderer.dispose();
    overlay.canvas.remove();
    overlay = null;
  }

  // Breaking apart on impact: a couple of blocks of the candle's color and a
  // flame block, scattering along the floor like the rest of the debris.
  const pieces = [];
  const quat = () => new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(0, 3), rand(0, 3), rand(0, 3)));
  function breakApart(base, top, size, color, hitX) {
    for (const [k, c] of [[0.25, color], [0.7, color], [1.05, 'yellow']]) {
      const x = base[0] + (top[0] - base[0]) * k, y = base[1] + (top[1] - base[1]) * k;
      const side = x - hitX || rand(-1, 1);
      pieces.push({ x, y, dx: side, dy: -Math.abs(side) * 0.4, size: size * (c === 'yellow' ? 0.8 : 1), quat: quat(), faces: Array(6).fill(c) });
    }
  }
  const flush = () => { if (pieces.length) physics.shatter(pieces.splice(0)); };

  // Fling a whole candle (already on the overlay, scaled to its on-screen
  // size) off from base->top, away from the explosion at (cx, cy).
  function fling(c, base, top, cx, cy, tilt = 0) {
    const dx = top[0] - base[0], dy = top[1] - base[1];
    const len = Math.hypot(dx, dy) || 1;
    const mid = [(base[0] + top[0]) / 2, (base[1] + top[1]) / 2];
    let ox = mid[0] - cx, oy = mid[1] - cy;
    const ol = Math.hypot(ox, oy) || 1;
    ox /= ol; oy /= ol;
    const power = rand(350, 650);
    flying.push({
      c, len, tilt, x: mid[0], y: mid[1],
      vx: ox * power + rand(-120, 120), vy: oy * power - rand(450, 750),
      a: Math.atan2(dx, -dy), w: rand(5, 11) * (Math.random() < 0.5 ? -1 : 1),
      yaw: 0, wy: rand(-6, 6), born: performance.now(),
    });
  }

  const frame = (now) => {
    const ms = now - t0, t = ms / 1000;

    // Candles on the big cubes.
    for (let i = onStage.length - 1; i >= 0; i--) {
      const s = onStage[i];
      const cube = s.cube;
      if (cube.exploding || !cube.group.visible) {
        // The cube blew up: its candles go flying with the rest of it.
        const center = stage.toScreen(cube.group.getWorldPosition(new THREE.Vector3()));
        for (const { c } of s.candles) {
          // Where it was and how big, as of the last frame the cube was whole
          // (the stage resets a zoomed cube's size right after it bursts).
          const b = c.lastB || c.root.getWorldPosition(new THREE.Vector3());
          const top = c.lastTop || c.root.localToWorld(new THREE.Vector3(0, 1, 0));
          const sb = stage.toScreen(b), st = stage.toScreen(top);
          // The same candle, redrawn on the overlay at its on-screen size.
          const side = stage.toScreen(b.clone().add(new THREE.Vector3(1, 0, 0)));
          const k = Math.hypot(side[0] - sb[0], side[1] - sb[1]); // px per world unit here
          // Its real size in the world, including how far the cube was zoomed up.
          const ws = c.lastWS || c.root.getWorldScale(new THREE.Vector3());
          const nc = buildCandle(c.color);
          nc.root.scale.set(ws.x * k, ws.y * k, ws.z * k);
          nc.root.rotation.order = 'ZYX';
          nc.set(1, t);
          ensureOverlay().scene.add(nc.root);
          const dx = st[0] - sb[0], dy = st[1] - sb[1];
          const dl = Math.hypot(dx, dy) || 1;
          fling(nc, sb, [sb[0] + (dx / dl) * ws.y * k, sb[1] + (dy / dl) * ws.y * k], center[0], center[1]);
        }
        cube.group.remove(s.holder);
        onStage.splice(i, 1);
        continue;
      }
      // Leaving (a new word): shrink away in a few chunky steps.
      const out = s.leaving === null ? 1 : 1 - Math.ceil(clamp01((ms - s.leaving) / 400) * 4) / 4;
      for (const { c, at } of s.candles) {
        c.set(clamp01((ms - at) / 700) * out, t);
        // Remember where it is and how big (zooming the cube scales it up), in
        // case the cube bursts before the next frame.
        c.root.updateMatrixWorld(true);
        c.lastB = c.root.getWorldPosition(c.lastB || new THREE.Vector3());
        c.lastTop = c.root.localToWorld((c.lastTop || new THREE.Vector3()).set(0, 1, 0));
        c.lastWS = c.root.getWorldScale(c.lastWS || new THREE.Vector3());
      }
      if (out <= 0) { cube.group.remove(s.holder); onStage.splice(i, 1); }
    }

    // Candles on the title cubes.
    for (let i = onTitle.length - 1; i >= 0; i--) {
      const s = onTitle[i];
      const r = s.mini.getBoundingClientRect();
      const base = [r.left + r.width * 0.5, r.top + r.height * 0.14];
      if (s.mini.classList.contains('gone') || !s.mini.isConnected) {
        const h = s.c.root.scale.y; // its on-screen length
        s.c.root.rotation.order = 'ZYX';
        if (h > 1) fling(s.c, base, [base[0], base[1] - h], base[0] + rand(-8, 8), base[1] + h * 0.8, 0.35);
        else overlay?.scene.remove(s.c.root);
        onTitle.splice(i, 1);
        continue;
      }
      s.c.root.position.set(base[0], -base[1], 50);
      s.c.root.scale.set(r.width * 0.6, r.width * 0.55, r.width * 0.6);
      s.c.set(clamp01((ms - s.at) / 700), t);
    }
    // Flung candles: one rigid, tumbling piece under gravity, bouncing off the
    // sides of the screen, until it hits the floor; then it breaks apart.
    const dt = Math.min(0.033, (now - (lastFrame || now)) / 1000);
    lastFrame = now;
    const floorY = physics.floorY(0.5);
    for (let i = flying.length - 1; i >= 0; i--) {
      const f = flying[i];
      f.vy += 2300 * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.a += f.w * dt;
      f.yaw += f.wy * dt;
      if ((f.x < 0 && f.vx < 0) || (f.x > innerWidth && f.vx > 0)) { f.vx *= -0.7; f.w *= -1; }
      const ux = Math.sin(f.a), uy = -Math.cos(f.a); // base -> top
      const base = [f.x - (ux * f.len) / 2, f.y - (uy * f.len) / 2];
      const top = [f.x + (ux * f.len) / 2, f.y + (uy * f.len) / 2];
      f.c.root.position.set(base[0], -base[1], 60);
      f.c.root.rotation.set(f.tilt, f.yaw, -f.a);
      f.c.set(1, t);
      if ((Math.max(base[1], top[1]) >= floorY && f.vy > 0) || now - f.born > 6000) {
        breakApart(base, top, Math.max(5, f.len * 0.24), f.c.color, base[1] > top[1] ? base[0] : top[0]);
        sound.thud?.();
        overlay?.scene.remove(f.c.root);
        flying.splice(i, 1);
      }
    }
    flush();

    if (overlay) overlay.renderer.render(overlay.scene, overlay.camera);
    if (!onTitle.length && !flying.length) dropOverlay();
    if (onStage.length || onTitle.length || flying.length) requestAnimationFrame(frame);
    else { running = false; lastFrame = 0; }
  };
  const run = () => { if (!running) { running = true; requestAnimationFrame(frame); } };

  return {
    // Light candles on every cube that doesn't have them yet, and let the
    // balloons go.
    light() {
      const now = performance.now() - t0;
      const AX = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((a) => new THREE.Vector3(...a));
      stage.cubes().forEach((cube, ci) => {
        if (onStage.some((s) => s.cube === cube)) return;
        cube.group.updateMatrixWorld(true);
        const q = cube.group.getWorldQuaternion(new THREE.Quaternion());
        const wy = (a) => a.clone().applyQuaternion(q).y;
        const up = AX.reduce((b, a) => (wy(a) > wy(b) ? a : b)); // the face pointing up
        const u = AX.find((a) => Math.abs(a.dot(up)) < 0.5);
        const v = up.clone().cross(u);
        const holder = new THREE.Group();
        holder.quaternion.setFromUnitVectors(UP, up);
        holder.position.copy(up).multiplyScalar(1.53);
        const back = holder.quaternion.clone().invert();
        const candles = [[-0.85, 0.5], [0, -0.55], [0.85, 0.5]].map(([a, b], k) => {
          const c = buildCandle(CANDLE_COLORS[(ci + k) % 5]);
          c.root.position.copy(u.clone().multiplyScalar(a).add(v.clone().multiplyScalar(b)).applyQuaternion(back));
          c.root.scale.set(1.1, 1.3, 1.1);
          c.set(0, 0);
          holder.add(c.root);
          return { c, at: now + 150 + ci * 160 + k * 130 };
        });
        cube.group.add(holder);
        onStage.push({ cube, holder, candles, leaving: null });
      });
      [...document.querySelectorAll('.title .mini')].forEach((mini, i) => {
        if (mini.classList.contains('gone') || onTitle.some((s) => s.mini === mini)) return;
        const c = buildCandle(CANDLE_COLORS[i % 5]);
        c.root.rotation.x = 0.35; // lean the top toward us a bit so it reads as 3D
        c.set(0, 0);
        ensureOverlay().scene.add(c.root);
        onTitle.push({ mini, c, at: now + 100 + i * 110 });
      });
      setTimeout(() => releaseBalloons(innerWidth), 300);
      run();
    },
    // A new word is starting: the candles on the big cubes go away.
    clearStage() {
      const now = performance.now() - t0;
      for (const s of onStage) if (s.leaving === null) s.leaving = now;
    },
  };
}
