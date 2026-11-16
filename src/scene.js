// Three.js stage: the main cube (idle sway, shake, a soft shadow on the wall
// behind it), the celebration spin, and the finale where the main cube slides
// into place and the earlier letters drop in beside it. Every cube can be
// dragged around on its own.
import * as THREE from 'three';
import { easeInOutCubic, easeOutBack } from './cube3d.js';

const SPACING = 4.4; // distance between cubes in the finale
const SLOT_TILT = [0.3, -0.32]; // x/y tilt of each cube in the finale
const HOME_TILT = [0.5, -0.62]; // x/y tilt of the main cube normally
const TAN15 = Math.tan(THREE.MathUtils.degToRad(15));
const easeInCubic = (t) => t * t * t;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const castShadows = (obj) => obj.traverse((m) => { if (m.isMesh) m.castShadow = true; });
const CUBE_HALF = 1.52; // half the cube's edge in world units (3 cubies at 1.03 spacing)

// Convex hull of 2D points (monotone chain).
function hull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

export function tween(duration, fn, ease = easeInOutCubic) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / duration);
      fn(ease(t), t);
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

// Per-cube drag rotation with inertia and a gentle return home.
function makeDrag() {
  return { x: 0, y: 0, vx: 0, vy: 0, release: 0, t: 0 };
}
function settleDrag(d, dt, now, active) {
  if (active) return;
  d.y += d.vy * dt;
  d.x = clamp(d.x + d.vx * dt, -1.25, 1.25);
  const damp = Math.exp(-dt * 3);
  d.vx *= damp;
  d.vy *= damp;
  if (now - d.release > 1400 && Math.abs(d.vy) < 0.4) {
    d.y = wrap(d.y);
    const k = 1 - Math.exp(-dt * 2.4);
    d.x -= d.x * k;
    d.y -= d.y * k;
  }
}

