// Three.js stage: the main cube (draggable, with idle sway and shake), the
// celebration spin, and the finale where every finished letter spells the word.
import * as THREE from 'three';
import { easeInOutCubic, easeOutBack } from './cube3d.js';

const SPACING = 4.4; // distance between cubes in the finale
const easeInCubic = (t) => t * t * t;
const easeInBack = (t) => 2.7 * t * t * t - 1.7 * t * t;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  const key = new THREE.DirectionalLight(0xffffff, 1.9);
  key.position.set(3, 8, 6);
  scene.add(key, new THREE.AmbientLight(0xffffff, 1.5));

  // holder: tilt, drag, sway, shake. cube.group: spins/scales in celebrations.
  const holder = new THREE.Group();
  holder.add(cube.group);
  scene.add(holder);

  const fx = { sway: 1, glow: 0, scale: 1, tiltX: 0.5, tiltY: -0.62, lift: 0, shake: 0, main: 1, mainY: 0 };
  let word = null; // finale: { group, slots: [{ g, y }], start }
  let aspect = 1;

  const targetZ = () => {
    let d = 13.5 / Math.min(1, aspect * 1.1);
    if (word) {
      const half = ((word.slots.length - 1) / 2) * SPACING + 3;
      d = Math.max(d, half / (Math.tan(THREE.MathUtils.degToRad(15)) * aspect));
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
      s * (Math.sin(t * 53) * 0.17 + Math.sin(t * 37.3) * 0.11),
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
        sl.g.position.y = sl.y + Math.sin(t * 2 + i * 0.7) * 0.22;
        // A spin ripples across the word every few seconds.
        const local = t - word.start - i * 0.15;
        const l = local > 0 ? local % 4.5 : 99;
        sl.g.rotation.y = -0.32 + (l < 1.2 ? easeInOutCubic(l / 1.2) * Math.PI * 2 : 0);
      });
    }

    renderer.render(scene, camera);
  });

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

    hasWord: () => !!word,

    // Shrink the main cube away and drop in one cube per finished letter.
    async showWord(cubes) {
      await tween(450, (e) => { fx.main = 1 - e; }, easeInBack);
      fx.main = 0;
      const group = new THREE.Group();
      scene.add(group);
      const n = cubes.length;
      const slots = cubes.map((c, i) => {
        const g = new THREE.Group();
        g.add(c.group);
        g.position.x = (i - (n - 1) / 2) * SPACING;
        g.rotation.x = 0.3;
        group.add(g);
        return { g, y: 16 };
      });
      word = { group, slots, start: Infinity };
      await Promise.all(slots.map((sl, i) =>
        wait(i * 140).then(() => tween(950, (e) => { sl.y = 16 * (1 - e); }, easeOutBack))));
      word.start = clock.elapsedTime + 0.6;
    },

    // Fly the word cubes away and bring the main cube back in from the top.
    async clearWord() {
      if (!word) return;
      const w = word;
      await Promise.all(w.slots.map((sl, i) =>
        wait(i * 70).then(() => tween(520, (e) => { sl.y = 18 * e; }, easeInCubic))));
      scene.remove(w.group);
      word = null;
      fx.mainY = 12;
      fx.main = 1;
      await tween(900, (e) => { fx.mainY = 12 * (1 - e); }, easeOutBack);
      fx.mainY = 0;
    },
  };
}
