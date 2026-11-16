import './style.css';
import data from './solutions.json';
import {
  RubiksCube, PALETTE, COLOR_ORDER, holdFor, invertMove,
  linear, easeInOutCubic, easeOutBack,
} from './cube3d.js';
import { createStage } from './scene.js';
import { buildTitle } from './title.js';
import { createCubeConfetti } from './confetti.js';

const $ = (id) => document.getElementById(id);
const CHARS = Object.keys(data);
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const speed = (ms) => (REDUCED ? 0 : ms);
const sleep = async (ms, alive = () => true) => {
  const end = performance.now() + ms;
  while (performance.now() < end && alive()) await new Promise((r) => setTimeout(r, 40));
};

const cube = new RubiksCube();
const stage = createStage($('cube'), cube);
const confetti = createCubeConfetti($('confetti'));
buildTitle($('title'), data);

const input = $('char');
const entry = $('entry');
const steps = $('steps');
const nextBtn = $('next');

// landing → intro → steps → celebrate → done → (intro → steps → celebrate → done)* ; finish → landing
let mode = 'landing';
let color = 'red';
let job = null; // { ch, entry, hold, step }
let loopToken = 0;
let loopPromise = Promise.resolve();

// ---------- Color swatches ----------
for (const c of COLOR_ORDER) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'swatch';
  b.style.setProperty('--c', PALETTE[c]);
  b.setAttribute('role', 'radio');
  b.setAttribute('aria-label', c);
  b.dataset.color = c;
  b.onclick = () => setColor(c);
  $('swatches').appendChild(b);
}
function setColor(c) {
  color = c;
  document.documentElement.style.setProperty('--accent', PALETTE[c]);
  document.documentElement.style.setProperty('--accent-ink', c === 'white' || c === 'yellow' ? '#111' : '#fff');
  for (const b of $('swatches').children) {
    const on = b.dataset.color === c;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', on);
  }
  if (mode === 'landing') restartLoop();
}
setColor(color);

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
    const hold = holdFor(data[ch], color);
    if (!(await cube.reorient(hold.front, hold.top, speed(140), easeInOutCubic, alive))) return;
    for (const m of data[ch].moves) {
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

// ---------- Sliding panels ----------
function slideOut(el) {
  clearTimeout(el._t);
  el.classList.add('out-left');
  el._t = setTimeout(() => { el.hidden = true; }, 650);
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
    el._t = setTimeout(() => { el.hidden = true; }, 300);
  }
}

function shake() {
  const row = $('form');
  row.classList.remove('shake');
  void row.offsetWidth;
  row.classList.add('shake');
  input.focus();
}

// ---------- Starting a letter ----------
async function start() {
  const ch = input.value.toUpperCase();
  if (!data[ch]) return shake();
  if (mode !== 'landing' && mode !== 'done') return;
  mode = 'intro';
  loopToken++;
  input.blur();
  document.body.classList.add('focus');
  caption('');
  slideOut(entry);

  job = { ch, entry: data[ch], hold: holdFor(data[ch], color), step: 0 };
  nextBtn.disabled = true;
  show(steps, true);

  await loopPromise;
  stage.setSway(0.35);
  const alive = () => mode === 'intro';
  if (!(await cube.solve(speed(80), easeInOutCubic, alive))) return;
  if (!(await cube.reorient(job.hold.front, job.hold.top, speed(420), easeInOutCubic, alive))) return;
  if (!alive()) return;
  stage.pop();
  mode = 'steps';
  nextBtn.disabled = false;
}

// ---------- Step player ----------
let queued = 0; // presses not yet started
let running = false; // a step animation is playing

function press() {
  nextBtn.classList.remove('pressed');
  void nextBtn.offsetWidth;
  nextBtn.classList.add('pressed');
}

async function next() {
  if (mode !== 'steps' || job.step + queued >= job.entry.moves.length) return;
  press();
  queued++;
  if (running) return; // the loop below will pick it up
  running = true;
  while (queued > 0) {
    queued--;
    const m = job.entry.moves[job.step];
    job.step++;
    const rushed = queued > 0;
    await cube.turn(m, speed(rushed ? 170 : 460), rushed ? easeInOutCubic : easeOutBack);
    if (mode !== 'steps') break;
    if (job.step === job.entry.moves.length) {
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
  await cube.turn(invertMove(job.entry.moves[job.step]), speed(380), easeInOutCubic);
}

// ---------- Celebration, then offer the next letter ----------
async function celebrate() {
  mode = 'celebrate';
  nextBtn.disabled = true;
  const { letter, bg } = job.hold;
  if (!REDUCED) {
    const r = $('cube').getBoundingClientRect();
    const colors = [PALETTE[letter], PALETTE[letter], PALETTE[bg], ...COLOR_ORDER.map((c) => PALETTE[c])];
    confetti.burst({ x: r.left + r.width / 2, y: r.top + r.height / 2, colors, count: 160 });
  }
  show(steps, false);
  await stage.celebrate();
  mode = 'done';
  input.value = '';
  slideIn(entry);
  input.focus({ preventScroll: true });
}

function goHome() {
  if (mode === 'landing') return;
  mode = 'landing';
  queued = 0;
  job = null;
  document.body.classList.remove('focus');
  show(steps, false);
  stage.setSway(1);
  input.value = '';
  slideIn(entry);
  restartLoop();
}

// ---------- Input wiring ----------
input.addEventListener('input', () => {
  input.value = input.value.replace(/[^a-z0-9]/gi, '').slice(-1).toUpperCase();
});
$('form').addEventListener('submit', (e) => {
  e.preventDefault();
  start();
});
nextBtn.addEventListener('click', (e) => { e.currentTarget.blur(); next(); });
$('finish').addEventListener('click', (e) => { e.currentTarget.blur(); goHome(); });

document.addEventListener('keydown', (e) => {
  if (e.target.closest?.('button') && (e.key === ' ' || e.key === 'Enter')) return;
  if (mode === 'steps') {
    if (e.code === 'Space' || e.key === 'ArrowRight') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
    else if (e.key === 'Escape') goHome();
    return;
  }
  // Typing a character anywhere on the entry screen goes into the box.
  if ((mode === 'landing' || mode === 'done') && e.target !== input && /^[a-z0-9]$/i.test(e.key) && !e.metaKey && !e.ctrlKey) {
    input.value = e.key.toUpperCase();
    input.focus();
    e.preventDefault();
  }
});

restartLoop();
