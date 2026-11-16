// The mouse pointer as a little cube: a classic arrow cursor drawn in pixels,
// filled with a mosaic of Rubik's sticker colors. Over clickable things the
// outline turns white. During the opening the cursor is hidden until a piece of
// the exploded B flies to the pointer and "becomes" it.
import { PALETTE } from './cube3d.js';

// Classic arrow, one character per pixel: X = outline, O = sticker fill.
const ARROW = [
  'X',
  'XX',
  'XOX',
  'XOOX',
  'XOOOX',
  'XOOOOX',
  'XOOOOOX',
  'XOOOOOOX',
  'XOOOOOOOX',
  'XOOOOOXXXX',
  'XOOXOOX',
  'XOX XOOX',
  'XX  XOOX',
  'X    XOOX',
  '     XOOX',
  '      XX',
];
const CELL = 2; // screen px per pixel → a 20×32 cursor
const ORDER = ['red', 'white', 'blue', 'yellow', 'green', 'orange'];

function svg(outline) {
  let rects = '';
  ARROW.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === ' ') return;
    // Sticker colors change every 2×2 pixels, like little cube faces.
    const fill = ch === 'X' ? outline : PALETTE[ORDER[(Math.floor(x / 2) + Math.floor(y / 2) * 2) % 6]];
    rects += `<rect x="${x * CELL}" y="${y * CELL}" width="${CELL}" height="${CELL}" fill="${fill}"/>`;
  }));
  const w = Math.max(...ARROW.map((r) => r.length)) * CELL;
  const h = ARROW.length * CELL;
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" shape-rendering="crispEdges">${rects}</svg>`)}`;
}

const NORMAL = svg('#111111');
const HOT = svg('#ffffff');

export const canHover = matchMedia('(hover: hover) and (pointer: fine)').matches;

export function installCursor() {
  const root = document.documentElement.style;
  root.setProperty('--cube-cursor', `url("${NORMAL}") 1 1, auto`);
  root.setProperty('--cube-cursor-hot', `url("${HOT}") 1 1, pointer`);

  // Where the pointer is (for the opening's flying piece).
  const mouse = { x: 0, y: 0, known: false };
  const track = (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.known = true;
  };
  window.addEventListener('pointermove', track, { passive: true });
  window.addEventListener('pointerdown', track, { passive: true });

  // A DOM copy of the cursor, used only to animate it growing in. It follows
  // the pointer while visible, then hands over to the real (lag-free) cursor.
  const fx = document.createElement('div');
  fx.className = 'cursor-fx';
  const img = document.createElement('img');
  img.src = NORMAL;
  img.alt = '';
  fx.appendChild(img);
  document.body.appendChild(fx);
  const follow = () => {
    fx.style.transform = `translate(${mouse.x - 1}px, ${mouse.y - 1}px)`;
    if (fx.classList.contains('show')) requestAnimationFrame(follow);
  };

  return {
    mouse,
    hide: () => document.body.classList.add('no-cursor'),
    show: () => document.body.classList.remove('no-cursor'),
    // Grow the cube cursor in at the pointer, then switch to the real cursor.
    reveal() {
      fx.classList.add('show');
      follow();
      img.addEventListener('animationend', () => {
        document.body.classList.remove('no-cursor');
        fx.classList.remove('show');
      }, { once: true });
    },
  };
}
