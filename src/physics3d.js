// Little 3D cubes with 2D collision physics plus a depth value.
// Depth z is in [-1, 1]; the main cube sits at z = 0. Pieces with z < 0 are
// drawn on a canvas behind the page (so the main cube covers them), z >= 0 on a
// canvas in front. Pieces only collide with neighbours at a similar depth, some
// pieces near z = 0 bounce off the main cube, and farther pieces look smaller
// and land a little higher up the screen, like a floor going back in space.
// Used for confetti (1x1x1 cubes) and for exploding the RUBISH title cubes.
import * as THREE from 'three';
import { PALETTE, COLOR_ORDER } from './cube3d.js';

const GRAVITY = 2300; // px/s^2
const RESTITUTION = 0.32; // piece vs piece
const FLOOR_BOUNCE = 0.72; // the floor is springy: pieces keep bouncing
const SUBSTEPS = 4;
const CELL = 40;
const DEPTH_TOUCH = 0.28; // pieces closer than this in depth can collide

const easeInCubic = (t) => t * t * t;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
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

function layer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const key = new THREE.DirectionalLight(0xffffff, 1.7);
  key.position.set(0.3, 1, 0.8);
  scene.add(key, new THREE.AmbientLight(0xffffff, 1.5));
  return { renderer, scene };
}

