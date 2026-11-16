// "RUBISH" spelled out with little CSS 3D cubes, each showing its letter.
import { PALETTE } from './cube3d.js';

const LOOK = [
  ['R', 'white', 'red'],
  ['U', 'white', 'orange'],
  ['B', 'blue', 'yellow'],
  ['I', 'white', 'green'],
  ['S', 'yellow', 'blue'],
  ['H', 'red', 'white'],
];

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

export function buildTitle(el, data) {
  el.setAttribute('aria-label', 'RUBISH');
  LOOK.forEach(([ch, fg, bg], i) => {
    const glyph = data[ch].glyph.join('').split('');
    const mini = document.createElement('div');
    mini.className = 'mini';
    mini.style.setProperty('--i', i);
    const inner = document.createElement('div');
    inner.className = 'mini-inner';
    inner.appendChild(face('f-front', glyph.map((c) => PALETTE[c === '#' ? fg : bg])));
    // Sides are solid (like a half-solved cube) so the letter on the front reads clearly.
    for (const side of ['f-back', 'f-right', 'f-left', 'f-top', 'f-bottom']) {
      inner.appendChild(face(side, Array(9).fill(PALETTE[bg])));
    }
    mini.appendChild(inner);
    el.appendChild(mini);
  });
}

export function cheer(el) {
  el.classList.remove('cheer');
  void el.offsetWidth;
  el.classList.add('cheer');
}
