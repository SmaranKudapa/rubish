// "RUBISH" spelled out with little CSS 3D cubes. Hover spins one; clicking
// scrambles it, shakes it like a time bomb, blows it into its 26 cubies, then
// drops a fresh one back in from the top.
//
// It also runs the opening: the word "RUBBISH" appears as plain text, each
// letter flips into its cube, and the extra second B blows up.
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
const EXTRA_B = ['B', 'white', 'blue']; // the second B of "RUBBISH" (opening only)
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

// One little letter cube (plus its plain-text letter, shown while it's still
// text). Uses the same classes as the title, so the same CSS states apply.
export function buildCube(data, [ch, fg, bg], idx) {
  const glyph = data[ch].glyph.join('').split('');
  const home = glyph.map((c) => PALETTE[c === '#' ? fg : bg]);
  const mini = document.createElement('div'); // floats up and down
  mini.className = 'mini';
  mini.style.setProperty('--i', idx);
  const letter = document.createElement('span'); // plain-text letter
  letter.className = 'mini-letter';
  letter.textContent = ch;
  const shaker = document.createElement('div'); // shake / drop-in transforms
  shaker.className = 'mini-shake';
  const inner = document.createElement('div'); // the 3D cube
  inner.className = 'mini-inner';
  inner.appendChild(face('f-front', home));
  for (const side of SIDES) inner.appendChild(face(side, Array(9).fill(PALETTE[bg])));
  shaker.appendChild(inner);
  mini.append(letter, shaker);
  return { mini, shaker, inner };
}

