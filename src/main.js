import './style.css';
import data from './solutions.json';
import {
  RubiksCube, PALETTE, COLOR_ORDER, holdFor, invertMove,
  linear, easeInOutCubic, easeOutBack,
} from './cube3d.js';
import { createStage } from './scene.js';
import { buildTitle } from './title.js';
import { createPhysics } from './physics3d.js';

const MAX_LEN = 12;
const FACES = 'URFDLB';
const $ = (id) => document.getElementById(id);
const CHARS = Object.keys(data);
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const speed = (ms) => (REDUCED ? 0 : ms);
const sleep = async (ms, alive = () => true) => {
  const end = performance.now() + ms;
  while (performance.now() < end && alive()) await new Promise((r) => setTimeout(r, 40));
};

const cube = new RubiksCube();
const stage = createStage($('cube'), cube, {
  onShatter: (pieces) => {
    physics.shatter(pieces);
    const cx = pieces.reduce((a, p) => a + p.x, 0) / pieces.length;
    const cy = pieces.reduce((a, p) => a + p.y, 0) / pieces.length;
    boom(cx, cy);
  },
});

// Things confetti can land on: the 3D cubes, plus the SPACE button while it's up.
function obstacles() {
  const list = stage.obstacles();
  const steps = $('steps');
  if (!steps.hidden && steps.classList.contains('show')) {
    const r = $('next').getBoundingClientRect();
    list.push([[r.left, r.top], [r.right, r.top], [r.right, r.bottom], [r.left, r.bottom]]);
  }
  return list;
}
const physics = createPhysics({ back: $('physics-back'), front: $('physics-front'), obstacles });
buildTitle($('title'), data, {
  onExplode: (x, y, size, rx, ry) => {
    physics.explode(x, y, size, rx, ry);
    boom(x, y);
  },
});

const input = $('char');
const entry = $('entry');
const steps = $('steps');
const nextBtn = $('next');

// landing → intro → steps → celebrate → (intro → steps → celebrate)* → finale → done
// "done" is the landing page showing off the finished word; a new word starts over.
let mode = 'landing';
let color = 'red'; // letter color
let bgColor = 'white'; // background color
let word = null; // { chars, idx, color, bg }
let job = null; // { ch, hold, moves, step }
let shown = null; // the finished word on the start page: { chars, cubes }
let recolorToken = 0;
let loopToken = 0;
let loopPromise = Promise.resolve();

// ---------- Color swatches: letter color, then background color ----------
function swatchRow(el, onPick) {
  for (const c of COLOR_ORDER) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.style.setProperty('--c', PALETTE[c]);
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', c);
    b.dataset.color = c;
    b.onclick = () => onPick(c);
    el.appendChild(b);
  }
}
swatchRow($('swatches'), (c) => setColors(c, c === bgColor ? color : bgColor));
swatchRow($('swatches-bg'), (c) => { if (c !== color) setColors(color, c); });

function setColors(letter, bg) {
  const changed = letter !== color || bg !== bgColor;
  color = letter;
  bgColor = bg;
  const root = document.documentElement.style;
  root.setProperty('--accent', PALETTE[letter]);
  root.setProperty('--accent-ink', letter === 'white' || letter === 'yellow' ? '#111' : '#fff');
  root.setProperty('--letter', PALETTE[letter]);
  root.setProperty('--letter-bg', PALETTE[bg]);
  for (const [row, pick] of [[$('swatches'), letter], [$('swatches-bg'), bg]]) {
    for (const b of row.children) {
      const on = b.dataset.color === pick;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', on);
    }
  }
  // The background can't match the letter.
  for (const b of $('swatches-bg').children) b.disabled = b.dataset.color === letter;
  if (changed && mode === 'landing') restartLoop();
  if (changed && mode === 'done' && shown) recolorWord();
}

const randomMove = () => FACES[Math.floor(Math.random() * 6)] + ['', "'", '2'][Math.floor(Math.random() * 3)];

// On the start page with a finished word: when the colors change, every cube
// scrambles, solves itself, and re-forms its letter in the new colors, one
// after another. A newer color change cancels the one in progress.
async function recolorWord() {
  const token = ++recolorToken;
  const alive = () => mode === 'done' && token === recolorToken;
  const { chars, cubes } = shown;
  await Promise.all(cubes.map(async (c, i) => {
    await sleep(i * 140, alive);
    if (!alive()) return;
    await c.queue;
    for (let k = 0; k < 8; k++) {
      if (!alive()) return;
      await c.turn(randomMove(), speed(55), linear);
    }
    if (!(await c.solve(speed(38), linear, alive))) return;
    const hold = holdFor(data[chars[i]], color, bgColor);
    if (!(await c.reorient(hold.front, hold.top, speed(220), easeInOutCubic, alive))) return;
    for (const m of hold.moves) {
      if (!alive()) return;
      await c.turn(m, speed(45), linear);
    }
  }));
}
setColors(color, bgColor);