// obstacles(): on-screen outlines (convex polygons) of the 3D cubes.
export function createPhysics({ back, front, obstacles = () => [] }) {
  const layers = { back: layer(back), front: layer(front) };
  const camera = new THREE.OrthographicCamera(0, 1, 0, -1, -3000, 3000);

  const mats = { black: new THREE.MeshLambertMaterial({ map: stickerTexture(null) }) };
  for (const c of COLOR_ORDER) mats[c] = new THREE.MeshLambertMaterial({ map: stickerTexture(PALETTE[c]) });
  const box = new THREE.BoxGeometry(1, 1, 1);

  let W = 1, H = 1;
  const resize = () => {
    W = window.innerWidth;
    H = window.innerHeight;
    for (const l of Object.values(layers)) l.renderer.setSize(W, H, false);
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

  const floorOf = (p) => H - 4 - (1 - p.z) * 12; // farther pieces rest higher up
  const depthScale = (z) => 1 + z * 0.3;

  function land(p, now) {
    if (p.landed === null) p.landed = now;
  }

  function add({ x, y, vx, vy, size, faces, z = rand(-1, 1), w, quat, delay = 2000, dur = 900 }) {
    const mesh = new THREE.Mesh(box, faces.map((f) => mats[f]));
    if (quat) mesh.quaternion.copy(quat);
    else mesh.quaternion.setFromEuler(new THREE.Euler(rand(0, 6.3), rand(0, 6.3), rand(0, 6.3)));
    // About half the pieces near the cube's depth bounce off it.
    const hitsCube = Math.abs(z) < 0.5 && Math.random() < 0.85;
    if (hitsCube) z = Math.abs(z);
    (z < 0 ? layers.back : layers.front).scene.add(mesh);
    const s = size * depthScale(z);
    parts.push({
      mesh, x, y, vx, vy, z, hitsCube,
      size: s, size0: s, r: s * 0.5, m: s * s,
      w: w || new THREE.Vector3(rand(-14, 14), rand(-14, 14), rand(-14, 14)),
      landed: null, delay: delay + rand(0, 700), dur, born: performance.now(),
    });
    if (!running) {
      running = true;
      last = performance.now();
      requestAnimationFrame(frame);
    }
  }

  // Circle vs. a cube's on-screen outline (convex polygon, screen coords).
  // Push the piece out through the nearest edge and bounce it. On upward-facing
  // edges (the cube's top) friction is strong, so pieces stick and pile up
  // instead of sliding straight off the slope.
  function collidePoly(p, poly, now) {
    let cx = 0, cy = 0;
    for (const [x, y] of poly) { cx += x; cy += y; }
    cx /= poly.length;
    cy /= poly.length;
    // Quick reject: farther than the polygon's reach.
    let reach = 0;
    for (const [x, y] of poly) reach = Math.max(reach, Math.hypot(x - cx, y - cy));
    if (Math.hypot(p.x - cx, p.y - cy) > reach + p.r) return;

    let inside = true;
    let bestIn = -Infinity, inN = null; // nearest edge when inside
    let bestOut = Infinity, outQ = null; // nearest boundary point when outside
    for (let i = 0; i < poly.length; i++) {
      const [ax, ay] = poly[i];
      const [bx, by] = poly[(i + 1) % poly.length];
      const ex = bx - ax, ey = by - ay;
      const len = Math.hypot(ex, ey) || 1;
      let nx = ey / len, ny = -ex / len;
      if ((ax - cx) * nx + (ay - cy) * ny < 0) { nx = -nx; ny = -ny; } // point outward
      const sd = (p.x - ax) * nx + (p.y - ay) * ny;
      if (sd > 0) inside = false;
      if (sd > bestIn) { bestIn = sd; inN = [nx, ny]; }
      const t = clamp(((p.x - ax) * ex + (p.y - ay) * ey) / (len * len), 0, 1);
      const qx = ax + ex * t, qy = ay + ey * t;
      const d = Math.hypot(p.x - qx, p.y - qy);
      if (d < bestOut) { bestOut = d; outQ = [qx, qy]; }
    }

    let nx, ny, pen;
    if (inside) {
      [nx, ny] = inN;
      pen = p.r - bestIn;
    } else {
      if (bestOut >= p.r) return;
      nx = (p.x - outQ[0]) / (bestOut || 1);
      ny = (p.y - outQ[1]) / (bestOut || 1);
      pen = p.r - bestOut;
    }
    p.x += nx * pen;
    p.y += ny * pen;

    const vn = p.vx * nx + p.vy * ny;
    const top = ny < -0.35; // a surface something can rest on
    if (vn < 0) {
      const e = top && vn > -160 ? 0 : 0.42;
      p.vx -= (1 + e) * vn * nx;
      p.vy -= (1 + e) * vn * ny;
    }
    if (top) {
      // Friction: kill most of the sliding along the surface.
      const tx = -ny, ty = nx;
      const vt = p.vx * tx + p.vy * ty;
      p.vx -= vt * 0.45 * tx;
      p.vy -= vt * 0.45 * ty;
      p.w.multiplyScalar(0.85);
      land(p, now);
    }
  }

  function step(dt, now, obs) {
    for (const p of parts) {
      p.vy += GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const floor = floorOf(p);
      if (p.y + p.r >= floor) {
        p.y = floor - p.r;
        p.vy = p.vy > 70 ? -p.vy * FLOOR_BOUNCE : Math.min(p.vy, 0);
        p.vx *= 0.985;
        // Roll along the floor; damp the other spins.
        p.w.z = -p.vx / Math.max(p.r, 1);
        p.w.x *= 0.92;
        p.w.y *= 0.92;
        land(p, now);
      }
      if (p.x - p.r < 0) { p.x = p.r; p.vx = Math.abs(p.vx) * RESTITUTION; }
      if (p.x + p.r > W) { p.x = W - p.r; p.vx = -Math.abs(p.vx) * RESTITUTION; }

      // Bounce off (or come to rest on) the cubes: static boxes on screen.
      if (p.hitsCube) for (const o of obs) collidePoly(p, o, now);
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
          if (Math.abs(a.z - b.z) > DEPTH_TOUCH) continue;
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
    const obs = obstacles();
    for (let i = 0; i < SUBSTEPS; i++) step(dt / SUBSTEPS, now, obs);

    for (const p of parts) {
      if (p.landed !== null) {
        const k = (now - p.landed - p.delay) / p.dur;
        if (k > 0) {
          p.size = p.size0 * (1 - easeInCubic(Math.min(1, k)));
          p.r = p.size * 0.5;
        }
      }
      const speed = p.w.length();
      if (speed > 1e-4) {
        axis.copy(p.w).divideScalar(speed);
        dq.setFromAxisAngle(axis, speed * dt);
        p.mesh.quaternion.premultiply(dq);
      }
      p.mesh.position.set(p.x, -p.y, p.z * 100);
      p.mesh.scale.setScalar(Math.max(p.size, 0.001));
    }
    parts = parts.filter((p) => {
      const keep = p.size > 0.4 && now - p.born < 16000;
      if (!keep) p.mesh.parent.remove(p.mesh);
      return keep;
    });

    for (const l of Object.values(layers)) l.renderer.render(l.scene, camera);
    if (parts.length) requestAnimationFrame(frame);
    else running = false;
  }

  return {
    // Celebration: 1x1x1 cubes (a different color on every face) rain down from
    // above the top of the page in random directions and speeds, spread over
    // about a second so it falls like a shower. Some land on the cubes.
    confetti(count = 120) {
      for (let i = 0; i < count; i++) {
        setTimeout(() => add({
          x: rand(0, W), y: rand(-80, -15),
          vx: rand(-420, 420), vy: rand(-150, 650),
          size: rand(11, 16), faces: shuffle([...COLOR_ORDER]),
        }), rand(0, 900));
      }
    },

    // Pieces of a 3D cube that was zoomed apart until it broke: each flies out
    // from the cube's center, keeping its stickers and orientation.
    shatter(pieces) {
      for (const pc of pieces) {
        const len = Math.hypot(pc.dx, pc.dy) || 1;
        const power = rand(450, 950);
        add({
          x: pc.x, y: pc.y,
          vx: (pc.dx / len) * power + rand(-90, 90),
          vy: (pc.dy / len) * power - rand(300, 650),
          z: rand(-0.6, 0.6),
          size: pc.size, faces: pc.faces, quat: pc.quat,
          w: new THREE.Vector3(rand(-10, 10), rand(-10, 10), rand(-10, 10)),
          delay: 2600, dur: 1500,
        });
      }
    },

    // Blow a cube of the given on-screen size into its 26 cubies.
    explode(cx, cy, size, rx = 0.31, ry = 0.42) {
      const tilt = new THREE.Euler(rx, ry, 0);
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
          z: rand(-0.6, 0.6),
          size: c * 0.97, faces, quat,
          w: new THREE.Vector3(rand(-9, 9), rand(-9, 9), rand(-9, 9)),
          delay: 2600, dur: 1500,
        });
      }
    },
  };
}
