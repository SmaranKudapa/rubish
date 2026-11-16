import './style.css';
import data from './solutions.json';
import {
  RubiksCube, PALETTE, COLOR_ORDER, holdFor, invertMove,
  linear, easeInOutCubic, easeOutBack,
} from './cube3d.js';
import { createStage, tween } from './scene.js';
import { buildTitle } from './title.js';
import { createPhysics } from './physics3d.js';
import { sfx, isMuted, setMuted, audioRunning, waitForAudio } from './audio.js';
import { createBackdrop } from './backdrop.js';
import { installCursor, canHover } from './cursor.js';
import { createAchievements, iconURL } from './achievements.js';
import { runNuke } from './nuke.js';
import { robotArm, zapButton } from './arm.js';
import { createParty } from './party.js';

const MAX_LEN = 12;
const FACES = 'URFDLB';
const $ = (id) => document.getElementById(id);
const CHARS = Object.keys(data).filter((c) => /^[A-Z]$/.test(c)); // letters only
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const speed = (ms) => (REDUCED ? 0 : ms);
const sleep = async (ms, alive = () => true) => {
  const end = performance.now() + ms;
  while (performance.now() < end && alive()) await new Promise((r) => setTimeout(r, 40));
};

const cursor = installCursor();
$('ach-btn-icon').src = iconURL('trophy');
const ach = createAchievements({
  button: $('ach-btn'), panel: $('ach-panel'), list: $('ach-list'),
  count: $('ach-count'), close: $('ach-close'), toast: $('toast'), sound: sfx,
});
RubiksCube.onTurn = (duration) => sfx.turn(duration);
const cube = new RubiksCube();
const stage = createStage($('cube'), cube, {
  onShatter: (pieces, { byZoom } = {}) => {
    physics.shatter(pieces);
    sfx.explode();
    if (byZoom) {
      ach.unlock('kaboom');
      // NON CUBER: five zoom-booms in a row while learning a letter.
      if (mode === 'steps' || mode === 'intro') {
        zoomStreak++;
        if (zoomStreak >= 5) ach.unlock('non-cuber');
      }
    }
    const cx = pieces.reduce((a, p) => a + p.x, 0) / pieces.length;
    const cy = pieces.reduce((a, p) => a + p.y, 0) / pieces.length;
    boom(cx, cy);
  },
  sound: sfx,
});

// Things confetti can land on: the 3D cubes, the SPACE button while it's up,
// and the word box and > button while they're on screen.
const rectPoly = (el) => {
  const r = el.getBoundingClientRect();
  return [[r.left, r.top], [r.right, r.top], [r.right, r.bottom], [r.left, r.bottom]];
};
function obstacles() {
  const list = stage.obstacles();
  const steps = $('steps');
  if (!steps.hidden && steps.classList.contains('show')) list.push(rectPoly($('next')));
  const entry = $('entry');
  if (!entry.hidden && !entry.classList.contains('out-left') && !entry.classList.contains('from-right')) {
    list.push(rectPoly($('char')), rectPoly($('go')));
  }
  return list;
}
const physics = createPhysics({ back: $('physics-back'), front: $('physics-front'), obstacles, sound: sfx, onDuplicate: () => ach.unlock('copycat') });
createBackdrop($('backdrop'), physics);
if (import.meta.env.DEV) window.__rubish = { physics }; // handy for poking at it in dev
const title = buildTitle($('title'), data, {
  onExplode: (x, y, size, rx, ry) => {
    physics.explode(x, y, size, rx, ry);
    boom(x, y);
    sfx.explode();
  },
  sound: sfx,
});

const input = $('char');
const entry = $('entry');
const steps = $('steps');
const nextBtn = $('next');
const solveBtn = $('solve');

// opening → landing → intro → steps → celebrate → (intro → steps → celebrate)* → finale → done
// "done" is the landing page showing off the finished word; a new word starts over.
let mode = 'opening';
let color = 'red'; // letter color
let bgColor = 'white'; // background color
let word = null; // { chars, idx, color, bg }
let job = null; // { ch, hold, moves, step }
let shown = null; // the finished word on the start page: { chars, cubes }
let solving = null; // SOLVE after a word: { chars, cubes, idx, auto }
let recolorToken = 0;
let zoomStreak = 0; // zoom-booms in a row during the current letter (NON CUBER)
let loopToken = 0;
let loopPromise = Promise.resolve();

