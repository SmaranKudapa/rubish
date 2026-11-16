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

const EXPLODE_AT = 1.6; // spread beyond this blows the cube apart

// onShatter(pieces): called with every cubie of a cube that zoomed apart too far.
// sound: optional { thud, whoosh } effects.
export function createStage(container, cube, { onShatter = () => {}, sound = {} } = {}) {
  // Phones and tablets: render a bit lighter so it stays smooth.
  const touch = !matchMedia('(hover: hover) and (pointer: fine)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, touch ? 1.5 : 2));
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
  key.shadow.mapSize.set(touch ? 1024 : 2048, touch ? 1024 : 2048);
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
      const half = (((word.view ?? word.n) - 1) / 2) * SPACING + 3;
      d = Math.max(d, half / (TAN15 * aspect));
    }
    return d;
  };

  const clock = new THREE.Clock();
  const render = () => renderer.render(scene, camera);

  // The canvas covers the whole window (above the page, clicks pass through)
  // so an expanded cube can spill over the UI. The projection is set up so
  // the stage area still shows exactly the normal 30° view: the rest of the
  // window is just extra picture around it.
  let view = { left: 0, top: 0, width: 1, height: 1 };
  function updateProjection() {
    const r = container.getBoundingClientRect();
    if (!r.width || !r.height) return;
    view = r;
    aspect = r.width / r.height;
    const W = window.innerWidth, H = window.innerHeight;
    const n = camera.near;
    const t0 = n * TAN15;
    const px = (2 * t0) / r.height; // near-plane units per screen pixel
    camera.projectionMatrix.makePerspective(
      -t0 * aspect - r.left * px, t0 * aspect + (W - r.right) * px,
      t0 + r.top * px, -t0 - (H - r.bottom) * px, n, camera.far,
    );
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }

  // World-space edges of the window at the cube's depth, for camera distance z.
  function screenEdges(z) {
    const halfH = z * TAN15;
    const ppu = view.height / (2 * halfH); // pixels per world unit
    return {
      left: -halfH * aspect - view.left / ppu,
      right: halfH * aspect + (window.innerWidth - view.right) / ppu,
      top: halfH + view.top / ppu,
      bottom: -halfH - (window.innerHeight - view.bottom) / ppu,
    };
  }

  const toScreen = (p) => [((p.x + 1) / 2) * window.innerWidth, ((1 - p.y) / 2) * window.innerHeight];

  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    updateProjection();
    render(); // a resize clears the canvas; redraw right away so nothing blinks
  };
  window.addEventListener('resize', resize);
  new ResizeObserver(() => { updateProjection(); render(); }).observe(container);
  resize();
  camZ = targetZ();

  // ---------- Dragging: whichever cube is under the pointer ----------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let dragging = null; // the drag state being moved
  let px = 0, py = 0;

  // Every cube on stage: { cube, group (spins/scales), drag, slot? }.
  const mainTarget = () => ({ cube, group: cube.group, drag: mainDrag, slot: null });
  const allTargets = () => {
    const out = [];
    if (cube.group.parent === holder) out.push(mainTarget());
    if (word) for (const sl of word.slots) if (sl) out.push({ cube: sl.cube, group: sl.cube.group, drag: sl.drag, slot: sl });
    return out;
  };

  // The cube under the pointer. On the plain stage, anywhere counts as the main cube.
  function pickTarget(clientX, clientY) {
    ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const list = allTargets().filter((t) => t.group.visible);
    const hit = raycaster.intersectObjects(list.map((t) => t.group), true)[0];
    if (hit) {
      for (let o = hit.object; o; o = o.parent) {
        const t = list.find((x) => x.group === o);
        if (t) return t;
      }
    }
    return word || cube.group.parent !== holder ? null : mainTarget();
  }

  // ---------- Zoom out on a cube: its pieces spread apart, then it blows up ----------
  function zoomSpread(t, amount) {
    const c = t.cube;
    if (c.exploding || !t.group.visible) return;
    c.spread = Math.max(0, c.spread + amount);
    c.spreadT = performance.now();
    if (c.spread > EXPLODE_AT) shatter(t);
  }

  // One zoom gesture sticks to the cube it started on, so sliding off it (or
  // into the gap between word cubes) mid-gesture doesn't lose the progress.
  let wheelTarget = null, wheelT = 0;
  container.addEventListener('wheel', (e) => {
    e.preventDefault(); // never scroll or zoom the page from over the cubes
    const now = performance.now();
    const keep = wheelTarget && now - wheelT < 450 && !wheelTarget.cube.exploding && wheelTarget.group.visible;
    const t = keep ? wheelTarget : pickTarget(e.clientX, e.clientY);
    if (!t) return;
    wheelTarget = t;
    wheelT = now;
    // Wheel deltas come in pixels, lines or pages depending on the browser and
    // device; turn them all into pixels so every mouse and trackpad feels the same.
    const px = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? window.innerHeight : 1);
    // Zooming in (scroll up / pinch apart) spreads; the other way pulls back.
    // Capped per event so one big jump can't overshoot, but always enough that
    // a few quick notches blow it up.
    const amount = clamp(-px * (e.ctrlKey ? 0.019 : 0.0042), -0.6, 0.6);
    zoomSpread(t, amount);
  }, { passive: false });

  // Two-finger pinch on touch screens.
  const touches = new Map();
  let pinch = null;
  container.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (touches.size === 2) {
      const [[ax, ay], [bx, by]] = [...touches.values()];
      const t = pickTarget((ax + bx) / 2, (ay + by) / 2);
      pinch = t ? { t, d: Math.hypot(ax - bx, ay - by) } : null;
      endDrag();
    }
  });
  container.addEventListener('pointermove', (e) => {
    if (!touches.has(e.pointerId)) return;
    touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && touches.size === 2) {
      const [[ax, ay], [bx, by]] = [...touches.values()];
      const d = Math.hypot(ax - bx, ay - by);
      zoomSpread(pinch.t, (d - pinch.d) * 0.015); // fingers apart = zoom in = spread
      pinch.d = d;
    }
  });
  const liftTouch = (e) => {
    touches.delete(e.pointerId);
    if (touches.size < 2 && pinch) {
      pinch.t.cube.spreadT = 0; // fingers lifted: snap back right away
      pinch = null;
    }
  };
  container.addEventListener('pointerup', liftTouch);
  container.addEventListener('pointercancel', liftTouch);

  // Blow a cube into its 26 cubies (handed to the physics), then drop a fresh
  // copy of it back in from the top.
  // respawn = false leaves it gone (used by the nuke).
  function shatter(t, respawn = true) {
    const c = t.cube;
    c.exploding = true;
    const pxPerUnit = view.height / 2 / (camZ * TAN15);
    t.group.updateMatrixWorld(true);
    const [cx, cy] = toScreen(t.group.getWorldPosition(new THREE.Vector3()).project(camera));
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const pieces = c.cubies.map((cb) => {
      const [x, y] = toScreen(cb.getWorldPosition(new THREE.Vector3()).project(camera));
      cb.getWorldScale(sc);
      // BoxGeometry face order: +x, -x, +y, -y, +z, -z (in the cubie's own frame)
      const faces = Array(6).fill('black');
      for (const s of cb.children) {
        const n = s.userData.normal;
        if (!n) continue;
        const i = n.x ? (n.x > 0 ? 0 : 1) : n.y ? (n.y > 0 ? 2 : 3) : (n.z > 0 ? 4 : 5);
        faces[i] = s.userData.color;
      }
      return { x, y, dx: x - cx, dy: y - cy, size: 0.99 * sc.x * pxPerUnit, quat: cb.getWorldQuaternion(q).clone(), faces };
    });
    onShatter(pieces, { byZoom: respawn });

    t.group.visible = false;
    c.setSpread(0);
    c.spread = 0;
    if (!respawn) return;
    const set = t.slot ? (y) => { t.slot.y = y; } : (y) => { fx.mainY = y; };
    setTimeout(async () => {
      // Fall back in from above the very top of the window (ease in), then a
      // little bounce. Move it up there *before* showing it so it never blinks
      // into view at its old spot.
      const from = screenEdges(camZ).top + CUBE_HALF * 2.2;
      set(from);
      t.group.visible = true;
      await tween(950, (e) => set(from * (1 - e)), easeInCubic);
      sound.thud?.();
      await tween(380, (_, k) => set(Math.sin(k * Math.PI) * 0.5 * (1 - k)), (k) => k);
      set(0);
      c.exploding = false;
    }, 2600);
  }

  container.addEventListener('pointerdown', (e) => {
    if (touches.size > 1) return;
    dragging = pickTarget(e.clientX, e.clientY)?.drag ?? null;
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

    updateProjection(); // the stage can move or change size (layout transitions)
    camZ += (targetZ() - camZ) * (1 - Math.exp(-dt * 3));
    camera.position.set(0, 0, camZ);
    camera.lookAt(0, 0, 0);

    const s = fx.shake + (fx.kick || 0); // steady shake plus any quick knock
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
    for (const m of Object.values(cube.materials)) m.emissiveIntensity = fx.glow;

    // Exploded view: ease back together after zooming stops; tremble more and
    // more as a cube gets close to blowing apart.
    for (const tg of allTargets()) {
      const c = tg.cube;
      // Let go without blowing it up and it eases back together. The pause
      // before it does covers the gaps between wheel notches, and fingers held
      // still mid-pinch keep it open.
      const pinching = pinch && pinch.t.cube === c;
      if (!c.exploding && !pinching && c.spread > 0 && now - (c.spreadT || 0) > 380) {
        c.spread *= Math.exp(-dt * 7);
        if (c.spread < 0.002) c.spread = 0;
      }
      if (c.spread !== c.appliedSpread) {
        c.setSpread(c.spread);
        c.appliedSpread = c.spread;
      }
      const base = tg.slot && !tg.slot.main ? 1 : fx.scale * (fx.squash ?? 1);
      tg.group.scale.setScalar(base * (1 + c.spread));
      const k = Math.max(0, (c.spread - 0.8) / (EXPLODE_AT - 0.8));
      tg.group.position.set(Math.sin(t * 71) * 0.12 * k, Math.sin(t * 89 + 1) * 0.12 * k, 0);
    }

    if (word) {
      word.slots.forEach((sl, i) => {
        if (!sl) return;
        sl.g.position.y = sl.y + Math.sin(t * 2 + i * 0.7) * 0.22 * word.amp;
        // A spin ripples across the word every few seconds.
        const local = t - word.start - i * 0.15;
        const l = local > 0 ? local % 4.5 : 99;
        // (paused while the word is being solved, so the moves are easy to follow)
        const spin = l < 1.2 && !fx.armHold && word.solo == null ? easeInOutCubic(l / 1.2) * Math.PI * 2 : 0;
        sl.g.rotation.set(SLOT_TILT[0] + sl.drag.x, SLOT_TILT[1] + sl.drag.y + spin + (sl.roll || 0), 0);
        sl.g.scale.setScalar(1 + (sl.pop || 0));
      });
    }

    render();
  });

  // Ease an fx value to a target. The newest call wins: an older ease still
  // running stops writing, so (say) a slow shake-up can't outlast the
  // shake-down that was asked for after it and leave the cube shaking forever.
  const fxTokens = {};
  function fxTo(key, to, ms) {
    const token = (fxTokens[key] = (fxTokens[key] || 0) + 1);
    const from = fx[key];
    return tween(ms, (e) => { if (fxTokens[key] === token) fx[key] = from + (to - from) * e; });
  }

  const slotX = (i, n) => (i - (n - 1) / 2) * SPACING;
  const v = new THREE.Vector3();

  return {
    fx,
    // For things that live in the cubes' 3D world (the MUTE arm).
    three: { scene, camera, canvas: renderer.domElement },
    toScreen: (p) => toScreen(v.copy(p).project(camera)),
    // The ray from the camera through a screen point.
    rayAt(x, y) {
      ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      return raycaster.ray.clone();
    },
    // Every cube that's on screen right now (not blown up).
    cubes: () => allTargets().filter((t) => t.group.visible && !t.cube.exploding).map((t) => t.cube),
    // The visible cube furthest to the right on screen.
    rightmostCube() {
      let best = null, bx = -Infinity;
      for (const t of allTargets()) {
        if (!t.group.visible || t.cube.exploding) continue;
        const [x] = toScreen(t.group.getWorldPosition(new THREE.Vector3()).project(camera));
        if (x > bx) { bx = x; best = t.cube; }
      }
      return best;
    },
    setSway: (to, ms = 800) => fxTo('sway', to, ms),
    setShake: (to, ms = 600) => fxTo('shake', to, ms),
    pop: () => tween(420, (_, t) => { fx.scale = 1 + Math.sin(Math.PI * t) * 0.06; }, (t) => t),
    // Something hit the cube: it squashes in, wobbles back out and jolts.
    // (In the one-at-a-time solve, the cube on show takes the hit.)
    punch(strength = 1) {
      const sl = word && word.solo != null ? word.slots[word.solo] : null;
      return tween(700, (_, t) => {
        const k = -0.17 * strength * Math.exp(-4.5 * t) * Math.sin(t * Math.PI * 3.4);
        fx.squash = 1 + k;
        fx.kick = 1.1 * strength * (1 - t) ** 2.5;
        if (sl) sl.pop = k;
      }, (t) => t).then(() => {
        fx.squash = 1;
        fx.kick = 0;
        if (sl) sl.pop = 0;
      });
    },
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
      const groups = [];
      if (holder.visible && cube.group.parent === holder) groups.push(cube.group);
      if (word) for (const sl of word.slots) if (sl) groups.push(sl.cube.group);
      return groups.filter((g) => g.visible).map((g) => {
        const pts = [];
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
          v.set(sx, sy, sz).multiplyScalar(CUBE_HALF).applyMatrix4(g.matrixWorld).project(camera);
          pts.push(toScreen(v));
        }
        return hull(pts);
      });
    },

    hasWord: () => !!word,

    // Solving the word, one cube at a time: the cube in slot i moves to the
    // middle and the camera closes in on it; the rest wait off the right edge.
    async soloStart(i) {
      const w = word;
      if (!w) return;
      w.solo = i;
      w.view = 1;
      const amp0 = w.amp;
      tween(500, (e) => { w.amp = amp0 * (1 - e); });
      const offR = screenEdges(Math.max(camZ, targetZ())).right + CUBE_HALF * 3;
      await Promise.all(w.slots.map((sl, k) => {
        if (!sl) return null;
        const x0 = sl.g.position.x, x1 = k === i ? 0 : offR;
        return wait(k === i ? 0 : 80 * k).then(() => tween(k === i ? 1000 : 700, (e) => { sl.g.position.x = x0 + (x1 - x0) * e; },
          k === i ? easeInOutCubic : easeInCubic));
      }));
    },
    // The cube in slot i rolls in from the right and knocks the one on show
    // off through the left side. onHit fires at the moment they collide.
    async soloNext(i, onHit) {
      const w = word;
      if (!w) return;
      const cur = w.slots[w.solo];
      const nx = w.slots[i];
      const edges = screenEdges(camZ);
      const offR = edges.right + CUBE_HALF * 3, offL = edges.left - CUBE_HALF * 3;
      nx.g.position.x = offR;
      sound.whoosh?.();
      let knock = null;
      await tween(800, (e) => {
        nx.g.position.x = offR * (1 - e);
        nx.roll = (1 - e) * Math.PI * 2; // spins as it comes in
        if (!knock && cur && nx.g.position.x - cur.g.position.x < CUBE_HALF * 2.3) {
          onHit?.();
          const x0 = cur.g.position.x;
          knock = tween(750, (q, t) => {
            cur.g.position.x = x0 + (offL - x0) * q;
            cur.y = Math.sin(Math.PI * t) * 1.4; // a little arc as it flies
            cur.roll = -q * Math.PI * 3; // tumbling away
          }, (t) => 1 - (1 - t) ** 3).then(() => {
            cur.g.parent?.remove(cur.g);
            const k = w.slots.indexOf(cur);
            if (k >= 0 && !cur.main) w.slots[k] = null;
          });
        }
      }, (t) => 1 - (1 - t) ** 2);
      nx.roll = 0;
      await knock;
      w.solo = i;
    },
    // A quick swell of the cube in slot i (it just got solved).
    popSlot(i) {
      const sl = word?.slots[i];
      if (!sl) return Promise.resolve();
      return tween(420, (_, k) => { sl.pop = Math.sin(Math.PI * k) * 0.16; }, (k) => k).then(() => { sl.pop = 0; });
    },

    // Blow up every cube on stage for good (the nuke).
    shatterAll() {
      for (const t of allTargets()) if (t.group.visible && !t.cube.exploding) shatter(t, false);
    },

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
      word.slots[n - 1] = { g: main, y: 0, drag: mainDrag, main: true, cube };
      mainDrag = makeDrag();

      // The earlier letters pop in from the left edge of the screen, nearest
      // slot first so none of them has to pass through another.
      // Start just past the very left edge of the window (at the zoomed-out
      // camera distance the word will settle at).
      const offLeft = screenEdges(targetZ()).left - CUBE_HALF * 2;
      const arrivals = earlier.map((c, i) => {
        castShadows(c.group);
        const g = new THREE.Group();
        g.add(c.group);
        g.position.set(offLeft, 0, 0);
        g.rotation.set(SLOT_TILT[0], SLOT_TILT[1], 0);
        group.add(g);
        const sl = { g, y: 0, drag: makeDrag(), cube: c, roll: 0 };
        word.slots[i] = sl;
        const x = slotX(i, n);
        const order = earlier.length - 1 - i;
        return wait(order * 230).then(() => sound.whoosh?.()).then(() => tween(1000, (e, k) => {
          g.position.x = offLeft + (x - offLeft) * e;
          sl.roll = (1 - e) * -Math.PI * 2; // spins as it slides in
          sl.pop = Math.sin(Math.PI * k) * 0.18; // and swells a little mid-flight
        }, easeOutBack)).then(() => { sl.roll = 0; sl.pop = 0; });
      });
      await Promise.all(arrivals);
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
