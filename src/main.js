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
  word = { chars: [...text], idx: 0, color, bg: bgColor, auto };
  sfx.submit();
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
  flash(ch);

  if (!(await scrambleAndSolve(alive))) return;
  if (!(await cube.reorient(hold.front, hold.top, speed(420), easeInOutCubic, alive))) return;
  if (!alive()) return;
  stage.pop(); // the big letter stays up for this letter's whole run
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
  sfx.step();
  zoomStreak = 0; // took a step: the streak is broken
  queued++;
  if (!running) runQueue();
}

// Enter (not shown anywhere in the UI): play every remaining move quickly.
function finishLetter() {
  if (!job) return;
  if (mode === 'intro') { job.finish = true; return; } // do it as soon as it's ready
  if (mode !== 'steps') return;
  if (!job.rush) sfx.whoosh();
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
  const s = { chars: shown.chars, cubes: shown.cubes, idx: 0, auto: false };
  solving = s;
  sfx.submit();
  nextBtn.disabled = true;
  show(steps, true);
  await Promise.all(s.cubes.map((c) => c.queue)); // let any turn in flight finish
  if (solving === s) solveNext();
}

async function solveNext() {
  const s = solving;
  if (!s) return;
  // Skip cubes that are already solved or blown up.
  const onStage = stage.cubes();
  while (s.idx < s.cubes.length && (!s.cubes[s.idx].history.length || !onStage.includes(s.cubes[s.idx]))) s.idx++;
  if (s.idx >= s.cubes.length) return solvedAll();
  mode = 'intro';
  const c = s.cubes[s.idx];
  const myJob = {
    ch: s.chars[s.idx], cube: c, moves: [...c.history].reverse().map(invertMove),
    step: 0, finish: s.auto, solving: true,
  };
  job = myJob;
  zoomStreak = 0;
  stage.focusSlot(s.idx);
  flash(myJob.ch);
  caption('');
  nextBtn.disabled = true;
  const alive = () => mode === 'intro' && job === myJob;
  await sleep(speed(600), alive);
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
  sfx.thud();
  await stage.popSlot(s.idx);
  if (mode !== 'celebrate' || solving !== s) return;
  s.idx++;
  solveNext();
}

// Every cube solved: confetti, then the word clears and the landing page's
// shuffling cube comes back.
async function solvedAll() {
  mode = 'celebrate';
  const s = solving;
  stage.focusSlot(null);
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
  restartLoop();
}

// Esc during a word: back to the plain landing page.
function goHome() {
  if (mode === 'landing' || mode === 'done' || mode === 'finale') return;
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
    stage.focusSlot(null);
    document.body.classList.remove('finale');
    loopPromise = loopPromise.then(() => stage.clearWord());
  }
  show(steps, false);
  stage.setShake(0, 200);
  stage.setSway(1);
  input.value = '';
  slideIn(entry);
  restartLoop();
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
      finishLetter();
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
