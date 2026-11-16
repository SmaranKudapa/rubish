// A cartoon 3D arm that grows out of one of the cubes on stage: a shoulder,
// upper arm, elbow, forearm, a glove cuff and a gloved hand with a pointing
// finger. It reaches over (two-bone IK, elbow bent upward), pokes a button,
// then blows apart into little cubes. Used when someone types MUTE / UNMUTE
// instead of clicking the sound button.
import * as THREE from 'three';
import { PALETTE } from './cube3d.js';

const easeOutBack = (t) => { const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.min(1, Math.max(0, t));

// Three-step toon shading, so it reads like the rest of the retro UI.
function toonRamp() {
  const tex = new THREE.DataTexture(new Uint8Array([95, 95, 95, 255, 175, 175, 175, 255, 255, 255, 255, 255]), 3, 1);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

// from: the shoulder (screen point). to: the button's center.
// color: the sleeve's palette color. onPress: called when the finger hits.
export function robotArm({ from, to, color = 'red', physics, sound = {}, onPress = () => {} }) {
  return new Promise((resolve) => {
    const W = innerWidth, H = innerHeight;
    const canvas = document.createElement('canvas');
    canvas.className = 'arm-3d';
    document.body.appendChild(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(W, H, false);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(0, W, 0, -H, -3000, 3000);
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-0.5, 1, 1.2);
    scene.add(sun, new THREE.AmbientLight(0xffffff, 0.9));

    const ramp = toonRamp();
    const sleeve = new THREE.MeshToonMaterial({ color: PALETTE[color], gradientMap: ramp });
    const glove = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: ramp });
    const ink = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.BackSide });

    // A mesh with a black outline (a slightly bigger, inside-out copy).
    const part = (geo, mat, parent, outline = [1.14, 1.14, 1.14]) => {
      const g = new THREE.Group();
      const m = new THREE.Mesh(geo, mat);
      const o = new THREE.Mesh(geo, ink);
      o.scale.set(...outline);
      g.add(o, m);
      parent.add(g);
      return g;
    };

    // ---- Sizes, all from how far the arm has to reach ----
    const S = { x: from.x, y: from.y };
    const B = { x: to.x, y: to.y };
    const dist = Math.hypot(B.x - S.x, B.y - S.y) || 1;
    const T = Math.min(34, Math.max(14, dist * 0.065)); // arm thickness
    const palmLen = T * 1.35, fingerLen = T * 1.15;
    const reach = palmLen * 0.55 + fingerLen + T * 0.15; // wrist → fingertip
    const ax = (B.x - S.x) / dist, ay = (B.y - S.y) / dist; // approach direction
    const hoverW = { x: B.x - ax * (reach + T * 1.6), y: B.y - ay * (reach + T * 1.6) };
    const pokeW = { x: B.x - ax * (reach - 3), y: B.y - ay * (reach - 3) };
    const Ltot = Math.hypot(hoverW.x - S.x, hoverW.y - S.y) * 1.2 + T;
    const L1 = Ltot * 0.5, L2 = Ltot * 0.5;

    // ---- Meshes ----
    // Tapered like a real arm: thick at the shoulder and elbow, slimmer toward
    // the elbow and the wrist (top of the cylinder = far end).
    const upperGeo = new THREE.CylinderGeometry(0.82, 1, 1, 20, 1, true);
    const foreGeo = new THREE.CylinderGeometry(0.7, 1, 1, 20, 1, true);
    const ball = new THREE.SphereGeometry(1, 20, 14);
    const box = new THREE.BoxGeometry(1, 1, 1);

    const shoulder = part(ball, sleeve, scene);
    const upper = part(upperGeo, sleeve, scene, [1.14, 1, 1.14]);
    const elbow = part(ball, sleeve, scene);
    const fore = part(foreGeo, sleeve, scene, [1.14, 1, 1.14]);

    // The hand: local +x points along the finger, +y is the thumb side, +z the
    // back of the hand.
    const hand = new THREE.Group();
    scene.add(hand);
    const cuff = part(new THREE.CylinderGeometry(1, 1, 1, 20), glove, hand, [1.12, 1.25, 1.12]);
    cuff.rotation.z = -Math.PI / 2;
    cuff.scale.set(T * 0.55, T * 0.45, T * 0.55);
    cuff.position.x = -T * 0.05;
    const palm = part(box, glove, hand, [1.12, 1.12, 1.18]);
    palm.scale.set(palmLen, T * 1.2, T * 0.62);
    palm.position.x = palmLen * 0.55;
    // Pointing finger (index), straight out.
    const index = part(new THREE.CapsuleGeometry(T * 0.2, fingerLen - T * 0.4, 6, 12), glove, hand);
    index.rotation.z = -Math.PI / 2;
    index.position.set(palmLen * 0.95 + fingerLen * 0.5, T * 0.36, T * 0.05);
    // Three curled fingers: knuckles out front, tucked under.
    for (let k = 0; k < 3; k++) {
      const f = part(new THREE.CapsuleGeometry(T * 0.19, T * 0.16, 6, 12), glove, hand);
      f.rotation.set(0, 0.25, -Math.PI / 2);
      f.position.set(palmLen * 1.08, T * (0.08 - k * 0.27), -T * 0.12);
    }
    // Thumb, folded along the side.
    const thumb = part(new THREE.CapsuleGeometry(T * 0.18, T * 0.32, 6, 12), glove, hand);
    thumb.rotation.set(0.5, 0, -1.15);
    thumb.position.set(palmLen * 0.75, T * 0.58, T * 0.18);

    // Place a cylinder between two screen points.
    const span = (g, a, b, r0) => {
      const dx = b.x - a.x, dy = -(b.y - a.y);
      const len = Math.hypot(dx, dy);
      g.position.set((a.x + b.x) / 2, -(a.y + b.y) / 2, 0);
      g.rotation.set(0, 0, Math.atan2(dy, dx) - Math.PI / 2);
      g.scale.set(r0, Math.max(len, 0.001), r0);
    };

    // Two-bone IK: where the elbow goes so the wrist lands on w (bent upward).
    const solve = (w, l1, l2) => {
      const dx = w.x - S.x, dy = w.y - S.y;
      const d = Math.min(Math.max(Math.hypot(dx, dy), Math.abs(l1 - l2) + 0.5), l1 + l2 - 0.5);
      const base = Math.atan2(dy, dx);
      const a = Math.acos(clamp01((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
      const e1 = { x: S.x + Math.cos(base + a) * l1, y: S.y + Math.sin(base + a) * l1 };
      const e2 = { x: S.x + Math.cos(base - a) * l1, y: S.y + Math.sin(base - a) * l1 };
      const e = e1.y < e2.y ? e1 : e2;
      const wl = Math.hypot(w.x - e.x, w.y - e.y) || 1;
      return { e, w: { x: e.x + ((w.x - e.x) / wl) * l2, y: e.y + ((w.y - e.y) / wl) * l2 } };
    };

    // ---- Timeline ----
    const POP = 320, GROW = 1150, HOLD = 250, POKE = 380, AFTER = 480;
    const growAt = 180, pokeAt = growAt + GROW + HOLD, blowAt = pokeAt + POKE + AFTER;
    let pressed = false, blown = false, ticks = 0, last = { e: S, w: S };
    const t0 = performance.now();

    const frame = (now) => {
      const ms = now - t0;
      const pop = easeOutBack(clamp01(ms / POP));
      const g = easeInOut(clamp01((ms - growAt) / GROW));
      // Grows out of the cube: bones lengthen while the wrist sweeps to the button.
      const l1 = L1 * lerp(0.12, 1, g), l2 = L2 * lerp(0.12, 1, g);
      const start = { x: S.x + l1 * 0.9, y: S.y - l1 * 0.6 };
      let w = { x: lerp(start.x, hoverW.x, g), y: lerp(start.y, hoverW.y, g) };
      // A little life while it hovers, then the poke.
      const poke = Math.sin(Math.PI * clamp01((ms - pokeAt) / POKE));
      w = { x: lerp(w.x, pokeW.x, poke), y: lerp(w.y, pokeW.y, poke) };
      w.y += Math.sin(ms / 140) * 2 * g * (1 - poke);
      const { e, w: wr } = solve(w, l1, l2);
      last = { e, w: wr };

      const r = T * 0.5 * Math.max(0.0001, pop);
      shoulder.position.set(S.x, -S.y, 0);
      shoulder.scale.setScalar(T * 0.72 * Math.max(0.0001, pop));
      span(upper, S, e, r * 1.1);
      elbow.position.set(e.x, -e.y, 0);
      elbow.scale.setScalar(r * 0.92);
      span(fore, e, wr, r * 0.92);
      // The hand points at the button (blending in from the forearm's angle).
      const foreAng = Math.atan2(-(wr.y - e.y), wr.x - e.x);
      const btnAng = Math.atan2(-(B.y - wr.y), B.x - wr.x);
      let dA = btnAng - foreAng;
      dA = Math.atan2(Math.sin(dA), Math.cos(dA));
      hand.position.set(wr.x, -wr.y, 4);
      hand.rotation.set(-0.85, 0, foreAng + dA * g, 'ZYX');
      hand.scale.setScalar(Math.max(0.0001, lerp(0.3, 1, g) * pop));

      // Servo ticks while it grows.
      const want = Math.floor(g * 8);
      while (ticks < want) { ticks++; sound.tick?.(0.05 + ticks * 0.02); }
      if (poke > 0.97 && !pressed) { pressed = true; onPress(); }

      renderer.render(scene, camera);

      if (ms >= blowAt && !blown) {
        blown = true;
        // The whole arm bursts into little cubes: sleeve colored along the arm,
        // white for the glove.
        const pieces = [];
        const mid = last.e;
        const quat = () => new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3));
        const add = (x, y, size, c) => pieces.push({ x, y, dx: x - mid.x, dy: y - mid.y - 40, size, quat: quat(), faces: Array(6).fill(c) });
        const along = (a, b, c) => {
          const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / (T * 0.85)));
          for (let i = 0; i <= n; i++) add(lerp(a.x, b.x, i / n), lerp(a.y, b.y, i / n), T * 0.8, c);
        };
        along(S, last.e, color);
        along(last.e, last.w, color);
        const ha = foreAng + dA;
        const tip = { x: last.w.x + Math.cos(ha) * reach, y: last.w.y - Math.sin(ha) * reach };
        along(last.w, tip, 'white');
        add(last.w.x, last.w.y, T, 'white');
        physics.shatter(pieces);
        sound.explode?.();
        renderer.dispose();
        canvas.remove();
        resolve();
        return;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

// A burst around a button: expanding square rings and a floating label.
export function zapButton(btn, label) {
  const r = btn.getBoundingClientRect();
  btn.classList.remove('zap');
  void btn.offsetWidth;
  btn.classList.add('zap');
  ringsAround(r);
  const tag = document.createElement('div');
  tag.className = 'zap-label';
  tag.textContent = label;
  Object.assign(tag.style, { left: `${r.left + r.width / 2}px`, top: `${r.bottom + 10}px` });
  tag.addEventListener('animationend', () => tag.remove());
  document.body.appendChild(tag);
}

// Three square rings bursting out of a rectangle.
export function ringsAround(r, n = 3) {
  for (let i = 0; i < n; i++) {
    const ring = document.createElement('div');
    ring.className = 'zap-ring';
    Object.assign(ring.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, animationDelay: `${i * 0.14}s` });
    ring.addEventListener('animationend', () => ring.remove());
    document.body.appendChild(ring);
  }
}
