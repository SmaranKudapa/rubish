// Retro sound effects, synthesized on the fly with the Web Audio API (square
// and triangle waves plus filtered noise, like an 8-bit console). Browsers only
// allow audio after a user gesture, so the context starts on the first click
// or key press. Mute state is remembered per browser.

let ctx = null;
let master = null;
let noiseBuf = null;
let muted = false;
try { muted = localStorage.getItem('rubish-muted') === '1'; } catch { /* storage blocked */ }

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.45;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, ensure, { capture: true, passive: true });
// Try right away too: browsers that already allow sound here will start running.
ensure();

const ready = () => ctx && ctx.state === 'running' && !muted;

function tone({ type = 'square', freq, to, dur = 0.08, vol = 0.12, delay = 0, attack = 0.004 }) {
  if (!ready()) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.03);
}

function noise({ dur = 0.1, vol = 0.15, freq = 1200, to, q = 1.2, type = 'bandpass', delay = 0 }) {
  if (!ready()) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.03);
}

// Don't stack dozens of copies of the same sound in one instant.
const lastAt = {};
const throttle = (key, ms) => {
  const now = performance.now();
  if (now - (lastAt[key] || 0) < ms) return false;
  lastAt[key] = now;
  return true;
};

const NOTE = (n) => 440 * 2 ** ((n - 69) / 12); // MIDI note number → Hz

export const sfx = {
  // A layer turning: a short noise swish with a tiny click.
  turn(duration) {
    const fast = duration < 120;
    if (!throttle('turn', fast ? 28 : 0)) return;
    noise({ dur: fast ? 0.05 : 0.11, vol: fast ? 0.05 : 0.11, freq: 2400, to: 700, q: 0.9 });
    tone({ freq: fast ? 1400 : 900, to: fast ? 1000 : 600, dur: 0.025, vol: fast ? 0.02 : 0.04 });
  },
  step() { tone({ freq: 660, to: 990, dur: 0.06, vol: 0.07 }); },
  blip(i = 0) { tone({ freq: NOTE(72 + i * 2), dur: 0.05, vol: 0.07 }); },
  submit() {
    [64, 67, 71, 76].forEach((n, i) => tone({ freq: NOTE(n), dur: 0.07, vol: 0.08, delay: i * 0.05 }));
  },
  error() {
    tone({ type: 'sawtooth', freq: 180, to: 110, dur: 0.16, vol: 0.09 });
    tone({ type: 'sawtooth', freq: 140, to: 90, dur: 0.16, vol: 0.07, delay: 0.09 });
  },
  shake() { if (throttle('shake', 150)) noise({ dur: 0.18, vol: 0.05, freq: 160, q: 0.7, type: 'lowpass' }); },
  // Letter finished: a quick 8-bit arpeggio.
  celebrate() {
    [72, 76, 79, 84, 79, 84].forEach((n, i) => tone({ freq: NOTE(n), dur: 0.09, vol: 0.09, delay: i * 0.07 }));
    tone({ type: 'triangle', freq: NOTE(48), dur: 0.45, vol: 0.12, delay: 0 });
  },
  // Whole word finished: a little fanfare.
  fanfare() {
    const mel = [[67, 0], [72, 0.12], [76, 0.24], [79, 0.36], [76, 0.52], [79, 0.6], [84, 0.72]];
    for (const [n, t] of mel) tone({ freq: NOTE(n), dur: n === 84 ? 0.5 : 0.11, vol: 0.09, delay: t });
    for (const [n, t] of [[48, 0], [55, 0.36], [60, 0.72]]) tone({ type: 'triangle', freq: NOTE(n), dur: 0.34, vol: 0.13, delay: t });
  },
  tick(k = 0) { tone({ freq: 1500 + k * 900, dur: 0.03, vol: 0.06 }); },
  explode() {
    noise({ dur: 1.0, vol: 0.45, freq: 2400, to: 60, q: 0.6, type: 'lowpass' });
    tone({ type: 'triangle', freq: 140, to: 35, dur: 0.6, vol: 0.35 });
  },
  whoosh() { if (throttle('whoosh', 80)) noise({ dur: 0.35, vol: 0.09, freq: 300, to: 2600, q: 1.4 }); },
  thud() { tone({ type: 'triangle', freq: 160, to: 55, dur: 0.18, vol: 0.22 }); noise({ dur: 0.08, vol: 0.08, freq: 400, type: 'lowpass' }); },
  // Confetti hitting something: a tiny pitched tick, louder for harder hits.
  bounce(speed) {
    if (!throttle('bounce', 22)) return;
    const v = Math.min(1, speed / 1400);
    tone({ type: 'triangle', freq: 500 + Math.random() * 500, dur: 0.035, vol: 0.015 + v * 0.05 });
  },
  pop() { tone({ freq: 500, to: 1300, dur: 0.08, vol: 0.08 }); },
};

// True once the browser actually lets us play sound.
export function audioRunning() {
  ensure();
  return !!ctx && ctx.state === 'running';
}

// Resolves when sound can play. Browsers only allow audio after the visitor
// clicks, taps or presses a key, so this may wait for that first gesture.
export function waitForAudio() {
  return new Promise((resolve) => {
    if (audioRunning() || !ctx) return resolve();
    const go = () => {
      ensure();
      if (ctx.state === 'running') resolve();
      else ctx.resume().then(resolve, resolve);
    };
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, go, { once: true, capture: true });
  });
}

export const isMuted = () => muted;
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('rubish-muted', m ? '1' : '0'); } catch { /* storage blocked */ }
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.45, ctx.currentTime, 0.02);
}
