// The NUKE easter egg (type NUKE and submit; the word box locks).
//
//  0.0s  a little launcher rises out of the floor
//  1.2s  a missile launches out of it and arcs up
//  3.0s  it turns toward you...
//  3.6s  ...and dives at the leftmost RUBISH cube (10s total) while everything
//        turns red, an alarm wails and the page shakes
// 10.0s  impact: flash, red world, every cube explodes, the UI falls apart and
//        an animated mushroom cloud rises behind it all. "NUKE" lifts out of
//        the word box to the middle of the screen, gains a D, and the letters
//        flip into cubes. Then "press any key to rebuild".
import { PALETTE } from './cube3d.js';
import { buildCube } from './title.js';

const TOTAL = 10000;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const lerp = (a, b, t) => a + (b - a) * t;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Pixel sprites ----------
const COLORS = {
  k: '#111111', d: '#3d4a3a', g: '#6b7a63', l: '#9aa58f', w: '#f2f2f2', s: '#b9b9b9',
  r: PALETTE.red, y: PALETTE.yellow, o: PALETTE.orange, f: '#fff3a0',
};

function spriteFromRows(rows) {
  const w = Math.max(...rows.map((r) => r.length));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = rows.length;
  const g = c.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (!COLORS[ch]) return;
    g.fillStyle = COLORS[ch];
    g.fillRect(x, y, 1, 1);
  }));
  return { url: c.toDataURL(), w, h: rows.length };
}

function spriteFromFn(w, h, fn) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const col = fn(x, y);
    if (!col) continue;
    g.fillStyle = col;
    g.fillRect(x, y, 1, 1);
  }
  return { url: c.toDataURL(), w, h };
}

const LAUNCHER = [
  '....kkkkkkkk....',
  '...kllllllllk...',
  '..kkkkkkkkkkkk..',
  '..kdk......kdk..',
  'kkkkkkkkkkkkkkkk',
  'kykkykkykkykkykk',
  'kkykkykkykkykkyk',
  'kgggggggggggggdk',
  'kgdddgggggdddgdk',
  'kkkkkkkkkkkkkkkk',
];

// Missile seen from the side, nose up, with two flame frames.
const MISSILE = (flame) => [
  '..kk..',
  '.krrk.',
  '.krrk.',
  'kwwwwk',
  'kwkkwk',
  'kwkwwk',
  'kwwwwk',
  'kwwwwk',
  'kwrrwk',
  'kwwwwk',
  'kwwwwk',
  'ksksks',
  'ks..sk',
  ...(flame ? ['.foof.', '..oy..', '..o...'] : ['.ofyo.', '.oyyo.', '..oo..']),
];

// Missile coming straight at you: nose cone with a radiation symbol, four fins.
function headOn() {
  const N = 41, C = 20, R = 13;
  return spriteFromFn(N, N, (x, y) => {
    const dx = x - C, dy = y - C;
    const r = Math.hypot(dx, dy);
    const fin = (Math.abs(dx) <= 1 && Math.abs(dy) <= 20) || (Math.abs(dy) <= 1 && Math.abs(dx) <= 20);
    if (r > R + 1.5) return fin && r <= 20 ? (r > 19 ? '#111' : '#6b7a63') : null;
    if (r > R) return '#111';
    if (r > R - 2) return PALETTE.red;
    if (r < 2.5) return '#111';
    if (r < 3.6) return PALETTE.yellow;
    const a = ((Math.atan2(dy, dx) * 180) / Math.PI + 360 + 90) % 120;
    if (r < R - 3 && a < 60) return '#111';
    return PALETTE.yellow;
  });
}

// ---------- Animated pixel mushroom cloud ----------
// Smooth value noise for the billowing.
const h2 = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(h2(xi, yi), h2(xi + 1, yi), u), lerp(h2(xi, yi + 1), h2(xi + 1, yi + 1), u), v);
}
const CLOUD_RAMP = [[0.82, [255, 246, 200]], [0.64, [255, 213, 0]], [0.46, [255, 88, 0]], [0.28, [196, 30, 58]], [0.14, [110, 22, 22]], [-1, [70, 52, 52]]];