// ---------- Color swatches: letter color, then background color ----------
// The squares double as a little keyboard: top row C D E F G A, bottom row
// B C D E F G an octave up. Playing the start of a certain tune unlocks a secret.
const NOTES_TOP = [60, 62, 64, 65, 67, 69];
const NOTES_BOTTOM = [71, 72, 74, 76, 77, 79];
// Happy Birthday: [MIDI note, beats]. Every note is on one of the squares.
const SONG = [
  [67, 0.75], [67, 0.25], [69, 1], [67, 1], [72, 1], [71, 2],
  [67, 0.75], [67, 0.25], [69, 1], [67, 1], [74, 1], [72, 2],
  [67, 0.75], [67, 0.25], [79, 1], [76, 1], [72, 1], [71, 1], [69, 2],
  [77, 0.75], [77, 0.25], [76, 1], [72, 1], [74, 1], [72, 3],
];
const CUE = 5; // play the first 5 notes and the squares play the rest themselves
const BEAT = 430; // ms
const played = [];
let singing = false;
function playNote(n) {
  sfx.note(n);
  if (singing) return;
  played.push(n);
  if (played.length > CUE) played.shift();
  if (played.length === CUE && played.every((v, i) => v === SONG[i][0])) {
    played.length = 0;
    ach.unlock('birthday');
    sing();
  }
}

// The rest of the song plays itself on the squares (each one presses down as
// its note plays), and the party starts: candles on every cube, balloons.
const birthday = createParty({ stage, physics, sound: sfx });
async function sing() {
  if (mode === 'nuke') return;
  singing = true;
  birthday.light();
  const swatchFor = (n) => {
    const i = NOTES_TOP.indexOf(n);
    return i >= 0 ? $('swatches').children[i] : $('swatches-bg').children[NOTES_BOTTOM.indexOf(n)];
  };
  await new Promise((r) => setTimeout(r, SONG[CUE - 1][1] * BEAT)); // let the 5th note ring
  for (const [n, beats] of SONG.slice(CUE)) {
    if (mode === 'nuke') break;
    const ms = beats * BEAT;
    sfx.note(n, Math.min(1.2, (ms / 1000) * 0.9));
    const sw = swatchFor(n);
    sw?.classList.add('auto-press');
    setTimeout(() => sw?.classList.remove('auto-press'), Math.min(ms - 40, 260));
    await new Promise((r) => setTimeout(r, ms));
  }
  singing = false;
}

function swatchRow(el, notes, onPick) {
  for (const c of COLOR_ORDER) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.style.setProperty('--c', PALETTE[c]);
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', c);
    b.dataset.color = c;
    // React on press, not on click: the square jumps down when pressed, so a
    // press near its edge could end with the pointer off it, and then the
    // browser never sends a click (no note, no color). Keyboard presses
    // (Enter / Space) still come through as clicks with no pointer behind them.
    const press = () => { playNote(notes[COLOR_ORDER.indexOf(c)]); onPick(c); };
    b.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      press();
    });
    b.addEventListener('click', (e) => { if (e.detail === 0) press(); });
    el.appendChild(b);
  }
}
swatchRow($('swatches'), NOTES_TOP, (c) => setColors(c, c === bgColor ? color : bgColor));
swatchRow($('swatches-bg'), NOTES_BOTTOM, (c) => { if (c !== color) setColors(color, c); });

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
// delay: let the start page sit still for a moment first (coming back home).
function restartLoop(delay = 0) {
  const token = ++loopToken;
  const alive = () => mode === 'landing' && token === loopToken;
  loopPromise = loopPromise
    .then(() => (delay ? sleep(delay, alive) : null))
    .then(() => landingLoop(token));
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
  sfx.error();
  const row = $('form');
  row.classList.remove('shake');
  void row.offsetWidth;
  row.classList.add('shake');
  input.focus();
}

// ---------- Starting a word ----------
// auto = true (Shift+Enter): play every letter of the word by itself.
async function start(auto = false) {
  const text = input.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, MAX_LEN);
  if (!text) return shake();
  if (mode !== 'landing' && mode !== 'done') return;
  if (text === 'NUKE') return launchNuke(); // easter egg
  if (text === 'MUTE' || text === 'UNMUTE') return armSound(text === 'MUTE');
  mode = 'intro';
  solveBtn.hidden = true;
  loopToken++;
  birthday.clearStage();
  input.blur();
  document.body.classList.add('focus');
  caption('');
  slideOut(entry);
  const myWord = { chars: [...text], idx: 0, color, bg: bgColor, auto };
  word = myWord;
  sfx.submit();
  shown = null;

  await loopPromise;
  await cube.queue; // let a recolor's current turn finish
  if (stage.hasWord()) {
    document.body.classList.remove('finale');
    await stage.clearWord();
  }
  if (word !== myWord || mode !== 'intro') return; // Esc'd home while getting ready
  stage.setSway(0.35);
  beginLetter();
}

