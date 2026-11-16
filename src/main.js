import './style.css';
import confetti from 'canvas-confetti';
import data from './solutions.json';
import {
  RubiksCube, PALETTE, COLOR_ORDER, holdFor, faceColors, invertMove,
  linear, easeInOutCubic, easeOutBack,
} from './cube3d.js';
import { createStage } from './scene.js';
import { buildTitle, cheer } from './title.js';

const $ = (id) => document.getElementById(id);
const CHARS = Object.keys(data);
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const TOUCH = matchMedia('(hover: none)').matches;
const speed = (ms) => (REDUCED ? 0 : ms);
const sleep = async (ms, alive = () => true) => {
  const end = performance.now() + ms;
  while (performance.now() < end && alive()) await new Promise((r) => setTimeout(r, 40));
};

const cube = new RubiksCube();
const stage = createStage($('cube'), cube);
buildTitle($('title'), data);

const input = $('char');
const entry = $('entry');
const steps = $('steps');
const done = $('done');

// landing → intro → steps → done → (intro → steps → done)* ; home → landing
let mode = 'landing';
let color = 'red';
let job = null; // { ch, entry, hold, colors, step }
let made = 0;
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
  el._t = setTimeout(() => { el.hidden = true; }, 750);
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
  show(done, false);

  job = { ch, entry: data[ch], hold: holdFor(data[ch], color), step: 0 };
  job.colors = faceColors(job.hold.front, job.hold.top);
  renderSteps('reset');
  show(steps, true);

  await loopPromise;
  stage.setSway(0.35);
  const alive = () => mode === 'intro';
  if (!(await cube.solve(speed(80), easeInOutCubic, alive))) return;
  if (!(await cube.reorient(job.hold.front, job.hold.top, speed(420), easeInOutCubic, alive))) return;
  if (!alive()) return;
  stage.pop();
  mode = 'steps';
  renderSteps();
}

// ---------- Step player ----------
const FACE = { U: 'top', D: 'bottom', R: 'right', L: 'left', F: 'front', B: 'back' };
const dot = (c) => `<i class="dot" style="--c:${PALETTE[c]}"></i>`;

function describe(m) {
  const turn = m.endsWith('2') ? '180°' : m.endsWith("'") ? 'counter-clockwise ↺' : 'clockwise ↻';
  return `Turn the <b>${FACE[m[0]]}</b> face ${dot(job.colors[m[0]])} ${turn}`;
}

function renderSteps(phase) {
  const { entry: e, hold, step } = job;
  const n = e.moves.length;
  $('hold').innerHTML = `Hold your solved cube with ${dot(hold.front)}<b>${hold.front}</b> facing you and ${dot(hold.top)}<b>${hold.top}</b> on top`;
  $('goal').innerHTML = e.glyph.join('').split('').map((c) => dot(c === '#' ? hold.letter : hold.bg)).join('');

  const move = $('move');
  if (phase === 'reset') {
    move.innerHTML = '<span class="spinner"></span>';
    $('move-desc').textContent = 'Resetting to a solved cube…';
  } else if (step === 0) {
    move.textContent = '▶';
    const how = TOUCH ? 'Tap <b>next step</b>' : 'Press <kbd>space</kbd>';
    $('move-desc').innerHTML = `Ready to make <b>${job.ch}</b>. ${how} to start.`;
  } else {
    move.textContent = e.moves[step - 1];
    $('move-desc').innerHTML = describe(e.moves[step - 1]);
  }
  move.classList.remove('flip');
  void move.offsetWidth;
  move.classList.add('flip');

  $('chips').innerHTML = e.moves
    .map((m, i) => `<span class="chip ${i < step - 1 ? 'past' : i === step - 1 ? 'now' : ''}">${m}</span>`)
    .join('');
  $('count').textContent = phase === 'reset' ? '' : `${step} / ${n}`;
  $('back').disabled = phase === 'reset' || step === 0;
  $('next').disabled = phase === 'reset';
}

let queued = 0; // presses not yet started
let running = false; // a step animation is playing
async function next() {
  if (mode !== 'steps' || job.step + queued >= job.entry.moves.length) return;
  queued++;
  if (running) return; // the loop below will pick it up
  running = true;
  while (queued > 0) {
    queued--;
    const m = job.entry.moves[job.step];
    job.step++;
    renderSteps();
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
  renderSteps();
  await cube.turn(invertMove(job.entry.moves[job.step]), speed(380), easeInOutCubic);
}

// ---------- Celebration, then offer the next letter ----------
async function celebrate() {
  mode = 'celebrate';
  made++;
  const { letter, bg } = job.hold;
  const colors = [PALETTE[letter], PALETTE[bg], '#ffffff', PALETTE[letter]];
  $('back').disabled = true;
  $('next').disabled = true;

  const ring = $('ring');
  ring.style.setProperty('--c', PALETTE[letter]);
  ring.classList.remove('boom');
  void ring.offsetWidth;
  ring.classList.add('boom');
  cheer($('title'));

  if (!REDUCED) {
    confetti({ particleCount: 140, spread: 100, startVelocity: 48, origin: { y: 0.45 }, colors, zIndex: 50 });
    const end = performance.now() + 1400;
    (function cannons() {
      confetti({ particleCount: 6, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, colors, zIndex: 50 });
      confetti({ particleCount: 6, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors, zIndex: 50 });
      if (performance.now() < end) requestAnimationFrame(cannons);
    })();
  }
  const spin = stage.celebrate();

  show(steps, false);
  $('done-char').textContent = job.ch;
  $('done-char').style.setProperty('--c', PALETTE[letter]);
  $('done-sub').textContent = made === 1 ? '1 character made' : `${made} characters made`;
  show(done, true);

  await spin;
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
  show(done, false);
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
const tap = (id, fn) => $(id).addEventListener('click', (e) => { e.currentTarget.blur(); fn(); });
tap('next', next);
tap('back', back);
tap('home', goHome);
tap('finish', goHome);

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
