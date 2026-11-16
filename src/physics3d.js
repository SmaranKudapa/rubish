// Full-screen overlay of little 3D cubes with 2D collision physics.
// Used for confetti (1x1x1 cubes) and for exploding the RUBISH title cubes.
// Pieces fall, bounce off each other and the floor, pile up, and after a
// delay on the ground shrink smoothly away.
import * as THREE from 'three';
import { PALETTE, COLOR_ORDER } from './cube3d.js';

const GRAVITY = 2300; // px/s^2
const RESTITUTION = 0.32;
const SUBSTEPS = 4;
const CELL = 40;

const easeInCubic = (t) => t * t * t;
const rand = (a, b) => a + Math.random() * (b - a);
const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Black plastic square with a colored sticker inset, like a real cubie face.
function stickerTexture(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#111';
  g.fillRect(0, 0, 64, 64);
  if (color) {
    g.fillStyle = color;
    g.beginPath();
    g.roundRect(6, 6, 52, 52, 5);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function createPhysics(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 1, 0, -1, -3000, 3000);
  const key = new THREE.DirectionalLight(0xffffff, 1.7);
  key.position.set(0.3, 1, 0.8);
  scene.add(key, new THREE.AmbientLight(0xffffff, 1.5));

  const mats = { black: new THREE.MeshLambertMaterial({ map: stickerTexture(null) }) };
  for (const c of COLOR_ORDER) mats[c] = new THREE.MeshLambertMaterial({ map: stickerTexture(PALETTE[c]) });
  const box = new THREE.BoxGeometry(1, 1, 1);

  let W = 1, H = 1;
  const resize = () => {
    W = window.innerWidth;
    H = window.innerHeight;
    renderer.setSize(W, H, false);
    camera.right = W;
    camera.bottom = -H;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  let parts = [];
  let running = false;
  let last = 0;
  const axis = new THREE.Vector3();
  const dq = new THREE.Quaternion();

  function land(p, now) {
    if (p.landed === null) p.landed = now;
  }

  function add({ x, y, vx, vy, size, faces, w, quat, delay = 2000, dur = 900 }) {
    const mesh = new THREE.Mesh(box, faces.map((f) => mats[f]));
    if (quat) mesh.quaternion.copy(quat);
    else mesh.quaternion.setFromEuler(new THREE.Euler(rand(0, 6.3), rand(0, 6.3), rand(0, 6.3)));
    scene.add(mesh);
    parts.push({
      mesh, x, y, vx, vy, size, size0: size, r: size * 0.5, m: size * size,
      w: w || new THREE.Vector3(rand(-14, 14), rand(-14, 14), rand(-14, 14)),
      landed: null, delay: delay + rand(0, 700), dur, born: performance.now(),
    });
    if (!running) {
      running = true;
      last = performance.now();
      requestAnimationFrame(frame);
    }
  }

  function step(dt, now) {
    for (const p of parts) {
      p.vy += GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.y + p.r >= H) {
        p.y = H - p.r;
        p.vy = p.vy > 90 ? -p.vy * RESTITUTION : Math.min(p.vy, 0);
        p.vx *= 0.985;
        // Roll along the floor; damp the other spins.
        p.w.z = -p.vx / Math.max(p.r, 1);
        p.w.x *= 0.92;
        p.w.y *= 0.92;
        land(p, now);
      }
      if (p.x - p.r < 0) { p.x = p.r; p.vx = Math.abs(p.vx) * RESTITUTION; }
      if (p.x + p.r > W) { p.x = W - p.r; p.vx = -Math.abs(p.vx) * RESTITUTION; }
    }

    const grid = new Map();
    parts.forEach((p, i) => {
      const k = Math.floor(p.x / CELL) * 100003 + Math.floor(p.y / CELL);
      const list = grid.get(k);
      if (list) list.push(i);
      else grid.set(k, [i]);
    });
    for (let i = 0; i < parts.length; i++) {
      const a = parts[i];
      const cx = Math.floor(a.x / CELL), cy = Math.floor(a.y / CELL);
      for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) {
        const list = grid.get(gx * 100003 + gy);
        if (!list) continue;
        for (const j of list) {
          if (j <= i) continue;
          const b = parts[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const R = a.r + b.r;
          const d2 = dx * dx + dy * dy;
          if (d2 >= R * R || d2 === 0) continue;
          const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
          const ia = 1 / a.m, ib = 1 / b.m;
          const s = (R - d) / (ia + ib);
          a.x -= nx * s * ia; a.y -= ny * s * ia;
          b.x += nx * s * ib; b.y += ny * s * ib;
          const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rv < 0) {
            const jn = (-(1 + RESTITUTION) * rv) / (ia + ib);
            a.vx -= jn * nx * ia; a.vy -= jn * ny * ia;
            b.vx += jn * nx * ib; b.vy += jn * ny * ib;
            // A little friction so piles settle instead of sliding forever.
            const tx = -ny, ty = nx;
            const rt = (b.vx - a.vx) * tx + (b.vy - a.vy) * ty;
            const jt = (-rt * 0.15) / (ia + ib);
            a.vx -= jt * tx * ia; a.vy -= jt * ty * ia;
            b.vx += jt * tx * ib; b.vy += jt * ty * ib;
          }
          if (a.landed !== null) land(b, now);
          if (b.landed !== null) land(a, now);
        }
      }
    }
  }

  function frame(t) {
    const dt = Math.min(0.033, (t - last) / 1000);
    last = t;
    const now = performance.now();
    for (let i = 0; i < SUBSTEPS; i++) step(dt / SUBSTEPS, now);

    for (const p of parts) {
      if (p.landed !== null) {
        const k = (now - p.landed - p.delay) / p.dur;
        if (k > 0) {
          const s = 1 - easeInCubic(Math.min(1, k));
          p.size = p.size0 * s;
          p.r = p.size * 0.5;
        }
      }
      const speed = p.w.length();
      if (speed > 1e-4) {
        axis.copy(p.w).divideScalar(speed);
        dq.setFromAxisAngle(axis, speed * dt);
        p.mesh.quaternion.premultiply(dq);
      }
      p.mesh.position.set(p.x, -p.y, 0);
      p.mesh.scale.setScalar(Math.max(p.size, 0.001));
    }
    parts = parts.filter((p) => {
      const keep = p.size > 0.4 && now - p.born < 16000;
      if (!keep) scene.remove(p.mesh);
      return keep;
    });

    renderer.render(scene, camera);
    if (parts.length) requestAnimationFrame(frame);
    else running = false;
  }

  return {
    // Celebration: 1x1x1 cubes (a different color on every face) burst from a
    // point, with extra cannons from the bottom corners.
    confetti(x, y, count = 90, cannons = true) {
      for (let i = 0; i < count; i++) {
        add({
          x: x + rand(-30, 30), y: y + rand(-20, 20),
          vx: rand(-650, 650), vy: rand(-1350, -500),
          size: rand(11, 16), faces: shuffle([...COLOR_ORDER]),
        });
      }
      if (!cannons) return;
      for (let i = 0; i < count * 0.6; i++) {
        const left = i % 2 === 0;
        add({
          x: left ? 10 : W - 10, y: H * 0.8,
          vx: (left ? 1 : -1) * rand(350, 950), vy: rand(-1500, -850),
          size: rand(11, 16), faces: shuffle([...COLOR_ORDER]),
        });
      }
    },

    // Blow a cube of the given on-screen size into its 26 cubies.
    explode(cx, cy, size, tilt = new THREE.Euler(0.31, 0.42, 0)) {
      const c = size / 3;
      const quat = new THREE.Quaternion().setFromEuler(tilt);
      const v = new THREE.Vector3();
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
        if (!i && !j && !k) continue;
        v.set(i, j, k).multiplyScalar(c).applyQuaternion(quat);
        // BoxGeometry face order: +x, -x, +y, -y, +z, -z
        const out = [i === 1, i === -1, j === 1, j === -1, k === 1, k === -1];
        const faces = out.map((o) => (o ? COLOR_ORDER[Math.floor(Math.random() * 6)] : 'black'));
        const len = Math.hypot(v.x, v.y) || 1;
        const power = rand(380, 820);
        add({
          x: cx + v.x, y: cy - v.y,
          vx: (v.x / len) * power + rand(-80, 80),
          vy: (-v.y / len) * power - rand(250, 550),
          size: c * 0.97, faces, quat,
          w: new THREE.Vector3(rand(-9, 9), rand(-9, 9), rand(-9, 9)),
          delay: 2600, dur: 1500,
        });
      }
    },
  };
}
