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
    if (byZoom) ach.unlock('kaboom');
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

// opening → landing → intro → steps → celebrate → (intro → steps → celebrate)* → finale → done
// "done" is the landing page showing off the finished word; a new word starts over.
let mode = 'opening';
let color = 'red'; // letter color
let bgColor = 'white'; // background color
let word = null; // { chars, idx, color, bg }
let job = null; // { ch, hold, moves, step }
let shown = null; // the finished word on the start page: { chars, cubes }
let recolorToken = 0;
let loopToken = 0;
let loopPromise = Promise.resolve();

// ---------- Color swatches: letter color, then background color ----------
// The squares double as a little keyboard: top row C D E F G A, bottom row
// B C D E F G an octave up. Playing the start of a certain tune unlocks a secret.
const NOTES_TOP = [60, 62, 64, 65, 67, 69];
const NOTES_BOTTOM = [71, 72, 74, 76, 77, 79];
const TUNE = [67, 67, 69, 67, 72, 71, 67, 67, 69, 67, 74, 72]; // Happy Birthday, first two lines
const played = [];
function playNote(n) {
  sfx.note(n);
  played.push(n);
  if (played.length > TUNE.length) played.shift();
  if (played.length === TUNE.length && played.every((v, i) => v === TUNE[i])) ach.unlock('birthday');
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
    b.onclick = () => { playNote(notes[COLOR_ORDER.indexOf(c)]); onPick(c); };
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
  mode = 'intro';
  loopToken++;
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
    $('char'), $('go'), $('mute'), $('caption'),
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

  await title.playIntro({
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
}

runOpening();