function cloudPainter(canvas) {
  const N = canvas.width;
  const g = canvas.getContext('2d');
  const img = g.createImageData(N, N);
  return (T) => {
    const grow = easeOut(clamp01(T / 3.8));
    const cool = clamp01(T / 14) * 0.45; // it slowly cools from white-hot to red and smoke
    const cx = N / 2, ground = N - 4;
    const capY = lerp(ground - 8, 15, grow), capRx = 5 + 22 * grow, capRy = 3 + 10 * grow;
    const ringRx = 7 + 23 * grow;
    const d = img.data;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const churn = noise(x * 0.16 + T * 0.35, y * 0.16 - T * 1.3); // rolling upward
      const wobble = (noise(x * 0.11 - T * 0.5, y * 0.11 + T * 0.2) - 0.5) * 0.5;
      let k = -9;
      const cap = Math.hypot((x - cx) / capRx, (y - capY) / capRy) + wobble;
      if (cap < 1) k = Math.max(k, 1.05 - cap * 0.85 - (y - capY + capRy) / (N * 1.4));
      const stemHalf = (2.5 + 2.5 * grow) * (1 + Math.max(0, (y - ground + 12) / 9)) + wobble * 3;
      if (y > capY && y < ground && Math.abs(x - cx) < stemHalf) k = Math.max(k, 0.7 - Math.abs(x - cx) / 10 - (y - capY) / (N * 1.6));
      const ring = Math.hypot((x - cx) / ringRx, (y - ground) / 4.5) + wobble * 0.6;
      if (ring < 1) k = Math.max(k, 0.55 - ring * 0.45);
      const i = (y * N + x) * 4;
      if (k < -1) { d[i + 3] = 0; continue; }
      const heat = k + (churn - 0.5) * 0.35 - cool;
      const col = CLOUD_RAMP.find(([t]) => heat > t)[1];
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  };
}

function el(cls, parent, tag = 'div') {
  const e = document.createElement(tag);
  e.className = cls;
  parent.appendChild(e);
  return e;
}
function imgEl(cls, parent, sprite, scale) {
  const i = el(cls, parent, 'img');
  i.src = sprite.url;
  i.alt = '';
  i.width = sprite.w * scale;
  i.height = sprite.h * scale;
  return i;
}