// ---------- Landing: shuffle to a random letter every 3 seconds ----------
async function landingLoop(token) {
  const alive = () => mode === 'landing' && token === loopToken;
  let last = null;
  while (alive()) {
    const start = performance.now();
    let ch;
    do ch = CHARS[Math.floor(Math.random() * CHARS.length)]; while (ch === last);
    last = ch;
    caption('');
    if (!(await cube.solve(speed(34), linear, alive))) return;
    const hold = holdFor(data[ch], color, bgColor);
    if (!(await cube.reorient(hold.front, hold.top, speed(140), easeInOutCubic, alive))) return;
    for (const m of hold.moves) {
      if (!alive()) return;
      await cube.turn(m, speed(34), linear);
    }
    caption(ch);
    stage.pop();
    await sleep(Math.max(1000, 3000 - (performance.now() - start)), alive);
  }
}
function restartLoop() {
  const token = ++loopToken;
  loopPromise = loopPromise.then(() => landingLoop(token));
}

function caption(text) {
  const el = $('caption');
  el.textContent = text;
  el.classList.toggle('show', !!text);
}

// ---------- Little effects ----------
function boom(x, y) {
  const el = document.createElement('div');
  el.className = 'boom';
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.addEventListener('animationend', () => el.remove());
  document.body.appendChild(el);
}

function flash(text) {
  const el = $('flash');
  if (text) {
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
  }
  el.classList.toggle('show', !!text);
}

function slideOut(el) {
  clearTimeout(el._t);
  el.classList.add('out-left');
  el._t = setTimeout(() => { el.hidden = true; }, 700);
}
function slideIn(el) {
  clearTimeout(el._t);
  el.hidden = false;
  el.classList.remove('out-left');
  el.classList.add('from-right');
  void el.offsetWidth;
  el.classList.remove('from-right');
}
function show(el, on) {
  clearTimeout(el._t);
  if (on) {
    el.hidden = false;
    void el.offsetWidth;
    el.classList.add('show');
  } else {
    el.classList.remove('show');
    el._t = setTimeout(() => { el.hidden = true; }, 400);
  }
}

function shake() {
  const row = $('form');
  row.classList.remove('shake');
  void row.offsetWidth;
  row.classList.add('shake');
  input.focus();
}

// ---------- Starting a word ----------
async function start() {
  const text = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, MAX_LEN);
  if (!text) return shake();
  if (mode !== 'landing' && mode !== 'done') return;
  mode = 'intro';
  loopToken++;
  input.blur();
  document.body.classList.add('focus');
  caption('');
  slideOut(entry);
  word = { chars: [...text], idx: 0, color, bg: bgColor };
  shown = null;

  await loopPromise;
  await cube.queue; // let a recolor's current turn finish
  if (stage.hasWord()) {
    document.body.classList.remove('finale');
    await stage.clearWord();
  }
  stage.setSway(0.35);
  beginLetter();
}

// Scramble hard while shaking, then solve back to a clean cube, still shaking
// until it's fully solved.
async function scrambleAndSolve(alive) {
  if (REDUCED) return cube.solve(0);
  stage.setShake(1, 900);
  const end = performance.now() + 2300;
  let last = '';
  while (performance.now() < end) {
    if (!alive()) { stage.setShake(0, 300); return false; }
    let f;
    do f = FACES[Math.floor(Math.random() * 6)]; while (f === last);
    last = f;
    await cube.turn(f + ['', "'", '2'][Math.floor(Math.random() * 3)], 80, linear);
  }
  const solved = await cube.solve(55, easeInOutCubic, alive);
  stage.setShake(0, solved ? 500 : 300);
  return solved;
}

async function beginLetter() {
  mode = 'intro';
  const ch = word.chars[word.idx];
  const hold = holdFor(data[ch], word.color, word.bg);
  const myJob = { ch, hold, moves: hold.moves, step: 0 };
  job = myJob;
  const alive = () => mode === 'intro' && job === myJob;
  nextBtn.disabled = true;
  show(steps, true);
  flash(ch);

  if (!(await scrambleAndSolve(alive))) return;
  if (!(await cube.reorient(hold.front, hold.top, speed(420), easeInOutCubic, alive))) return;
  if (!alive()) return;
  flash('');
  stage.pop();
  mode = 'steps';
  nextBtn.disabled = false;
  if (myJob.finish) finishLetter();
}