// ---------- MUTE / UNMUTE typed in: a robot arm presses the sound button ----------
let arming = false;
async function armSound(mute) {
  if (arming) return;
  arming = true;
  input.value = '';
  const btn = $('mute');
  const press = () => {
    setMuted(mute);
    showMute();
    zapButton(btn, mute ? 'MUTED' : 'SOUND ON');
    if (mute) ach.unlock('silencer');
  };
  // The arm grows out of the right face's center piece of the rightmost cube
  // on stage (the big cubes in the middle of the screen), if there is one.
  const from = stage.rightmostCube();
  if (from && !REDUCED) {
    const b = btn.getBoundingClientRect();
    await robotArm({
      stage, cube: from,
      to: { x: b.left + b.width / 2, y: b.top + b.height / 2 },
      physics, sound: sfx, onPress: press,
    });
  } else {
    press();
  }
  arming = false;
}

// ---------- NUKE (type NUKE and submit) ----------
async function launchNuke() {
  mode = 'nuke';
  loopToken++; // stop the landing shuffle
  recolorToken++;
  // Lock NUKE into the word box: no more editing.
  input.value = 'NUKE';
  input.readOnly = true;
  input.classList.add('locked');
  input.blur();
  caption('');
  const uiEls = [
    ...document.querySelectorAll('#swatches .swatch, #swatches-bg .swatch'),
    $('char'), $('go'), $('mute'), $('caption'), solveBtn,
  ];
  await runNuke({ stage, physics, title, uiEls, input, target: $('ach-btn'), data, sound: sfx, canHover, onImpact: () => ach.unlock('nuke') });
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
    sfx.shake();
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
  const myJob = { ch, hold, moves: hold.moves, step: 0, finish: !!word.auto };
  zoomStreak = 0; // new letter, new streak
  job = myJob;
  const alive = () => mode === 'intro' && job === myJob;
  nextBtn.disabled = true;
  show(steps, true);
  // A new letter: both hints are back (Enter stays gone if it's auto-finishing).
  showHint($('leave'));
  if (!myJob.finish) showHint($('skip'));
  flash(ch);

  if (!(await scrambleAndSolve(alive))) return;
  if (!(await cube.reorient(hold.front, hold.top, speed(420), easeInOutCubic, alive))) return;
  if (!alive()) return;
  stage.pop(); // the big letter stays up for this letter's whole run
  mode = 'steps';
  nextBtn.disabled = false;
  if (myJob.finish) finishLetter();
}

