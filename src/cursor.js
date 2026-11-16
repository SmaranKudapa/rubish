// The mouse pointer as a little pixel-art Rubik's cube (isometric, three faces
// with 3x3 stickers). The tip is the cube's top corner. Over clickable things it
// gets a white glowing outline and little click sparkles. During the opening the
// cursor is hidden until a piece of the exploded B flies to the pointer and
// "becomes" it.
import { PALETTE } from './cube3d.js';

const N = 32; // pixels per side (32×32 is the largest size cursors reliably support)
const SCALE = 1;
const HOT_X = 16, HOT_Y = 2; // the top corner

// Isometric cube: top corner at (16,2); edges go right-down, left-down and down.
const TOP = [16, 2], EX = [12, 6], EY = [-12, 6], DOWN = [0, 13];
const W = 'white', Y = 'yellow', R = 'red', O = 'orange', G = 'green', B = 'blue';
const FACES = [
  { o: TOP, u: EX, v: EY, shade: 1, colors: [W, W, Y, W, W, R, Y, W, W] }, // top
  { o: [28, 8], u: EY, v: DOWN, shade: 0.8, colors: [R, R, B, R, R, R, G, R, R] }, // right
  { o: [4, 8], u: EX, v: DOWN, shade: 0.62, colors: [B, B, B, O, B, B, B, B, Y] }, // left
];

function shadeHex(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * k));
  return `rgb(${c.join(',')})`;
}

// Which color a logical pixel gets (null = transparent).
function pixelColor(x, y) {
  for (const f of FACES) {
    const px = x + 0.5 - f.o[0], py = y + 0.5 - f.o[1];
    const det = f.u[0] * f.v[1] - f.u[1] * f.v[0];
    const s = (px * f.v[1] - py * f.v[0]) / det;
    const t = (f.u[0] * py - f.u[1] * px) / det;
    if (s < 0 || s >= 1 || t < 0 || t >= 1) continue;
    const i = Math.min(2, Math.floor(s * 3)), j = Math.min(2, Math.floor(t * 3));
    const fs = s * 3 - i, ft = t * 3 - j;
    // Black plastic between stickers and around the edge.
    if (fs < 0.16 || ft < 0.16 || s > 0.95 || t > 0.95) return '#111';
    return shadeHex(PALETTE[f.colors[j * 3 + i]], f.shade);
  }
  return null;
}

function render(hot) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = N * SCALE;
  const g = canvas.getContext('2d');
  const grid = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) grid.push(pixelColor(x, y));
  const at = (x, y) => (x < 0 || y < 0 || x >= N || y >= N ? null : grid[y * N + x]);
  const put = (x, y, c) => { g.fillStyle = c; g.fillRect(x * SCALE, y * SCALE, SCALE, SCALE); };
  if (hot) {
    // White glow around the cube...
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (at(x, y)) continue;
      if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) put(x, y, '#ffffff');
    }
    // ...and little click sparkles beside the tip.
    for (const [x, y] of [[9, 0], [10, 0], [8, 1], [9, 1], [22, 0], [23, 0], [23, 1], [24, 1], [2, 6], [3, 6], [29, 6], [30, 6]]) put(x, y, '#ffffff');
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const c = at(x, y);
    if (c) put(x, y, c);
  }
  return canvas.toDataURL('image/png');
}

export const canHover = matchMedia('(hover: hover) and (pointer: fine)').matches;

export function installCursor() {
  const NORMAL = render(false);
  const HOT = render(true);
  const root = document.documentElement.style;
  root.setProperty('--cube-cursor', `url("${NORMAL}") ${HOT_X} ${HOT_Y}, auto`);
  root.setProperty('--cube-cursor-hot', `url("${HOT}") ${HOT_X} ${HOT_Y}, pointer`);

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
  img.style.transformOrigin = `${HOT_X}px ${HOT_Y}px`;
  fx.appendChild(img);
  document.body.appendChild(fx);
  const follow = () => {
    fx.style.transform = `translate(${mouse.x - HOT_X}px, ${mouse.y - HOT_Y}px)`;
    if (fx.classList.contains('show')) requestAnimationFrame(follow);
  };

  return {
    mouse,
    // Offset from the pointer to the middle of the cube (for aiming at it).
    center: { x: N * SCALE / 2 - HOT_X, y: N * SCALE / 2 - HOT_Y },
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
