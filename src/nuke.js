// The NUKE easter egg (type NUKE and submit).
//
//  0.0s  a little launcher rises out of the floor
//  1.2s  a missile launches out of it and arcs up
//  3.0s  it turns toward you...
//  3.6s  ...and flies at the screen, growing until it fills it (10s total),
//        while everything turns red, an alarm wails and the page shakes
// 10.0s  impact: white flash, red theme, every cube explodes, the UI falls
//        apart, a mushroom cloud rises. Then "press any key to rebuild".
import { PALETTE } from './cube3d.js';

const TOTAL = 10000;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
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
    // Fins (behind the nose cone)
    const fin = (Math.abs(dx) <= 1 && Math.abs(dy) <= 20) || (Math.abs(dy) <= 1 && Math.abs(dx) <= 20);
    if (r > R + 1.5) return fin && r <= 20 ? (r > 19 ? '#111' : '#6b7a63') : null;
    if (r > R) return '#111';
    if (r > R - 2) return PALETTE.red;
    // Radiation trefoil on yellow
    if (r < 2.5) return '#111';
    if (r < 3.6) return PALETTE.yellow;
    const a = ((Math.atan2(dy, dx) * 180) / Math.PI + 360 + 90) % 120;
    if (r < R - 3 && a < 60) return '#111';
    return PALETTE.yellow;
  });
}

// Pixel mushroom cloud.
function mushroom() {
  const W = 56, H = 56;
  const hash = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); };
  const shade = (k, x, y) => {
    const n = k + (hash(x, y) - 0.5) * 0.25;
    if (n > 0.8) return '#fff6c8';
    if (n > 0.62) return PALETTE.yellow;
    if (n > 0.42) return PALETTE.orange;
    if (n > 0.22) return PALETTE.red;
    return '#5b1111';
  };
  return spriteFromFn(W, H, (x, y) => {
    // Cap
    const cx = 28, cy = 16;
    const capD = Math.hypot((x - cx) / 25, (y - cy) / 13);
    if (capD < 1 && y < 27) return shade(1 - capD * 0.9 - (y - 4) / 60, x, y);
    // Stem
    const stemHalf = 4 + Math.max(0, (y - 40) * 0.35);
    if (y >= 24 && y < 50 && Math.abs(x - cx) < stemHalf) return shade(0.55 - Math.abs(x - cx) / 14 - (y - 24) / 90, x, y);
    // Ground ring
    const baseD = Math.hypot((x - cx) / 26, (y - 50) / 5.5);
    if (baseD < 1) return shade(0.45 - baseD * 0.4, x, y);
    return null;
  });
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
export async function runNuke({ stage, physics, title, uiEls, sound = {}, onImpact = () => {}, canHover = true }) {
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
  const front = headOn();
  const nose = imgEl('nuke-sprite', layer, front, 1);
  nose.style.opacity = '0';

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
        const sx = lx, sy = ly - 10;
        const ex = W * 0.42, ey = H * 0.24;
        const x = lerp(sx, ex, e), y = lerp(sy, ey, e) - Math.sin(Math.PI * e) * H * 0.12;
        const frameIdx = Math.floor(ms / 80) % 2;
        missile.src = missileFrames[frameIdx].url;
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

      // Head-on: rush at the screen, growing faster and faster.
      if (ms >= 3600) {
        missile.style.opacity = '0';
        nose.style.opacity = '1';
        const p = clamp01((ms - 3600) / (TOTAL - 3600));
        const size = 24 * Math.exp(Math.log((Math.max(W, H) * 2.4) / 24) * Math.pow(p, 1.7));
        const x = lerp(W * 0.42, W / 2, easeInOut(p)) + Math.sin(t * 9) * 6 * p;
        const y = lerp(H * 0.24, H / 2, easeInOut(p)) + Math.cos(t * 7) * 6 * p;
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
  nose.remove();
  missile.remove();
  launcher.remove();
  warning.remove();
  stage.fx.shake = 1;
  document.body.classList.add('nuked');
  tint.style.transition = 'opacity 1s ease';
  tint.style.opacity = '0.9';
  vignette.style.opacity = '0.85';

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

  // Mushroom cloud rises from the ground.
  const cloud = imgEl('nuke-cloud', layer, mushroom(), 1);
  const cw = Math.min(W * 0.9, H * 1.1);
  cloud.style.width = `${cw}px`;
  cloud.style.height = `${cw}px`;
  cloud.style.left = `${W / 2 - cw / 2}px`;
  cloud.style.top = `${floorTop - cw * 0.92}px`;
  requestAnimationFrame(() => cloud.classList.add('rise'));

  await sleep(1600);
  stage.fx.shake = 0.35;
  for (const n of panelish) if (n) n.classList.remove('quake');
  await sleep(1900);
  stage.fx.shake = 0;

  // ---------- Aftermath ----------
  const end = el('nuke-end', layer);
  end.innerHTML = `<p class="nuke-title">NUKED</p><p class="nuke-sub">${canHover ? 'PRESS ANY KEY TO REBUILD' : 'TAP TO REBUILD'}</p>`;
  requestAnimationFrame(() => end.classList.add('show'));
  await sleep(600);
  await new Promise((resolve) => {
    const go = () => resolve();
    window.addEventListener('keydown', go, { once: true });
    window.addEventListener('pointerdown', go, { once: true });
  });
  location.reload(); // rebuild the world: the opening plays again
}