// ---------- Enter / Esc hints ----------
// Pressing Enter or Esc (or clicking its hint): the key chip breaks out of the
// hint and gets tossed into the cube, and the rest of the hint fades away. It
// stays gone until the next letter or cube brings the hints back.
// Returns a promise that resolves once the chip is in the cube (right away if
// it's already gone), so what the key does only happens then.
function tossKey(btn, label = null) {
  if (btn.classList.contains('tossed') || btn.classList.contains('tossing') || btn.closest('[hidden]')) {
    return btn._landed || Promise.resolve();
  }
  const src = btn.querySelector('kbd') || btn.querySelector('span') || btn;
  const r = src.getBoundingClientRect();
  btn.classList.remove('hint-in');
  if (REDUCED || !r.width) {
    btn.classList.add('tossed');
    return (btn._landed = Promise.resolve());
  }
  // The chip lifts out of the hint; the rest of it ("to skip") stays until the chip jumps off.
  btn.classList.add('tossing');
  const chip = document.createElement('div');
  chip.className = 'kbd-toss';
  chip.textContent = src.textContent;
  Object.assign(chip.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  document.body.appendChild(chip);
  const c = $('cube').getBoundingClientRect();
  let x0 = r.left + r.width / 2;
  const y0 = r.top + r.height / 2;
  const x1 = c.left + c.width / 2, y1 = c.top + c.height / 2;
  const lift = 110 + Math.abs(y0 - y1) * 0.35; // how high it arcs above the straight line
  const spin = (Math.random() < 0.5 ? -1 : 1) * (420 + Math.random() * 300);
  // A label (Shift+Enter): the chip first struggles to stretch out to show it,
  // growing to the left (its right edge stays put, so "to skip" stays readable).
  const w0 = r.width, right = r.right;
  let w1 = w0;
  if (label) {
    chip.textContent = label;
    chip.style.width = 'auto';
    w1 = Math.max(w0, chip.offsetWidth + 4);
    chip.style.width = `${w0}px`;
  }
  const STRETCH = label ? 2000 : 0, CROUCH = 100, FLY = 740;
  const TOTAL = STRETCH + CROUCH + FLY;
  const PREP = (STRETCH + CROUCH) / TOTAL;
  const PULL = 0.86; // most of the stretch is the struggle; then it snaps open
  let launched = false, snapped = false;
  if (label) sfx.stretch(STRETCH * PULL / 1000);
  return (btn._landed = tween(TOTAL, (_, t) => {
    const ms = t * TOTAL;
    if (ms < STRETCH) {
      const p = ms / STRETCH;
      let e, strain;
      if (p < PULL) {
        // Heaving in jerky pulls that slip back a little each time, getting
        // most of the way there, trembling harder and harder.
        const q = p / PULL;
        e = 0.78 * (q + 0.05 * (1 + Math.sin(8 * Math.PI * q - Math.PI / 2)));
        strain = q;
      } else {
        // ...and then it gives: snaps the rest of the way out.
        if (!snapped) { snapped = true; sfx.snap(); }
        e = 0.78 + 0.22 * easeOutBack((p - PULL) / (1 - PULL));
        strain = 0;
      }
      const w = w0 + (w1 - w0) * e;
      chip.style.width = `${w}px`;
      chip.style.left = `${right - w}px`;
      const shake = 3.2 * strain * (0.35 + strain);
      const jx = (Math.random() - 0.5) * shake, jy = (Math.random() - 0.5) * shake * 0.6;
      // Thins out as it's pulled, and flushes a little pink from the effort.
      chip.style.transform = `translate(${jx}px, ${jy}px) scale(1, ${1 - 0.22 * strain * Math.min(1, e / 0.78)})`;
      const flush = Math.round(60 * strain);
      chip.style.background = `rgb(255, ${255 - flush}, ${255 - flush})`;
      return;
    }
    if (t < PREP) {
      const p = Math.sin(((ms - STRETCH) / CROUCH) * Math.PI / 2);
      chip.style.width = `${w1}px`;
      chip.style.left = `${right - w1}px`;
      chip.style.background = '';
      x0 = right - w1 / 2; // fly from wherever its middle ended up
      chip.style.transform = `translateY(${p * 3}px) scale(${1 + 0.32 * p}, ${1 - 0.4 * p})`;
      return;
    }
    if (!launched) {
      // Jumps out: a little impact where it left from, and the rest of the hint goes.
      launched = true;
      btn.classList.add('tossed');
      btn.classList.remove('tossing');
      impactFx(x0, y0, { size: 0.8, shards: 6, reach: 26 });
      const row = btn.parentElement;
      row.classList.remove('knock');
      void row.offsetWidth;
      row.classList.add('knock');
      sfx.pop();
      sfx.whoosh();
    }
    const u = (t - PREP) / (1 - PREP);
    const x = x0 + (x1 - x0) * u;
    const y = y0 + (y1 - y0) * u * u - Math.sin(Math.PI * u) * lift; // up, then down into the cube
    const s = (1 + 0.5 * Math.sin(Math.PI * u)) * (1 - 0.8 * u ** 3); // swells mid-air, shrinks into it
    const stretch = 1 + 0.35 * Math.exp(-7 * u); // stretched tall as it springs off
    chip.style.transform = `translate(${x - x0}px, ${y - y0}px) rotate(${spin * u}deg) scale(${s / stretch}, ${s * stretch})`;
  }, linear).then(() => {
    // Slams into the cube and bursts into pieces of cube confetti.
    chip.remove();
    impactFx(x1, y1, { size: 2.4, shards: 0 });
    if (!REDUCED) physics.burst(x1, y1, 'white', label ? 22 : 14); // white, like the chip
    stage.punch(1);
    sfx.impact();
  }));
}

// A pixel shockwave (a square ring) and a spray of little shards at (x, y).
function impactFx(x, y, { size = 1, shards = 8, reach = 60 } = {}) {
  if (REDUCED) return;
  const add = (cls, css) => {
    const el = document.createElement('div');
    el.className = cls;
    el.style.cssText = css;
    el.addEventListener('animationend', () => el.remove());
    document.body.appendChild(el);
  };
  add('impact-ring', `left:${x}px;top:${y}px;--s:${size}`);
  if (size > 1.5) add('impact-ring late', `left:${x}px;top:${y}px;--s:${size * 1.5}`);
  for (let i = 0; i < shards; i++) {
    const a = (i / shards) * Math.PI * 2 + Math.random() * 0.5;
    const d = reach * (0.6 + Math.random() * 0.6);
    const px = Math.round(4 + Math.random() * 3 * Math.min(size, 1.6));
    add('impact-shard', `left:${x}px;top:${y}px;width:${px}px;height:${px}px;`
      + `--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(Math.sin(a) * d).toFixed(0)}px;--r:${Math.round((Math.random() - 0.5) * 400)}deg`);
  }
}
// A new letter or cube: the hint pops back in.
function showHint(btn) {
  if (!btn.classList.contains('tossed') && !btn.classList.contains('tossing')) return;
  btn._landed = null;
  btn.classList.remove('tossed', 'tossing');
  btn.classList.remove('hint-in');
  void btn.offsetWidth;
  btn.classList.add('hint-in');
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
  sfx.step();
  zoomStreak = 0; // took a step: the streak is broken
  queued++;
  if (!running) runQueue();
}

// Enter (not shown anywhere in the UI): play every remaining move quickly.
// label: Shift+Enter stretches the chip out to say so before it's tossed.
function finishLetter(label = null) {
  if (!job || (mode !== 'intro' && mode !== 'steps')) return;
  const j = job;
  // Nothing happens until the ENTER chip lands in the cube.
  tossKey($('skip'), label).then(() => {
    if (job !== j) return;
    if (mode === 'intro') { j.finish = true; return; } // do it as soon as it's ready
    if (mode !== 'steps' || j.rush) return;
    sfx.whoosh();
    j.rush = true;
    queued = j.moves.length - j.step;
    if (!running) runQueue();
  });
}

async function runQueue() {
  running = true;
  while (queued > 0) {
    queued--;
    const m = job.moves[job.step];
    job.step++;
    const rushed = queued > 0;
    const ms = job.rush ? 95 : rushed ? 170 : 460;
    caption(m); // name the move in the landing page's caption box
    await (job.cube || cube).turn(m, speed(ms), job.rush ? linear : rushed ? easeInOutCubic : easeOutBack);
    if (mode !== 'steps') break;
    if (job.step === job.moves.length) {
      queued = 0;
      running = false;
      return job.solving ? cubeSolved() : celebrate();
    }
  }
  running = false;
}

async function back() {
  if (mode !== 'steps' || running || job.step === 0) return;
  job.step--;
  const m = invertMove(job.moves[job.step]);
  caption(m);
  await (job.cube || cube).turn(m, speed(380), easeInOutCubic);
}

// ---------- Celebration, then the next letter (or the finale) ----------
async function celebrate() {
  mode = 'celebrate';
  caption('');
  nextBtn.disabled = true; // stays on screen (greyed out) so confetti can land on it
  // The last letter saves its confetti for the start page with the word on it.
  const last = word.idx === word.chars.length - 1;
  if (!REDUCED && !last) physics.confetti(110);
  if (!last) sfx.celebrate();
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
  flash('');
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
  setTimeout(() => ach.unlock('first-word'), 900);
  sfx.fanfare();
  solveBtn.hidden = false;
}

// ---------- SOLVE: walk through solving each cube of the finished word ----------
// Same step player as the letters: each cube's moves are its recorded moves
// undone, last first. Then confetti, and back to the plain landing page.
async function startSolve() {
  if (mode !== 'done' || !shown) return;
  mode = 'intro';
  recolorToken++; // stop any recolor in progress
  solveBtn.hidden = true;
  input.blur();
  document.body.classList.add('focus');
  slideOut(entry);
  word = null;
  const s = { chars: shown.chars, cubes: shown.cubes, order: [], pos: 0, auto: false };
  solving = s;
  sfx.submit();
  nextBtn.disabled = true;
  show(steps, true);
  showHint($('leave'));
  await Promise.all(s.cubes.map((c) => c.queue)); // let any turn in flight finish
  if (solving !== s) return;
  // The cubes to solve, left to right (skipping solved or blown-up ones).
  const onStage = stage.cubes();
  s.order = s.cubes.map((c, i) => i).filter((i) => s.cubes[i].history.length && onStage.includes(s.cubes[i]));
  if (!s.order.length) return solvedAll();
  await stage.soloStart(s.order[0]); // just the first cube, in the middle
  if (solving === s) solveNext();
}

async function solveNext() {
  const s = solving;
  if (!s) return;
  if (s.pos >= s.order.length) return solvedAll();
  mode = 'intro';
  const idx = s.order[s.pos];
  const c = s.cubes[idx];
  const myJob = {
    ch: s.chars[idx], cube: c, moves: [...c.history].reverse().map(invertMove),
    step: 0, finish: s.auto, solving: true,
  };
  job = myJob;
  zoomStreak = 0;
  caption('');
  nextBtn.disabled = true;
  // A new cube: both hints are back (Enter stays gone if it's auto-finishing).
  showHint($('leave'));
  if (!myJob.finish) showHint($('skip'));
  const alive = () => mode === 'intro' && job === myJob;
  // The next cube comes in from the right and knocks the solved one off.
  if (s.pos > 0) await stage.soloNext(idx, () => sfx.thud());
  if (!alive()) return;
  flash(myJob.ch);
  await sleep(speed(500), alive);
  if (!alive()) return;
  mode = 'steps';
  nextBtn.disabled = false;
  if (myJob.finish) finishLetter();
}

// One cube solved: a little pop, then on to the next.
async function cubeSolved() {
  mode = 'celebrate';
  const s = solving;
  caption('');
  nextBtn.disabled = true;
  sfx.blip(4);
  await stage.popSlot(s.order[s.pos]);
  if (mode !== 'celebrate' || solving !== s) return;
  s.pos++;
  solveNext();
}

// Every cube solved: confetti, then the word clears and the landing page's
// shuffling cube comes back.
async function solvedAll() {
  mode = 'celebrate';
  const s = solving;
  flash('');
  caption('');
  show(steps, false);
  if (!REDUCED) physics.confetti(170);
  sfx.fanfare();
  await sleep(speed(1800), () => mode === 'celebrate' && solving === s);
  if (mode !== 'celebrate' || solving !== s) return;
  solving = null;
  shown = null;
  job = null;
  document.body.classList.remove('focus', 'finale');
  await stage.clearWord();
  if (mode !== 'celebrate') return; // Esc'd home meanwhile
  mode = 'landing';
  stage.setSway(1);
  input.value = '';
  slideIn(entry);
  input.focus({ preventScroll: true });
  restartLoop(2000); // home again: sit still for 2 seconds before shuffling
}

// Esc during a word: back to the plain landing page.
let leaving = false;
function goHome() {
  if (mode === 'landing' || mode === 'done' || mode === 'finale' || leaving) return;
  // Nothing happens until the ESC chip lands in the cube.
  leaving = true;
  tossKey($('leave')).then(() => {
    leaving = false;
    leaveNow();
  });
}
function leaveNow() {
  if (mode === 'landing' || mode === 'done' || mode === 'finale') return; // the word ended meanwhile
  mode = 'landing';
  queued = 0;
  job = null;
  word = null;
  flash('');
  caption('');
  document.body.classList.remove('focus');
  // Esc while solving a finished word: clear the word off the stage first.
  if (solving || stage.hasWord()) {
    solving = null;
    shown = null;
    solveBtn.hidden = true;
    document.body.classList.remove('finale');
    loopPromise = loopPromise.then(() => stage.clearWord());
  }
  show(steps, false);
  stage.setShake(0, 200);
  stage.setSway(1);
  input.value = '';
  slideIn(entry);
  restartLoop(2000); // home again: sit still for 2 seconds before shuffling
}

// ---------- Input wiring ----------
input.addEventListener('input', () => {
  input.value = input.value.replace(/[^a-z]/gi, '').slice(0, MAX_LEN).toUpperCase();
});
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.shiftKey) { // Shift+Enter: start and auto-play the whole word
    e.preventDefault();
    start(true);
  }
});
$('form').addEventListener('submit', (e) => {
  e.preventDefault();
  start();
});
nextBtn.addEventListener('click', (e) => { e.currentTarget.blur(); next(); });
solveBtn.addEventListener('click', (e) => { e.currentTarget.blur(); startSolve(); });
// 'Enter to skip' hint under the button; tapping it does the same (handy on phones).
$('skip').addEventListener('click', (e) => { e.currentTarget.blur(); finishLetter(); });
if (!canHover) $('skip').innerHTML = '<span>tap to skip</span>';
// 'Esc to leave' beside it: back to the start page (same as pressing Esc).
$('leave').addEventListener('click', (e) => { e.currentTarget.blur(); goHome(); });
if (!canHover) $('leave').innerHTML = '<span>tap to leave</span>';

