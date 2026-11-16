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
const stage = createStage($('cube'), cube);
const physics = createPhysics($('physics'));
buildTitle($('title'), data, {
  onExplode: (x, y, size) => {
    physics.explode(x, y, size);
    boom(x, y);
  },
});

const input = $('char');
const entry = $('entry');
const steps = $('steps');
const nextBtn = $('next');

// landing → intro → steps → celebrate → (intro → steps → celebrate)* → finale → done
// done → (new word) intro ... ; "I'm done" / Esc → landing
let mode = 'landing';
let color = 'red';
let word = null; // { chars, idx, color }
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
  word = { chars: [...text], idx: 0, color };

  await loopPromise;
  if (stage.hasWord()) {
    document.body.classList.remove('finale');
    await stage.clearWord();
  }
  stage.setSway(0.35);
  beginLetter();
}

// Scramble hard while shaking, then solve back to a clean cube.
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
  stage.setShake(0, 700);
  return cube.solve(55, easeInOutCubic, alive);
}

async function beginLetter() {
  mode = 'intro';
  const ch = word.chars[word.idx];
  const myJob = { ch, entry: data[ch], hold: holdFor(data[ch], word.color), step: 0 };
  job = myJob;
  const alive = () => mode === 'intro' && job === myJob;
  nextBtn.disabled = true;
  show(steps, true);
  flash(ch);

  if (!(await scrambleAndSolve(alive))) return;
  if (!(await cube.reorient(myJob.hold.front, myJob.hold.top, speed(420), easeInOutCubic, alive))) return;
  if (!alive()) return;
  flash('');
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

function cubeCenter() {
  const r = $('cube').getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2, r];
}

// ---------- Celebration, then the next letter (or the finale) ----------
async function celebrate() {
  mode = 'celebrate';
  nextBtn.disabled = true;
  show(steps, false);
  const [x, y] = cubeCenter();
  if (!REDUCED) physics.confetti(x, y, 80);
  await stage.celebrate();
  if (mode !== 'celebrate') return;
  word.idx++;
  if (word.idx < word.chars.length) return beginLetter();
  return finale();
}

async function finale() {
  mode = 'finale';
  document.body.classList.add('finale');
  const cubes = [];
  for (const ch of word.chars) {
    const c = new RubiksCube();
    const hold = holdFor(data[ch], word.color);
    await c.reorient(hold.front, hold.top);
    for (const m of data[ch].moves) await c.turn(m);
    cubes.push(c);
  }
  await stage.showWord(cubes);
  if (mode !== 'finale') return;
  if (!REDUCED) {
    const [, , r] = cubeCenter();
    for (const f of [0.2, 0.5, 0.8]) physics.confetti(r.left + r.width * f, r.top + r.height * 0.4, 45, f === 0.5);
  }
  mode = 'done';
  input.value = '';
  slideIn(entry);
  input.focus({ preventScroll: true });
}

async function goHome() {
  if (mode === 'landing') return;
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
  if (stage.hasWord()) {
    document.body.classList.remove('finale');
    await stage.clearWord();
  }
  if (mode === 'landing') restartLoop();
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
$('finish').addEventListener('click', (e) => { e.currentTarget.blur(); goHome(); });

document.addEventListener('keydown', (e) => {
  if (e.target.closest?.('button') && (e.key === ' ' || e.key === 'Enter')) return;
  if (mode === 'steps' || mode === 'intro' || mode === 'celebrate') {
    if (e.code === 'Space' || e.key === 'ArrowRight') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
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