// stage, physics, title: the app's parts. uiEls: things that fall off on impact.
// input: the (locked) word box holding "NUKE". data: letter glyphs for the cubes.
export async function runNuke({ stage, physics, title, uiEls, input, data, sound = {}, onImpact = () => {}, canHover = true }) {
  const W = innerWidth, H = innerHeight;
  const layer = el('nuke-layer', document.body);
  const tint = el('nuke-tint', layer);
  const vignette = el('nuke-vignette', layer);
  const warning = el('nuke-warning', layer);
  warning.textContent = '!! INCOMING !!';

  const floorTop = physics.floorY(0);
  const launcherSprite = spriteFromRows(LAUNCHER);
  const LS = 4; // launcher pixel scale
  const launcher = imgEl('nuke-sprite', layer, launcherSprite, LS);
  const lx = W * 0.2, ly = floorTop - launcherSprite.h * LS + 6;

  const missileFrames = [spriteFromRows(MISSILE(true)), spriteFromRows(MISSILE(false))];
  const MS = 3;
  const missile = imgEl('nuke-sprite', layer, missileFrames[0], MS);
  missile.style.opacity = '0';
  const nose = imgEl('nuke-sprite', layer, headOn(), 1);
  nose.style.opacity = '0';

  // The target: the leftmost RUBISH cube.
  const targetCube = document.querySelector('.title .mini:not(.gone)');
  const tr = targetCube ? targetCube.getBoundingClientRect() : { left: W * 0.3, top: H * 0.1, width: 50, height: 50 };
  const tx = tr.left + tr.width / 2, ty = tr.top + tr.height / 2;
  const hitSize = Math.max(tr.width, 40) * 2.6;
  const startX = W * 0.55, startY = H * 0.3; // where the arc ends and the dive begins

  const panelish = [document.querySelector('.title'), document.querySelector('.panel')];
  const place = (node, x, y, w, h, rot = 0) => {
    node.style.width = `${w}px`;
    node.style.height = `${h}px`;
    node.style.transform = `translate(${x - w / 2}px, ${y - h / 2}px) rotate(${rot}deg)`;
  };

  sound.siren?.(TOTAL / 1000);
  let launched = false;

  // ---------- The approach ----------
  await new Promise((resolve) => {
    const t0 = performance.now();
    const frame = (now) => {
      const ms = now - t0;
      const t = ms / 1000;

      // Launcher rises out of the floor.
      const up = easeInOut(clamp01(ms / 1200));
      place(launcher, lx, ly + (1 - up) * 80, launcherSprite.w * LS, launcherSprite.h * LS);

      if (ms > 1200 && !launched) {
        launched = true;
        sound.launch?.();
        warning.classList.add('on');
      }

      // Missile rises and arcs up out of the launcher.
      if (ms >= 1200 && ms < 3600) {
        const k = clamp01((ms - 1200) / 1800);
        const e = easeInOut(k);
        const x = lerp(lx, startX, e), y = lerp(ly - 10, startY, e) - Math.sin(Math.PI * e) * H * 0.12;
        missile.src = missileFrames[Math.floor(ms / 80) % 2].url;
        missile.style.opacity = '1';
        // Turn toward the viewer: squash sideways, then swap to the head-on view.
        const turn = clamp01((ms - 3000) / 600);
        place(missile, x, y, missileFrames[0].w * MS * (1 - turn), missileFrames[0].h * MS, lerp(0, 25, e));
        if (turn > 0.5) {
          missile.style.opacity = '0';
          nose.style.opacity = '1';
          place(nose, x, y, 24 * (turn - 0.5) * 2, 24 * (turn - 0.5) * 2);
        }
      }

      // Head-on: dive at the leftmost cube, growing as it closes in.
      if (ms >= 3600) {
        missile.style.opacity = '0';
        nose.style.opacity = '1';
        const p = clamp01((ms - 3600) / (TOTAL - 3600));
        const e = Math.pow(p, 1.8); // slow at first, then rushing in
        const size = 24 * Math.exp(Math.log(hitSize / 24) * e);
        const x = lerp(startX, tx, e) + Math.sin(t * 9) * 5 * p;
        const y = lerp(startY, ty, e) + Math.cos(t * 7) * 5 * p;
        place(nose, x, y, size, size, Math.sin(t * 5) * 6 * p);

        // Everything goes red, the alarm pulses, the page shakes.
        const pulse = 0.5 + 0.5 * Math.sin(t * 7);
        tint.style.opacity = String(Math.min(1, 0.1 + 0.85 * Math.pow(p, 1.2) + 0.1 * pulse * p));
        vignette.style.opacity = String(Math.min(1, p * 1.3) * (0.6 + 0.4 * pulse));
        stage.fx.shake = Math.pow(p, 2) * 0.9;
        const j = Math.pow(p, 2.2) * 8;
        for (const n of panelish) if (n) n.style.transform = `translate(${(Math.random() - 0.5) * j}px, ${(Math.random() - 0.5) * j}px)`;
      } else if (ms > 1200) {
        tint.style.opacity = String(0.1 * clamp01((ms - 1200) / 2400));
      }

      if (ms < TOTAL) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });

  // ---------- Impact ----------
  onImpact();
  sound.nukeBoom?.();
  const flash = el('nuke-flash', layer);
  flash.style.opacity = '1';
  requestAnimationFrame(() => { flash.style.transition = 'opacity 1.6s ease-out'; flash.style.opacity = '0'; });
  const burst = el('nuke-burst', layer);
  burst.style.left = `${tx}px`;
  burst.style.top = `${ty}px`;
  nose.remove();
  missile.remove();
  launcher.remove();
  warning.remove();
  stage.fx.shake = 1;
  document.body.classList.add('nuked');
  tint.style.transition = 'opacity 1s ease';
  tint.style.opacity = '0.5'; // still red, but lets the fire colors show
  vignette.style.opacity = '0.85';

  // The word lifts out of the box before the box falls away.
  const box = input.getBoundingClientRect();
  const boxFont = parseFloat(getComputedStyle(input).fontSize) || 18;
  input.value = '';
  input.placeholder = ''; // the box falls away empty

  // Every cube blows up; debris rains down.
  stage.shatterAll();
  title.explodeAll();
  physics.confetti(160);

  // Bits of the UI shake loose and fall, at random.
  for (const n of panelish) if (n) { n.style.transform = ''; n.classList.add('quake'); }
  for (const node of uiEls) {
    if (!node || !node.isConnected) continue;
    node.style.setProperty('--delay', `${(Math.random() * 1.4).toFixed(2)}s`);
    node.style.setProperty('--dur', `${(1.3 + Math.random() * 0.9).toFixed(2)}s`);
    node.style.setProperty('--rot', `${Math.round((Math.random() - 0.5) * 220)}deg`);
    node.style.setProperty('--dx', `${Math.round((Math.random() - 0.5) * 240)}px`);
    node.classList.add('fall');
  }

  // Animated mushroom cloud, rising behind everything from under the impact.
  const back = el('nuke-back', document.body);
  const cloudCanvas = el('nuke-cloud', back, 'canvas');
  cloudCanvas.width = cloudCanvas.height = 64;
  const cw = Math.min(W * 0.85, H * 1.05);
  const cx = Math.min(Math.max(tx, cw / 2), W - cw / 2);
  Object.assign(cloudCanvas.style, { width: `${cw}px`, height: `${cw}px`, left: `${cx - cw / 2}px`, top: `${floorTop - cw * 0.97}px` });
  const paint = cloudPainter(cloudCanvas);
  const cloudStart = performance.now();
  const animateCloud = (now) => {
    paint((now - cloudStart) / 1000);
    if (back.isConnected) requestAnimationFrame(animateCloud);
  };
  requestAnimationFrame(animateCloud);

  // "NUKE" floats out of the word box to the middle of the screen as plain text.
  const looks = [['N', 'white', 'red'], ['U', 'white', 'orange'], ['K', 'white', 'yellow'], ['E', 'white', 'red'], ['D', 'white', 'orange']];
  const word = el('title intro nuke-word', layer);
  const cubes = looks.map((look, i) => buildCube(data, look, i).mini);
  for (const c of cubes.slice(0, 4)) { c.classList.add('letter-in'); word.appendChild(c); }
  const m = cubes[0].offsetWidth;
  const s0 = boxFont / (m * 0.9);
  const centerY = H * 0.44;
  const startT = `translate(-50%, -50%) translate(${box.left + box.width / 2 - W / 2}px, ${box.top + box.height / 2 - centerY}px) scale(${s0})`;
  word.style.top = `${centerY}px`;
  word.style.transform = startT;
  await sleep(700);
  for (const n of panelish) if (n) n.classList.remove('quake');
  stage.fx.shake = 0.35;
  word.style.transition = 'transform 1.7s cubic-bezier(0.65, 0, 0.35, 1)';
  word.style.transform = 'translate(-50%, -50%) scale(1)';
  sound.whoosh?.();
  await sleep(1900);
  stage.fx.shake = 0;

  // ...gains a D...
  word.appendChild(cubes[4]);
  void cubes[4].offsetWidth;
  cubes[4].classList.add('letter-in');
  sound.blip?.(5);
  await sleep(1100);

  // ...and the letters flip into cubes, like the opening.
  cubes.forEach((c, i) => setTimeout(() => { c.classList.add('cube-in'); sound.tick?.(0.2); }, i * 140));
  await sleep(cubes.length * 140 + 900);

  // ---------- Aftermath ----------
  const prompt = el('nuke-sub', layer, 'p');
  prompt.textContent = canHover ? 'PRESS ANY KEY TO REBUILD' : 'TAP TO REBUILD';
  await sleep(400);
  await new Promise((resolve) => {
    const go = () => resolve();
    window.addEventListener('keydown', go, { once: true });
    window.addEventListener('pointerdown', go, { once: true });
  });
  location.reload(); // rebuild the world: the opening plays again
}