document.addEventListener('keydown', (e) => {
  if (ach.isOpen()) return; // the achievements menu handles its own keys
  if (e.target.closest?.('button') && (e.key === ' ' || e.key === 'Enter')) return;
  if (mode === 'steps' || mode === 'intro' || mode === 'celebrate') {
    if (e.code === 'Space' || e.key === 'ArrowRight') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey && word) word.auto = true; // Shift+Enter: finish the rest of the word too
      if (e.shiftKey && solving) solving.auto = true; // ...or solve every remaining cube
      finishLetter(e.shiftKey ? 'shift + enter' : null);
    }
    else if (e.key === 'Escape') goHome();
    return;
  }
  // Typing anywhere on the entry screen goes into the box.
  if ((mode === 'landing' || mode === 'done') && e.target !== input && /^[a-z]$/i.test(e.key) && !e.metaKey && !e.ctrlKey) {
    input.value = (input.value + e.key.toUpperCase()).slice(0, MAX_LEN);
    input.focus();
    e.preventDefault();
  }
});

// ---------- Sound on/off (button on the start pages, M key during a word) ----------
const muteBtn = $('mute');
function showMute() {
  // Pixel-art speaker: sound waves when on, an X when muted.
  const body = '<rect x="1" y="6" width="3" height="4"/><rect x="4" y="5" width="1" height="6"/><rect x="5" y="4" width="1" height="8"/><rect x="6" y="3" width="1" height="10"/><rect x="7" y="2" width="1" height="12"/>';
  const waves = '<rect x="9" y="6" width="1" height="4"/><rect x="10" y="5" width="1" height="1"/><rect x="10" y="10" width="1" height="1"/><rect x="12" y="4" width="1" height="8"/><rect x="11" y="3" width="1" height="1"/><rect x="11" y="12" width="1" height="1"/><rect x="14" y="3" width="1" height="10"/><rect x="13" y="2" width="1" height="1"/><rect x="13" y="13" width="1" height="1"/>';
  const cross = [5, 6, 7, 8, 9].map((k, i) => '<rect x="' + (9 + i) + '" y="' + k + '" width="2" height="2"/><rect x="' + (13 - i) + '" y="' + k + '" width="2" height="2"/>').join('');
  muteBtn.innerHTML = '<svg viewBox="0 0 16 16" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true">' + body + (isMuted() ? cross : waves) + '</svg>';
  muteBtn.setAttribute('aria-label', isMuted() ? 'Sound off' : 'Sound on');
  muteBtn.setAttribute('aria-pressed', String(isMuted()));
}
muteBtn.addEventListener('click', (e) => {
  e.currentTarget.blur();
  setMuted(!isMuted());
  showMute();
  sfx.blip(3);
});
document.addEventListener('keydown', (e) => {
  // On the start pages typed letters go into the word box, so M only mutes mid-word.
  const midWord = mode !== 'landing' && mode !== 'done';
  if ((e.key === 'm' || e.key === 'M') && midWord && !e.metaKey && !e.ctrlKey) {
    setMuted(!isMuted());
    showMute();
  }
});
showMute();

