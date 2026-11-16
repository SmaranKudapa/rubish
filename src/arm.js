// A cartoon 3D arm that grows out of one of the cubes on stage: a shoulder,
// upper arm, elbow, forearm, a glove cuff and a gloved hand with a pointing
// finger. It reaches over (two-bone IK, elbow bent downward), pokes a button,
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

// Lives in the cubes' own 3D world (same camera, lights and shadows), so it has
// real depth. Its shoulder sits on the center piece of the cube's right face
// and follows the cube as it sways. The elbow bends downward.
// stage: the 3D stage. cube: the cube it grows from. to: the button's center
// (screen point). onPress: called when the finger hits.
export function robotArm({ stage, cube, to, physics, sound = {}, onPress = () => {} }) {
  return new Promise((resolve) => {
    const { scene, camera, canvas } = stage.three;
    const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

    // ---- The face center pointing most to the right (on screen) ----
    cube.group.updateMatrixWorld(true);
    const gq = cube.group.getWorldQuaternion(new THREE.Quaternion());
    let center = null, best = -Infinity;
    for (const c of cube.cubies) {
      const p = c.position;
      if ([p.x, p.y, p.z].filter((k) => Math.abs(k) > 0.1).length !== 1) continue;
      const n = p.clone().normalize().applyQuaternion(gq);
      if (n.x > best) { best = n.x; center = c; }
    }
    const localN = center.position.clone().normalize();
    const sticker = center.children.find((ch) => ch.userData.normal);
    const sleeveName = sticker?.userData.color || 'red';
    const gloveName = sleeveName === 'white' ? 'yellow' : 'white';
    // Where the shoulder is right now (the cube keeps swaying).
    const shoulderAt = () => cube.group.localToWorld(localN.clone().multiplyScalar(1.03 + 0.5));
    const normalNow = () => localN.clone().applyQuaternion(cube.group.getWorldQuaternion(new THREE.Quaternion()));

    // ---- The button, as a point in the 3D world a little in front of the cubes ----
    const ray = stage.rayAt(to.x, to.y);
    const B = ray.at((2.2 - ray.origin.z) / ray.direction.z, V());

    const ramp = toonRamp();
    const sleeve = new THREE.MeshToonMaterial({ color: PALETTE[sleeveName], gradientMap: ramp });
    const glove = new THREE.MeshToonMaterial({ color: PALETTE[gloveName], gradientMap: ramp });
    const dark = new THREE.MeshToonMaterial({ color: 0x222222, gradientMap: ramp });
    const ink = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.BackSide });
    const mats = [sleeve, glove, dark, ink];
    const root = new THREE.Group();
    scene.add(root);
    const geos = [];
    // A mesh with a black outline (a slightly bigger, inside-out copy).
    const part = (geo, mat, parent, outline = [1.1, 1.1, 1.1]) => {
      geos.push(geo);
      const g = new THREE.Group();
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      const o = new THREE.Mesh(geo, ink);
      o.scale.set(...outline);
      g.add(o, m);
      parent.add(g);
      return g;
    };

    // ---- Sizes (world units; a cubie is 1) ----
    const S0 = shoulderAt();
    const dist = S0.distanceTo(B);
    const T = Math.min(0.6, Math.max(0.36, dist * 0.06)); // arm thickness
    const palmLen = T * 1.35, fingerLen = T * 1.15;
    const reach = palmLen + fingerLen * 0.95; // wrist → fingertip
    const Lsum = Math.max(dist - reach, T * 4) * 1.12 + T; // a bit more than needed, so it bends
    const L1 = Lsum * 0.5, L2 = Lsum * 0.5;

    // ---- Meshes ----
    const upperGeo = new THREE.CylinderGeometry(0.82, 1, 1, 20, 1, true); // slimmer toward the elbow
    const foreGeo = new THREE.CylinderGeometry(0.7, 1, 1, 20, 1, true); // slimmer toward the wrist
    const ball = new THREE.SphereGeometry(1, 20, 14);
    const box = new THREE.BoxGeometry(1, 1, 1);
    const socket = part(new THREE.CylinderGeometry(1, 1, 1, 24), dark, root, [1.06, 1.3, 1.06]);
    const shoulder = part(ball, sleeve, root);
    const upper = part(upperGeo, sleeve, root, [1.1, 1, 1.1]);
    const elbow = part(ball, sleeve, root);
    const fore = part(foreGeo, sleeve, root, [1.1, 1, 1.1]);

    // The hand: local +x along the finger, +y the thumb side, +z the back.
    const hand = new THREE.Group();
    root.add(hand);
    const cuff = part(new THREE.CylinderGeometry(1, 1, 1, 20), glove, hand, [1.1, 1.2, 1.1]);
    cuff.rotation.z = -Math.PI / 2;
    cuff.scale.set(T * 0.55, T * 0.45, T * 0.55);
    cuff.position.x = -T * 0.05;
    const palm = part(box, glove, hand, [1.1, 1.1, 1.16]);
    palm.scale.set(palmLen, T * 1.2, T * 0.62);
    palm.position.x = palmLen * 0.55;
    const index = part(new THREE.CapsuleGeometry(T * 0.2, fingerLen - T * 0.4, 6, 12), glove, hand);
    index.rotation.z = -Math.PI / 2;
    index.position.set(palmLen * 0.95 + fingerLen * 0.5, T * 0.36, T * 0.05);
    for (let k = 0; k < 3; k++) { // curled fingers, knuckles out front
      const f = part(new THREE.CapsuleGeometry(T * 0.19, T * 0.16, 6, 12), glove, hand);
      f.rotation.set(0, 0.25, -Math.PI / 2);
      f.position.set(palmLen * 1.08, T * (0.08 - k * 0.27), -T * 0.12);
    }
    const thumb = part(new THREE.CapsuleGeometry(T * 0.18, T * 0.32, 6, 12), glove, hand);
    thumb.rotation.set(0.5, 0, -1.15);
    thumb.position.set(palmLen * 0.75, T * 0.58, T * 0.18);

    const Y = V(0, 1, 0);
    // Stretch a (unit, y-up) cylinder from a to b.
    const span = (g, a, b, r) => {
      const d = b.clone().sub(a);
      const len = Math.max(d.length(), 1e-4);
      g.position.copy(a).add(b).multiplyScalar(0.5);
      g.quaternion.setFromUnitVectors(Y, d.divideScalar(len));
      g.scale.set(r, len, r);
    };

    // Two-bone IK: the elbow goes down (and a little toward the viewer).
    const POLE = V(0, -1, 0.45).normalize();
    const solve = (S, w, l1, l2) => {
      const toW = w.clone().sub(S);
      const raw = toW.length() || 1e-4;
      const dir = toW.divideScalar(raw);
      const d = Math.min(Math.max(raw, Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3);
      const bend = POLE.clone().addScaledVector(dir, -POLE.dot(dir)).normalize();
      const a = (l1 * l1 + d * d - l2 * l2) / (2 * d);
      const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
      const e = S.clone().addScaledVector(dir, a).addScaledVector(bend, h);
      const wr = e.clone().add(w.clone().sub(e).normalize().multiplyScalar(l2));
      return { e, w: wr };
    };

    // ---- Timeline ----
    const POP = 320, GROW = 1150, HOLD = 250, POKE = 380, AFTER = 480;
    const growAt = 180, pokeAt = growAt + GROW + HOLD, blowAt = pokeAt + POKE + AFTER;
    let pressed = false, ticks = 0, last = null;
    const prevZ = canvas.style.zIndex;
    canvas.style.zIndex = '1000'; // the arm draws over all of the UI (buttons, achievement toast) while it's out
    stage.fx.armHold = true; // no spin ripples on the word while it's attached
    const t0 = performance.now();
    const m4 = new THREE.Matrix4();

    const frame = (now) => {
      const ms = now - t0;
      const pop = Math.max(0.0001, easeOutBack(clamp01(ms / POP)));
      const g = easeInOut(clamp01((ms - growAt) / GROW));
      const S = shoulderAt(), n = normalNow();
      const dir = B.clone().sub(S).normalize();
      const hoverW = B.clone().addScaledVector(dir, -(reach + T * 1.4));
      const pokeW = B.clone().addScaledVector(dir, -(reach - 0.04));
      // Grows out of the face: bones lengthen while the wrist sweeps from
      // straight out of the face over to the button.
      const l1 = L1 * lerp(0.12, 1, g), l2 = L2 * lerp(0.12, 1, g);
      const start = S.clone().addScaledVector(n, (l1 + l2) * 0.8);
      const poke = Math.sin(Math.PI * clamp01((ms - pokeAt) / POKE));
      const w = start.lerp(hoverW, g).lerp(pokeW, poke);
      w.y += Math.sin(ms / 140) * 0.03 * g * (1 - poke);
      const { e, w: wr } = solve(S, w, l1, l2);

      const r = T * 0.5 * pop;
      socket.position.copy(S).addScaledVector(n, -0.02);
      socket.quaternion.setFromUnitVectors(Y, n);
      socket.scale.set(T * 0.75 * pop, 0.05, T * 0.75 * pop);
      shoulder.position.copy(S);
      shoulder.scale.setScalar(T * 0.62 * pop);
      span(upper, S, e, r * 1.1);
      elbow.position.copy(e);
      elbow.scale.setScalar(r * 0.92);
      span(fore, e, wr, r * 0.92);
      // The hand turns from the forearm's line to point at the button, back of
      // the hand up and turned a little toward the viewer.
      const foreDir = wr.clone().sub(e).normalize();
      const fwd = foreDir.clone().lerp(B.clone().sub(wr).normalize(), g).normalize();
      const up = V(0, 1, 0.8);
      const back = up.clone().addScaledVector(fwd, -up.dot(fwd)).normalize();
      const side = back.clone().cross(fwd);
      hand.quaternion.setFromRotationMatrix(m4.makeBasis(fwd, side, back));
      hand.position.copy(wr);
      hand.scale.setScalar(Math.max(0.0001, lerp(0.3, 1, g) * pop));
      last = { S, e, w: wr, fwd };

      const want = Math.floor(g * 8);
      while (ticks < want) { ticks++; sound.tick?.(0.05 + ticks * 0.02); }
      if (poke > 0.97 && !pressed) { pressed = true; onPress(); }

      if (ms < blowAt) { requestAnimationFrame(frame); return; }

      // ---- Burst into little cubes (screen-space physics pieces) ----
      const pieces = [];
      const mid = stage.toScreen(last.e);
      const quat = () => new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3));
      const add = (p, c, k = 0.85) => {
        const [x, y] = stage.toScreen(p);
        const [x2, y2] = stage.toScreen(p.clone().add(V(T, 0, 0)));
        pieces.push({ x, y, dx: x - mid[0], dy: y - mid[1] - 40, size: Math.hypot(x2 - x, y2 - y) * k, quat: quat(), faces: Array(6).fill(c) });
      };
      const along = (a, b, c) => {
        const k = Math.max(1, Math.round(a.distanceTo(b) / (T * 0.85)));
        for (let i = 0; i <= k; i++) add(a.clone().lerp(b, i / k), c);
      };
      along(last.S, last.e, sleeveName);
      along(last.e, last.w, sleeveName);
      along(last.w, last.w.clone().addScaledVector(last.fwd, reach), gloveName);
      add(last.w, gloveName, 1.1);
      physics.shatter(pieces);
      sound.explode?.();
      scene.remove(root);
      for (const gg of geos) gg.dispose();
      for (const mm of mats) mm.dispose();
      ramp.dispose();
      canvas.style.zIndex = prevZ;
      stage.fx.armHold = false;
      resolve();
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

// Square rings bursting out of a rectangle.
export function ringsAround(r, n = 3) {
  for (let i = 0; i < n; i++) {
    const ring = document.createElement('div');
    ring.className = 'zap-ring';
    Object.assign(ring.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, animationDelay: `${i * 0.14}s` });
    ring.addEventListener('animationend', () => ring.remove());
    document.body.appendChild(ring);
  }
}