// sound: optional { blip, tick, thud, whoosh } effects.
export function buildTitle(el, data, { onExplode, sound = {} }) {
  el.setAttribute('aria-label', 'RUBISH');
  let opening = false; // clicks are ignored while the opening plays

  function makeMini(look, idx, extra = false) {
    const { mini, shaker, inner } = buildCube(data, look, idx);

    const stickers = [...inner.querySelectorAll('i')];
    const rec = { mini, shaker, inner, stickers, homeColors: stickers.map((s) => s.style.getPropertyValue('--c')), busy: false, extra };

    mini.addEventListener('pointerenter', () => {
      if (rec.busy || opening || inner.classList.contains('spin')) return;
      inner.classList.add('spin');
      sound.whoosh?.();
    });
    inner.addEventListener('animationend', () => inner.classList.remove('spin'));
    mini.addEventListener('click', async () => {
      if (rec.busy || opening) return;
      rec.busy = true;
      await bomb(rec, { onBoom: onExplode });
      rec.busy = false;
    });
    return rec;
  }

  // Scramble, time-bomb shake, explode. With respawn, a fresh cube then drops
  // back in from the top; otherwise the cube is gone for good.
  async function bomb(rec, { scramble = 1000, fuse = 2100, respawn = true, onBoom }) {
    const { mini, shaker, inner, stickers } = rec;
    inner.classList.remove('spin');
    shaker.style.transition = 'none';

    // The cube keeps rotating (faster and faster) from the first scramble
    // until the moment it explodes.
    let rotY = 24, rotX = -18, spinPhase = 0, phase = 0;
    const turn = (dt, speed) => {
      rotY += dt * speed;
      spinPhase += dt * 3.1;
      rotX = -18 + Math.sin(spinPhase) * 26;
      inner.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg)`;
    };
    const shake = (dt, intensity) => {
      const a = intensity * intensity;
      phase += dt * (9 + 46 * intensity);
      const amp = 0.6 + a * 7.4;
      const x = Math.sin(phase * 6.1) * amp, y = Math.cos(phase * 4.7) * amp * 0.6;
      const rot = Math.sin(phase * 5.3) * amp * 0.9;
      shaker.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg) scale(${1 + 0.28 * a})`;
    };

    // 1. Scramble: stickers flicker to random colors while it twists and starts to shake.
    let flick = 0;
    await animate(scramble, (t, dt) => {
      flick += dt;
      if (flick > 0.11) {
        flick = 0;
        stickers.forEach((s) => s.style.setProperty('--c', randColor()));
        sound.blip?.(Math.floor(Math.random() * 6));
      }
      turn(dt, 360);
      shake(dt, t * 0.25);
    });

    // 2. Time bomb: spinning, shaking and flashing all speed up and grow.
    let tickWait = 0;
    await animate(fuse, (t, dt) => {
      // Ticking that speeds up like a fuse burning down.
      tickWait -= dt;
      if (tickWait <= 0) {
        sound.tick?.(t);
        tickWait = 0.34 - 0.29 * t;
      }
      turn(dt, 360 + 900 * t * t);
      shake(dt, 0.25 + 0.75 * t);
      const flash = Math.max(0, Math.sin(t * t * 42)) * t;
      shaker.style.filter = `brightness(${1 + flash * 0.9}) drop-shadow(0 0 ${10 * flash}px #fff)`;
    });

    // 3. Boom: hide it and let the physics take over, starting from the cube's
    // current angle and its on-screen size.
    const rect = inner.getBoundingClientRect();
    const size = mini.getBoundingClientRect().width * 1.15;
    mini.classList.add('gone');
    shaker.style.transform = '';
    shaker.style.filter = '';
    inner.style.transform = '';
    const rad = Math.PI / 180;
    onBoom(rect.left + rect.width / 2, rect.top + rect.height / 2, size, -rotX * rad, rotY * rad);
    if (!respawn) return;
    await sleep(3200);

    // 4. A fresh cube drops back in from the top (ease-in), then settles.
    stickers.forEach((s, i) => s.style.setProperty('--c', rec.homeColors[i]));
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
    shaker.style.transition = '';
  }

  const recs = LOOK.map((look, i) => makeMini(look, i));
  for (const r of recs) el.appendChild(r.mini);

  return {
    // The opening: "RUBBISH" as plain text → letters flip into cubes → the
    // second B scrambles, shakes and explodes (onBoom gets the explosion) and
    // its slot closes up. Resolves once only RUBISH is left.
    // gate(): awaited while the plain text is up (e.g. to wait for a click so
    // sound is allowed).
    // Blow up every title cube at once, for good (the nuke).
    explodeAll() {
      opening = true; // no more clicking them
      for (const r of recs) {
        if (r.mini.classList.contains('gone')) continue;
        const rect = r.inner.getBoundingClientRect();
        const size = r.mini.getBoundingClientRect().width * 1.15;
        r.busy = true;
        r.mini.classList.add('gone');
        onExplode(rect.left + rect.width / 2, rect.top + rect.height / 2, size);
      }
    },

    async playIntro({ onBoom, gate = async () => {} }) {
      opening = true;
      const extra = makeMini(EXTRA_B, 3, true);
      recs[2].mini.after(extra.mini);
      const all = [...recs.slice(0, 3), extra, ...recs.slice(3)];
      el.classList.add('intro');

      // Letters pop in one at a time.
      all.forEach((r, i) => setTimeout(() => { r.mini.classList.add('letter-in'); sound.blip?.(i % 6); }, 150 + i * 110));
      await sleep(150 + all.length * 110 + 400);
      await gate();
      await sleep(1650); // let the plain text sit for a moment

      // Each letter flips over into its cube.
      all.forEach((r, i) => setTimeout(() => { r.mini.classList.add('cube-in'); sound.tick?.(0.2); }, i * 120));
      await sleep(all.length * 120 + 1750); // and the cubes too

      // The second B goes off.
      extra.busy = true;
      await bomb(extra, { scramble: 650, fuse: 1300, respawn: false, onBoom });

      // Close the gap it left.
      extra.mini.classList.add('collapse');
      await sleep(520);
      extra.mini.remove();
      el.classList.remove('intro');
      for (const r of recs) r.mini.classList.remove('letter-in', 'cube-in');
      opening = false;
    },
  };
}
