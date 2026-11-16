// "RUBISH" spelled out with little CSS 3D cubes. Hover spins one; clicking
// scrambles it, shakes it like a time bomb, blows it into its 26 cubies, then
// drops a fresh one back in from the top.
import { PALETTE, COLOR_ORDER } from './cube3d.js';

// Every letter is white; only the background changes.
const LOOK = [
  ['R', 'white', 'red'],
  ['U', 'white', 'orange'],
  ['B', 'white', 'yellow'],
  ['I', 'white', 'green'],
  ['S', 'white', 'blue'],
  ['H', 'white', 'red'],
];
const SIDES = ['f-back', 'f-right', 'f-left', 'f-top', 'f-bottom'];
const randColor = () => PALETTE[COLOR_ORDER[Math.floor(Math.random() * 6)]];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function animate(ms, fn) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    let prev = t0;
    const f = (now) => {
      const t = Math.min(1, (now - t0) / ms);
      fn(t, (now - prev) / 1000);
      prev = now;
      if (t < 1) requestAnimationFrame(f);
      else resolve();
    };
    requestAnimationFrame(f);
  });
}

function face(cls, colors) {
  const f = document.createElement('div');
  f.className = `mini-face ${cls}`;
  for (const c of colors) {
    const i = document.createElement('i');
    i.style.setProperty('--c', c);
    f.appendChild(i);
  }
  return f;
}

// sound: optional { blip, tick, thud } effects.
export function buildTitle(el, data, { onExplode, sound = {} }) {
  el.setAttribute('aria-label', 'RUBISH');
  LOOK.forEach(([ch, fg, bg], idx) => {
    const glyph = data[ch].glyph.join('').split('');
    const home = glyph.map((c) => PALETTE[c === '#' ? fg : bg]);

    const mini = document.createElement('div'); // floats up and down
    mini.className = 'mini';
    mini.style.setProperty('--i', idx);
    const shaker = document.createElement('div'); // shake / drop-in transforms
    shaker.className = 'mini-shake';
    const inner = document.createElement('div'); // the 3D cube
    inner.className = 'mini-inner';
    inner.appendChild(face('f-front', home));
    for (const side of SIDES) inner.appendChild(face(side, Array(9).fill(PALETTE[bg])));
    shaker.appendChild(inner);
    mini.appendChild(shaker);
    el.appendChild(mini);

    const stickers = [...inner.querySelectorAll('i')];
    const homeColors = stickers.map((s) => s.style.getPropertyValue('--c'));
    let busy = false;

    mini.addEventListener('pointerenter', () => {
      if (!busy) inner.classList.add('spin');
    });
    inner.addEventListener('animationend', () => inner.classList.remove('spin'));

    mini.addEventListener('click', async () => {
      if (busy) return;
      busy = true;
      inner.classList.remove('spin');

      // The cube keeps rotating (faster and faster) from the first scramble
      // until the moment it explodes.
      let rotY = 24, rotX = -18, spinPhase = 0, phase = 0;
      const turn = (dt, speed) => {
        rotY += dt * speed;
        spinPhase += dt * 3.1;
        rotX = -18 + Math.sin(spinPhase) * 26;
        inner.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg)`;
      };
      const shake = (t, dt, intensity) => {
        const a = intensity * intensity;
        phase += dt * (9 + 46 * intensity);
        const amp = 0.6 + a * 7.4;
        const x = Math.sin(phase * 6.1) * amp, y = Math.cos(phase * 4.7) * amp * 0.6;
        const rot = Math.sin(phase * 5.3) * amp * 0.9;
        shaker.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg) scale(${1 + 0.28 * a})`;
      };

      // 1. Scramble: stickers flicker to random colors while it twists and starts to shake.
      let flick = 0;
      await animate(1000, (t, dt) => {
        flick += dt;
        if (flick > 0.11) {
          flick = 0;
          stickers.forEach((s) => s.style.setProperty('--c', randColor()));
          sound.blip?.(Math.floor(Math.random() * 6));
        }
        turn(dt, 360);
        shake(t, dt, t * 0.25);
      });

      // 2. Time bomb: spinning, shaking and flashing all speed up and grow.
      let tickWait = 0;
      await animate(2100, (t, dt) => {
        // Ticking that speeds up like a fuse burning down.
        tickWait -= dt;
        if (tickWait <= 0) {
          sound.tick?.(t);
          tickWait = 0.34 - 0.29 * t;
        }
        turn(dt, 360 + 900 * t * t);
        shake(t, dt, 0.25 + 0.75 * t);
        const flash = Math.max(0, Math.sin(t * t * 42)) * t;
        shaker.style.filter = `brightness(${1 + flash * 0.9}) drop-shadow(0 0 ${10 * flash}px #fff)`;
      });

      // 3. Boom: hide it and let the physics take over, starting from the cube's
      // current angle.
      const rect = inner.getBoundingClientRect();
      mini.classList.add('gone');
      shaker.style.transform = '';
      shaker.style.filter = '';
      inner.style.transform = '';
      const rad = Math.PI / 180;
      onExplode(rect.left + rect.width / 2, rect.top + rect.height / 2, mini.offsetWidth * 1.15, -rotX * rad, rotY * rad);
      await sleep(3200);

      // 4. A fresh cube drops back in from the top (ease-in), then settles.
      stickers.forEach((s, i) => s.style.setProperty('--c', homeColors[i]));
      const fall = rect.bottom + 60;
      shaker.style.transform = `translateY(${-fall}px)`;
      mini.classList.remove('gone');
      await animate(900, (t) => {
        shaker.style.transform = `translateY(${-fall * (1 - t * t * t)}px)`;
      });
      sound.thud?.();
      await animate(420, (t) => {
        const sq = Math.sin(t * Math.PI) * (1 - t) * 0.32;
        shaker.style.transform = `scale(${1 + sq}, ${1 - sq})`;
      });
      shaker.style.transform = '';
      busy = false;
    });
  });
}
