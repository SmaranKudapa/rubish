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

export function buildTitle(el, data, { onExplode }) {
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

      // 1. Scramble: stickers flicker to random colors while the cube twists a full turn.
      for (let r = 0; r < 9; r++) {
        stickers.forEach((s) => s.style.setProperty('--c', randColor()));
        await animate(110, (t) => {
          const p = (r + t) / 9;
          inner.style.transform = `rotateX(${-18 + Math.sin(Math.PI * p) * 28}deg) rotateY(${24 + p * 360}deg)`;
        });
      }
      inner.style.transform = '';

      // 2. Time bomb: shaking and flashing that speed up and grow.
      let phase = 0;
      await animate(2100, (t, dt) => {
        const a = t * t;
        phase += dt * (9 + 46 * t);
        const amp = 1 + a * 7;
        const x = Math.sin(phase * 6.1) * amp, y = Math.cos(phase * 4.7) * amp * 0.6;
        const rot = Math.sin(phase * 5.3) * amp * 0.9;
        shaker.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg) scale(${1 + 0.28 * a})`;
        const flash = Math.max(0, Math.sin(t * t * 42)) * t;
        shaker.style.filter = `brightness(${1 + flash * 0.9}) drop-shadow(0 0 ${10 * flash}px #fff)`;
      });

      // 3. Boom: hide it and let the physics take over.
      const rect = inner.getBoundingClientRect();
      mini.classList.add('gone');
      shaker.style.transform = '';
      shaker.style.filter = '';
      onExplode(rect.left + rect.width / 2, rect.top + rect.height / 2, mini.offsetWidth * 1.15);
      await sleep(3200);

      // 4. A fresh cube drops back in from the top (ease-in), then settles.
      stickers.forEach((s, i) => s.style.setProperty('--c', homeColors[i]));
      const fall = rect.bottom + 60;
      shaker.style.transform = `translateY(${-fall}px)`;
      mini.classList.remove('gone');
      await animate(900, (t) => {
        shaker.style.transform = `translateY(${-fall * (1 - t * t * t)}px)`;
      });
      await animate(420, (t) => {
        const sq = Math.sin(t * Math.PI) * (1 - t) * 0.32;
        shaker.style.transform = `scale(${1 + sq}, ${1 - sq})`;
      });
      shaker.style.transform = '';
      busy = false;
    });
  });
}