export function createStage(container, cube) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);

  // Key light from the upper left, casting a soft shadow down-right onto the wall.
  const key = new THREE.DirectionalLight(0xffffff, 1.8);
  key.position.set(-2.5, 4, 14);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 9;
  key.shadow.blurSamples = 20;
  Object.assign(key.shadow.camera, { left: -50, right: 50, top: 32, bottom: -32, near: 0.5, far: 60 });
  scene.add(key, new THREE.AmbientLight(0xffffff, 1.45));

  // Invisible wall behind the cube that only shows shadows.
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(240, 240),
    new THREE.ShadowMaterial({ color: 0x032a3b, opacity: 0.5 }),
  );
  wall.position.z = -3.8;
  wall.receiveShadow = true;
  scene.add(wall);

  // holder: position, tilt, drag, sway, shake. cube.group: celebration spin/scale.
  const holder = new THREE.Group();
  holder.add(cube.group);
  castShadows(cube.group);
  scene.add(holder);

  const fx = {
    sway: 1, glow: 0, scale: 1, lift: 0, shake: 0, main: 1, mainY: 0, posX: 0,
    tiltX: HOME_TILT[0], tiltY: HOME_TILT[1],
  };
  let mainDrag = makeDrag();
  let word = null; // finale: { group, slots: [{ g, y, drag, main? }], n, amp, start }
  let aspect = 1;
  let camZ = 13.5;

  const targetZ = () => {
    let d = 13.5 / Math.min(1, aspect * 1.1);
    if (word) {
      const half = ((word.n - 1) / 2) * SPACING + 3;
      d = Math.max(d, half / (TAN15 * aspect));
    }
    return d;
  };

  const clock = new THREE.Clock();
  const render = () => renderer.render(scene, camera);

  const resize = () => {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    aspect = w / h;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    // Resizing clears the canvas after this frame was drawn; redraw right away
    // so the cube never blinks out while the stage animates its size.
    render();
  };
  new ResizeObserver(resize).observe(container);
  resize();
  camZ = targetZ();

  // ---------- Dragging: whichever cube is under the pointer ----------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let dragging = null; // the drag state being moved
  let px = 0, py = 0;

  function pickDrag(e) {
    const rect = container.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const targets = [holder, ...(word ? word.slots.filter(Boolean).map((s) => s.g) : [])];
    const hit = raycaster.intersectObjects(targets, true)[0];
    if (hit) {
      for (let o = hit.object; o; o = o.parent) {
        if (o === holder) return mainDrag;
        const slot = word?.slots.find((s) => s && s.g === o);
        if (slot) return slot.drag;
      }
    }
    // Missed: on the plain stage, grabbing anywhere spins the main cube.
    return word ? null : mainDrag;
  }

  container.addEventListener('pointerdown', (e) => {
    dragging = pickDrag(e);
    if (!dragging) return;
    px = e.clientX;
    py = e.clientY;
    dragging.t = performance.now();
    dragging.vx = dragging.vy = 0;
    container.setPointerCapture(e.pointerId);
    container.classList.add('dragging');
  });
  container.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const d = dragging;
    const now = performance.now();
    const k = 0.009;
    const dx = (e.clientX - px) * k, dy = (e.clientY - py) * k;
    px = e.clientX;
    py = e.clientY;
    d.y += dx;
    d.x = clamp(d.x + dy, -1.25, 1.25);
    const dts = Math.max(8, now - d.t) / 1000;
    d.vy = dx / dts;
    d.vx = dy / dts;
    d.t = now;
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging.release = performance.now();
    if (dragging.release - dragging.t > 90) dragging.vx = dragging.vy = 0; // held still before letting go
    dragging = null;
    container.classList.remove('dragging');
  };
  container.addEventListener('pointerup', endDrag);
  container.addEventListener('pointercancel', endDrag);

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    const now = performance.now();

    settleDrag(mainDrag, dt, now, dragging === mainDrag);
    if (word) for (const sl of word.slots) if (sl) settleDrag(sl.drag, dt, now, dragging === sl.drag);

    camZ += (targetZ() - camZ) * (1 - Math.exp(-dt * 3));
    camera.position.set(0, 0, camZ);
    camera.lookAt(0, 0, 0);

    const s = fx.shake;
    const md = mainDrag;
    holder.rotation.set(
      fx.tiltX + md.x + Math.sin(t * 0.8) * 0.07 * fx.sway + s * Math.sin(t * 41) * 0.06,
      fx.tiltY + md.y + Math.sin(t * 0.55) * 0.22 * fx.sway + s * Math.sin(t * 33) * 0.07,
      s * (Math.sin(t * 47) * 0.08 + Math.sin(t * 29) * 0.05),
    );
    holder.position.set(
      fx.posX + s * (Math.sin(t * 53) * 0.17 + Math.sin(t * 37.3) * 0.11),
      Math.sin(t * 1.3) * 0.14 * fx.sway + fx.lift + fx.mainY + s * Math.sin(t * 61) * 0.13,
      0,
    );
    holder.scale.setScalar(Math.max(fx.main, 0.0001));
    holder.visible = fx.main > 0.001;
    cube.group.scale.setScalar(fx.scale);
    for (const m of Object.values(cube.materials)) m.emissiveIntensity = fx.glow;

    if (word) {
      word.slots.forEach((sl, i) => {
        if (!sl) return;
        sl.g.position.y = sl.y + Math.sin(t * 2 + i * 0.7) * 0.22 * word.amp;
        // A spin ripples across the word every few seconds.
        const local = t - word.start - i * 0.15;
        const l = local > 0 ? local % 4.5 : 99;
        const spin = l < 1.2 ? easeInOutCubic(l / 1.2) * Math.PI * 2 : 0;
        sl.g.rotation.set(SLOT_TILT[0] + sl.drag.x, SLOT_TILT[1] + sl.drag.y + spin, 0);
      });
    }

    render();
  });

  const slotX = (i, n) => (i - (n - 1) / 2) * SPACING;
  const v = new THREE.Vector3();

  return {
    fx,
    setSway: (to, ms = 800) => { const from = fx.sway; return tween(ms, (e) => { fx.sway = from + (to - from) * e; }); },
    setShake: (to, ms = 600) => { const from = fx.shake; return tween(ms, (e) => { fx.shake = from + (to - from) * e; }); },
    pop: () => tween(420, (_, t) => { fx.scale = 1 + Math.sin(Math.PI * t) * 0.06; }, (t) => t),
    async celebrate() {
      await Promise.all([
        tween(1500, (e) => { cube.group.rotation.y = e * Math.PI * 2; }),
        tween(1500, (_, t) => {
          fx.scale = 1 + Math.sin(Math.PI * t) * 0.16;
          fx.lift = Math.sin(Math.PI * t) * 0.6;
          fx.glow = Math.sin(Math.PI * t) * 0.5;
        }, (t) => t),
      ]);
      cube.group.rotation.y = 0;
      Object.assign(fx, { scale: 1, lift: 0, glow: 0 });
    },

    // The exact on-screen outline of every visible cube (the convex hull of its
    // 8 projected corners, as drawn in the last frame), for confetti to hit.
    obstacles() {
      const rect = container.getBoundingClientRect();
      const groups = [];
      if (holder.visible && cube.group.parent === holder) groups.push(cube.group);
      if (word) for (const sl of word.slots) if (sl) groups.push(sl.g.children[0]);
      return groups.map((g) => {
        const pts = [];
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
          v.set(sx, sy, sz).multiplyScalar(CUBE_HALF).applyMatrix4(g.matrixWorld).project(camera);
          pts.push([rect.left + ((v.x + 1) / 2) * rect.width, rect.top + ((1 - v.y) / 2) * rect.height]);
        }
        return hull(pts);
      });
    },

    hasWord: () => !!word,

    // Slide the main cube (showing the last letter) into its place at the end of
    // the word, then drop the earlier letters in one by one.
    async showWord(earlier) {
      const n = earlier.length + 1;
      const group = new THREE.Group();
      scene.add(group);
      word = { group, slots: Array(n).fill(null), n, amp: 0, start: Infinity };

      const sway0 = fx.sway;
      const x1 = slotX(n - 1, n);
      await tween(1100, (e) => {
        fx.posX = x1 * e;
        fx.tiltX = HOME_TILT[0] + (SLOT_TILT[0] - HOME_TILT[0]) * e;
        fx.tiltY = HOME_TILT[1] + (SLOT_TILT[1] - HOME_TILT[1]) * e;
        fx.sway = sway0 * (1 - e);
      });
      // Hand the main cube (and its drag state) over to the word.
      const main = new THREE.Group();
      main.position.x = x1;
      main.add(cube.group);
      group.add(main);
      word.slots[n - 1] = { g: main, y: 0, drag: mainDrag, main: true };
      mainDrag = makeDrag();

      const drops = earlier.map((c, i) => {
        castShadows(c.group);
        const g = new THREE.Group();
        g.add(c.group);
        g.position.set(slotX(i, n), 18, 0);
        g.rotation.set(SLOT_TILT[0], SLOT_TILT[1], 0);
        group.add(g);
        const sl = { g, y: 18, drag: makeDrag() };
        word.slots[i] = sl;
        return wait(i * 260).then(() => tween(950, (e) => { sl.y = 18 * (1 - e); }, easeOutBack));
      });
      await Promise.all(drops);
      tween(800, (e) => { word.amp = e; });
      word.start = clock.elapsedTime + 0.8;
    },

    // Fly the earlier letters away and slide the main cube back to the middle.
    async clearWord() {
      if (!word) return;
      const w = word;
      const main = w.slots.find((sl) => sl && sl.main);
      const fly = Promise.all(w.slots.map((sl, i) => (!sl || sl.main ? null
        : wait(i * 60).then(() => tween(520, (e) => { sl.y = 18 * e; }, easeInCubic)))));
      // Take the main cube back, keeping exactly where it is right now.
      holder.add(cube.group);
      mainDrag = main.drag;
      fx.posX = main.g.position.x;
      fx.mainY = main.g.position.y;
      fx.tiltX = main.g.rotation.x - mainDrag.x;
      fx.tiltY = main.g.rotation.y - mainDrag.y;
      fx.sway = 0;
      main.g.parent.remove(main.g);
      w.slots[w.slots.indexOf(main)] = null;
      const from = { x: fx.posX, y: fx.mainY, tx: fx.tiltX, ty: wrap(fx.tiltY) };
      await Promise.all([
        fly,
        tween(1000, (e) => {
          fx.posX = from.x * (1 - e);
          fx.mainY = from.y * (1 - e);
          fx.tiltX = from.tx + (HOME_TILT[0] - from.tx) * e;
          fx.tiltY = from.ty + (HOME_TILT[1] - from.ty) * e;
        }),
      ]);
      scene.remove(w.group);
      word = null;
    },
  };
}
