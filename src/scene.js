// Three.js stage: the main cube (draggable, with idle sway, shake and a soft
// shadow on the wall behind it), the celebration spin, and the finale where
// the main cube slides into place and the earlier letters drop in beside it.
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
  key.shadow.radius = 14;
  key.shadow.blurSamples = 20;
  Object.assign(key.shadow.camera, { left: -50, right: 50, top: 32, bottom: -32, near: 0.5, far: 60 });
  scene.add(key, new THREE.AmbientLight(0xffffff, 1.45));

  // Invisible wall behind the cube that only shows shadows.
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(240, 240),
    new THREE.ShadowMaterial({ color: 0x05394f, opacity: 0.32 }),
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
  let word = null; // finale: { group, slots: [{ g, y }], n, amp, start }
  let aspect = 1;

  const targetZ = () => {
    let d = 13.5 / Math.min(1, aspect * 1.1);
    if (word) {
      const half = ((word.n - 1) / 2) * SPACING + 3;
      d = Math.max(d, half / (TAN15 * aspect));
    }
    return d;
  };
  let camZ = 13.5;

  const resize = () => {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    aspect = w / h;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(container);
  resize();
  camZ = targetZ();

  // ---------- Drag to rotate, with inertia and a gentle return home ----------
  const drag = { x: 0, y: 0, vx: 0, vy: 0, active: false, px: 0, py: 0, t: 0, release: 0 };
  container.addEventListener('pointerdown', (e) => {
    drag.active = true;
    drag.px = e.clientX;
    drag.py = e.clientY;
    drag.t = performance.now();
    drag.vx = drag.vy = 0;
    container.setPointerCapture(e.pointerId);
    container.classList.add('dragging');
  });
  container.addEventListener('pointermove', (e) => {
    if (!drag.active) return;
    const now = performance.now();
    const k = 0.009;
    const dx = (e.clientX - drag.px) * k, dy = (e.clientY - drag.py) * k;
    drag.px = e.clientX;
    drag.py = e.clientY;
    drag.y += dx;
    drag.x = clamp(drag.x + dy, -1.25, 1.25);
    const dts = Math.max(8, now - drag.t) / 1000;
    drag.vy = dx / dts;
    drag.vx = dy / dts;
    drag.t = now;
  });
  const endDrag = () => {
    if (!drag.active) return;
    drag.active = false;
    drag.release = performance.now();
    container.classList.remove('dragging');
    if (drag.release - drag.t > 90) drag.vx = drag.vy = 0; // held still before letting go
  };
  container.addEventListener('pointerup', endDrag);
  container.addEventListener('pointercancel', endDrag);

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    const now = performance.now();

    if (!drag.active) {
      drag.y += drag.vy * dt;
      drag.x = clamp(drag.x + drag.vx * dt, -1.25, 1.25);
      const damp = Math.exp(-dt * 3);
      drag.vx *= damp;
      drag.vy *= damp;
      if (now - drag.release > 1400 && Math.abs(drag.vy) < 0.4) {
        drag.y = wrap(drag.y);
        const k = 1 - Math.exp(-dt * 2.4);
        drag.x -= drag.x * k;
        drag.y -= drag.y * k;
      }
    }

    camZ += (targetZ() - camZ) * (1 - Math.exp(-dt * 3));
    camera.position.set(0, 0, camZ);
    camera.lookAt(0, 0, 0);

    const s = fx.shake;
    holder.rotation.set(
      fx.tiltX + drag.x + Math.sin(t * 0.8) * 0.07 * fx.sway + s * Math.sin(t * 41) * 0.06,
      fx.tiltY + drag.y + Math.sin(t * 0.55) * 0.22 * fx.sway + s * Math.sin(t * 33) * 0.07,
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
      word.group.rotation.set(drag.x, drag.y, 0);
      word.slots.forEach((sl, i) => {
        if (!sl) return;
        sl.g.position.y = sl.y + Math.sin(t * 2 + i * 0.7) * 0.22 * word.amp;
        // A spin ripples across the word every few seconds.
        const local = t - word.start - i * 0.15;
        const l = local > 0 ? local % 4.5 : 99;
        sl.g.rotation.y = SLOT_TILT[1] + (l < 1.2 ? easeInOutCubic(l / 1.2) * Math.PI * 2 : 0);
      });
    }

    renderer.render(scene, camera);
  });

  const slotX = (i, n) => (i - (n - 1) / 2) * SPACING;

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

    // The main cube's circle on screen, for confetti to bounce off.
    obstacle() {
      if (!holder.visible || cube.group.parent !== holder) return null;
      const rect = container.getBoundingClientRect();
      const v = holder.getWorldPosition(new THREE.Vector3()).project(camera);
      const pxPerUnit = rect.height / 2 / (camZ * TAN15);
      return {
        x: rect.left + ((v.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - v.y) / 2) * rect.height,
        r: 2.15 * fx.main * fx.scale * pxPerUnit,
      };
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
      // Hand the main cube over to the word.
      const main = new THREE.Group();
      main.position.x = x1;
      main.rotation.set(SLOT_TILT[0], SLOT_TILT[1], 0);
      main.add(cube.group);
      group.add(main);
      word.slots[n - 1] = { g: main, y: 0, main: true };

      const drops = earlier.map((c, i) => {
        castShadows(c.group);
        const g = new THREE.Group();
        g.add(c.group);
        g.position.set(slotX(i, n), 18, 0);
        g.rotation.set(SLOT_TILT[0], SLOT_TILT[1], 0);
        group.add(g);
        const sl = { g, y: 18 };
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
      const fly = Promise.all(w.slots.map((sl, i) => (sl.main ? null
        : wait(i * 60).then(() => tween(520, (e) => { sl.y = 18 * e; }, easeInCubic)))));
      const main = w.slots.find((sl) => sl.main);
      holder.add(cube.group);
      fx.posX = main.g.position.x;
      fx.tiltX = SLOT_TILT[0];
      fx.tiltY = main.g.rotation.y;
      fx.sway = 0;
      main.g.parent.remove(main.g);
      w.slots[w.slots.indexOf(main)] = null;
      const from = { x: fx.posX, ty: wrap(fx.tiltY) };
      await Promise.all([
        fly,
        tween(1000, (e) => {
          fx.posX = from.x * (1 - e);
          fx.tiltX = SLOT_TILT[0] + (HOME_TILT[0] - SLOT_TILT[0]) * e;
          fx.tiltY = from.ty + (HOME_TILT[1] - from.ty) * e;
        }),
      ]);
      scene.remove(w.group);
      word = null;
    },
  };
}