// ---------- Step player ----------
let queued = 0; // presses not yet started
let running = false; // a step animation is playing

function press() {
  nextBtn.classList.remove('pressed');
  void nextBtn.offsetWidth;
  nextBtn.classList.add('pressed');
}

function next() {
  if (mode !== 'steps' || job.step + queued >= job.moves.length) return;
  press();
  queued++;
  if (!running) runQueue();
}

// Enter (not shown anywhere in the UI): play every remaining move quickly.
function finishLetter() {
  if (!job) return;
  if (mode === 'intro') { job.finish = true; return; } // do it as soon as it's ready
  if (mode !== 'steps') return;
  job.rush = true;
  queued = job.moves.length - job.step;
  if (!running) runQueue();
}

async function runQueue() {
  running = true;
  while (queued > 0) {
    queued--;
    const m = job.moves[job.step];
    job.step++;
    const rushed = queued > 0;
    const ms = job.rush ? 95 : rushed ? 170 : 460;
    await cube.turn(m, speed(ms), job.rush ? linear : rushed ? easeInOutCubic : easeOutBack);
    if (mode !== 'steps') break;
    if (job.step === job.moves.length) {
      queued = 0;
      running = false;
      return celebrate();
    }
  }
  running = false;
}

async function back() {
  if (mode !== 'steps' || running || job.step === 0) return;
  job.step--;
  await cube.turn(invertMove(job.moves[job.step]), speed(380), easeInOutCubic);
}

// ---------- Celebration, then the next letter (or the finale) ----------
async function celebrate() {
  mode = 'celebrate';
  nextBtn.disabled = true; // stays on screen (greyed out) so confetti can land on it
  // The last letter saves its confetti for the start page with the word on it.
  const last = word.idx === word.chars.length - 1;
  if (!REDUCED && !last) physics.confetti(110);
  await stage.celebrate();
  if (mode !== 'celebrate') return;
  word.idx++;
  if (word.idx < word.chars.length) return beginLetter();
  return finale();
}

// The main cube slides into place as the last letter, the earlier letters drop
// in beside it, and the page turns back into the landing page showing the word.
async function finale() {
  mode = 'finale';
  show(steps, false);
  document.body.classList.add('finale');
  const earlier = [];
  for (const ch of word.chars.slice(0, -1)) {
    const c = new RubiksCube();
    const hold = holdFor(data[ch], word.color, word.bg);
    await c.reorient(hold.front, hold.top);
    for (const m of hold.moves) await c.turn(m);
    earlier.push(c);
  }
  await stage.showWord(earlier);
  if (mode !== 'finale') return;
  shown = { chars: word.chars, cubes: [...earlier, cube] };
  mode = 'done';
  document.body.classList.remove('focus');
  input.value = '';
  slideIn(entry);
  input.focus({ preventScroll: true });
  // The one big celebration, once the word is showing on the start page.
  if (!REDUCED) setTimeout(() => physics.confetti(170), 350);
}

// Esc during a word: back to the plain landing page.
function goHome() {
  if (mode === 'landing' || mode === 'done' || mode === 'finale') return;
  mode = 'landing';
  queued = 0;
  job = null;
  word = null;
  flash('');
  document.body.classList.remove('focus');
  show(steps, false);
  stage.setShake(0, 200);
  stage.setSway(1);
  input.value = '';
  slideIn(entry);
  restartLoop();
}

// ---------- Input wiring ----------
input.addEventListener('input', () => {
  input.value = input.value.replace(/[^a-z0-9]/gi, '').slice(0, MAX_LEN).toUpperCase();
});
$('form').addEventListener('submit', (e) => {
  e.preventDefault();
  start();
});
nextBtn.addEventListener('click', (e) => { e.currentTarget.blur(); next(); });

document.addEventListener('keydown', (e) => {
  if (e.target.closest?.('button') && (e.key === ' ' || e.key === 'Enter')) return;
  if (mode === 'steps' || mode === 'intro' || mode === 'celebrate') {
    if (e.code === 'Space' || e.key === 'ArrowRight') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
    else if (e.key === 'Enter') { e.preventDefault(); finishLetter(); }
    else if (e.key === 'Escape') goHome();
    return;
  }
  // Typing anywhere on the entry screen goes into the box.
  if ((mode === 'landing' || mode === 'done') && e.target !== input && /^[a-z0-9]$/i.test(e.key) && !e.metaKey && !e.ctrlKey) {
    input.value = (input.value + e.key.toUpperCase()).slice(0, MAX_LEN);
    input.focus();
    e.preventDefault();
  }
});

restartLoop();