// ---------- Never let a pinch or Ctrl+scroll zoom the page itself ----------
window.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }); // Safari trackpad pinch
}
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

// ---------- Opening: "RUBBISH" → cubes → the extra B explodes into the page ----------
const shuffled = (a) => {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

let cursorPending = false; // a piece is flying to the pointer to become the cursor
function finishOpening(instant = false) {
  document.documentElement.classList.remove('booting');
  document.body.classList.remove('opening');
  if (!cursorPending) cursor.show();
  for (const el of document.querySelectorAll('.pending')) el.classList.remove('pending');
  stage.fx.main = 1;
  if (mode === 'opening') mode = 'landing';
  input.focus({ preventScroll: true });
  // Let the page settle for 2 seconds before the cube starts shuffling letters.
  setTimeout(() => { if (mode === 'landing') restartLoop(); }, instant ? 0 : 2000);
}

// Pieces of the exploded B fly to their spots: one becomes the main cube, the
// rest become the color squares, the word box, the > button and the sound
// button, each popping in as its piece lands. Leftovers fall as confetti.
function deliverPieces(pieces, uiEls) {
  const order = shuffled(pieces);
  const stageRect = $('cube').getBoundingClientRect();
  const targets = [{ main: true }, ...uiEls.map((el) => ({ el }))];
  // On mouse devices, one more piece flies to the pointer and becomes the cursor.
  if (canHover && cursor.mouse.known) {
    targets.push({ cursor: true });
    cursorPending = true;
  }
  let left = targets.length;
  const arrived = () => { if (--left === 0) finishOpening(); };

  targets.forEach((t, i) => {
    const p = order[i];
    let x, y, size;
    if (t.cursor) {
      // Follow the pointer while flying (it can move); aim at the cube cursor's middle.
      x = () => cursor.mouse.x + cursor.center.x;
      y = () => cursor.mouse.y + cursor.center.y;
      size = 22;
    } else if (t.main) {
      x = stageRect.left + stageRect.width / 2;
      y = stageRect.top + stageRect.height / 2;
      size = 70;
    } else {
      const r = t.el.getBoundingClientRect();
      x = r.left + r.width / 2;
      y = r.top + r.height / 2;
      size = Math.min(t.el.offsetWidth, t.el.offsetHeight) * 0.8;
    }
    // Slow, staggered flights so you can follow each piece to its spot.
    physics.sendTo(p, {
      x, y, size, delay: 650 + i * 150, dur: 1700, fade: 900, lift: 180,
      onArrive: () => {
        if (t.cursor) {
          cursor.reveal();
          cursorPending = false;
          sfx.pop();
        } else if (t.main) {
          // The main cube grows slowly out of its piece.
          tween(1400, (e) => { stage.fx.main = e; }, easeOutBack);
          sfx.thud();
        } else {
          t.el.classList.remove('pending');
          t.el.classList.add('arrive');
          t.el.addEventListener('animationend', () => t.el.classList.remove('arrive'), { once: true });
          sfx.blip(i % 6);
        }
        arrived();
      },
    });
  });
}

async function runOpening() {
  const uiEls = [...document.querySelectorAll('#swatches .swatch, #swatches-bg .swatch'), $('char'), $('go'), $('mute'), $('ach-btn')];
  if (REDUCED) return finishOpening(true);
  stage.fx.main = 0;
  document.body.classList.add('opening');
  if (canHover) cursor.hide(); // it gets delivered by a piece of the explosion
  for (const el of uiEls) el.classList.add('pending');

  // Start with the title big and centered on the page.
  const titleEl = $('title');
  const r = titleEl.getBoundingClientRect();
  titleEl.style.transition = 'none';
  titleEl.style.transform = `translateY(${innerHeight / 2 - (r.top + r.height / 2)}px) scale(1.5)`;

  const intro = title.playIntro({
    // Browsers only allow sound after a click or key press. If it isn't allowed
    // yet, ask for one while RUBBISH is on screen so the opening has sound.
    gate: async () => {
      if (audioRunning() || isMuted()) return;
      const press = $('press');
      press.textContent = canHover ? 'CLICK OR PRESS ANY KEY' : 'TAP TO START';
      press.classList.add('show');
      await waitForAudio();
      press.classList.remove('show');
      sfx.blip(4);
    },
    onBoom: (x, y, size, rx, ry) => {
      const pieces = physics.explode(x, y, size, rx, ry);
      boom(x, y);
      sfx.explode();
      // RUBISH glides up to its usual spot while the pieces fly out.
      titleEl.style.transition = 'transform 1.1s cubic-bezier(0.65, 0, 0.35, 1)';
      titleEl.style.transform = '';
      titleEl.addEventListener('transitionend', () => { titleEl.style.transition = ''; }, { once: true });
      deliverPieces(pieces, uiEls);
    },
  });
  // Everything is now in its opening state (UI pending, title hidden for its
  // intro), so it's safe to reveal the page.
  document.documentElement.classList.remove('booting');
  await intro;
}

runOpening();
