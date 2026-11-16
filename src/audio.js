// Retro sound effects, synthesized on the fly with the Web Audio API (square
// and triangle waves plus filtered noise, like an 8-bit console). Browsers only
// allow audio after a user gesture, so the context starts on the first click
// or key press. Mute state is remembered per browser.

let ctx = null;
let master = null;
let noiseBuf = null;
let muted = false;
let unlocked = false; // sound has worked at least once (the visitor has interacted)
try { muted = localStorage.getItem('rubish-muted') === '1'; } catch { /* storage blocked */ }

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    ctx.addEventListener('statechange', () => { if (ctx.state === 'running') unlocked = true; });
    if (ctx.state === 'running') unlocked = true;
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

// Browsers suspend audio when the tab sits in the background; the next sound
// would be lost while it wakes back up. Once sound has worked before, schedule
// it anyway and wake the context: it plays as soon as audio is running again.
const ready = () => {
  if (!ctx || muted) return false;
  if (ctx.state === 'running') return true;
  if (unlocked && ctx.state !== 'closed') { ctx.resume(); return true; }
  return false;
};

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
  // A musical note (MIDI number), used by the color squares.
  note(n, dur = 0.22) { tone({ freq: NOTE(n), dur, vol: 0.09 }); tone({ type: 'triangle', freq: NOTE(n - 12), dur, vol: 0.05 }); },
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
  // A rubbery chip straining to stretch: a creaky, wobbling buzz that climbs
  // in pitch and trembles faster as the strain builds.
  // Returns { stop() } to cut it short.
  stretch(dur = 1.7, vol = 0.06) {
    if (!ready()) return { stop() {} };
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(80, t);
    o.frequency.linearRampToValueAtTime(140, t + dur * 0.5);
    o.frequency.linearRampToValueAtTime(240, t + dur);
    const lfo = ctx.createOscillator(); // the wobble
    lfo.frequency.setValueAtTime(6, t);
    lfo.frequency.linearRampToValueAtTime(17, t + dur);
    const depth = ctx.createGain();
    depth.gain.value = 10;
    lfo.connect(depth).connect(o.frequency);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 7;
    f.frequency.setValueAtTime(450, t);
    f.frequency.linearRampToValueAtTime(1500, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.1, dur * 0.3));
    g.gain.setValueAtTime(vol, t + Math.max(dur * 0.4, dur - 0.05));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.03);
    const trem = ctx.createOscillator(); // the strain: a quick flutter in volume
    trem.frequency.setValueAtTime(14, t);
    trem.frequency.linearRampToValueAtTime(28, t + dur);
    const tremDepth = ctx.createGain();
    tremDepth.gain.setValueAtTime(0, t);
    tremDepth.gain.linearRampToValueAtTime(vol / 2, t + dur);
    trem.connect(tremDepth).connect(g.gain);
    o.connect(f).connect(g).connect(master);
    for (const n of [o, lfo, trem]) { n.start(t); n.stop(t + dur + 0.06); }
    return {
      stop() {
        const now = ctx.currentTime;
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
        for (const n of [o, lfo, trem]) { try { n.stop(now + 0.08); } catch { /* already stopped */ } }
      },
    };
  },
  // ...and it gives: a quick springy snap.
  snap() {
    tone({ freq: 320, to: 1150, dur: 0.09, vol: 0.09 });
    tone({ type: 'triangle', freq: 200, to: 90, dur: 0.12, vol: 0.1, delay: 0.02 });
  },
  // A big springy launch: a rising boing with a punchy pop under it.
  boing() {
    tone({ type: 'square', freq: 130, to: 640, dur: 0.2, vol: 0.09 });
    tone({ type: 'triangle', freq: 280, to: 980, dur: 0.24, vol: 0.12, delay: 0.015 });
    noise({ dur: 0.12, vol: 0.14, freq: 900, q: 0.6, type: 'lowpass' });
  },
  // Something small slamming into the cube: a heavy thump with a crunch.
  impact() {
    tone({ type: 'triangle', freq: 190, to: 45, dur: 0.28, vol: 0.32 });
    noise({ dur: 0.22, vol: 0.2, freq: 1600, to: 200, q: 0.7, type: 'lowpass' });
    tone({ type: 'square', freq: 90, to: 50, dur: 0.12, vol: 0.06 });
  },
  // Something tearing right past the camera: a loud rushing whoosh that drops
  // in pitch as it goes by (a cartoon doppler).
  flyby() {
    if (!throttle('flyby', 90)) return;
    noise({ dur: 0.55, vol: 0.32, freq: 3200, to: 260, q: 1.1 });
    noise({ dur: 0.4, vol: 0.18, freq: 900, to: 140, q: 0.8, type: 'lowpass', delay: 0.05 });
    tone({ type: 'triangle', freq: 220, to: 70, dur: 0.4, vol: 0.12, delay: 0.08 });
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
  // A candle blown out: a soft breathy puff.
  blowOut() { noise({ dur: 0.4, vol: 0.12, freq: 1100, to: 260, q: 0.5, type: 'lowpass' }); },
  // A balloon popping: a sharp crack with a little low thump under it.
  balloonPop() {
    noise({ dur: 0.08, vol: 0.32, freq: 1800, q: 0.4, type: 'highpass' });
    tone({ type: 'triangle', freq: 240, to: 70, dur: 0.07, vol: 0.14 });
  },
  // NUKE: an air-raid siren that climbs for `sec` seconds, ending in a falling
  // whistle as it arrives.
  siren(sec) {
    if (!ready()) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(520, t);
    o.frequency.linearRampToValueAtTime(780, t + sec);
    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.8, t);
    lfo.frequency.linearRampToValueAtTime(2.4, t + sec);
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 190;
    lfo.connect(lfoGain).connect(o.frequency);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1700;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.045, t + 0.8);
    g.gain.linearRampToValueAtTime(0.1, t + sec - 0.15);
    g.gain.linearRampToValueAtTime(0.0001, t + sec);
    o.connect(f).connect(g).connect(master);
    // The falling whistle over the last few seconds.
    const wo = ctx.createOscillator();
    wo.type = 'sine';
    wo.frequency.setValueAtTime(2600, t + sec - 3);
    wo.frequency.exponentialRampToValueAtTime(280, t + sec);
    const wg = ctx.createGain();
    wg.gain.setValueAtTime(0.0001, t);
    wg.gain.setValueAtTime(0.0001, t + sec - 3);
    wg.gain.exponentialRampToValueAtTime(0.08, t + sec - 0.4);
    wg.gain.linearRampToValueAtTime(0.0001, t + sec);
    wo.connect(wg).connect(master);
    o.start(t);
    lfo.start(t);
    wo.start(t);
    for (const n of [o, lfo, wo]) n.stop(t + sec + 0.05);
    // Returns a function that cuts it off right now (the impact came early).
    return () => {
      const n = ctx.currentTime;
      for (const gn of [g, wg]) { gn.gain.cancelScheduledValues(n); gn.gain.setTargetAtTime(0.0001, n, 0.03); }
    };
  },
  // Something smacking into the screen glass.
  // The screen shattering: a sharp crack, a heavy thump, a crunchy breakup,
  // then shards of glass tinkling down.
  glass() {
    noise({ dur: 0.06, vol: 0.5, freq: 3200, q: 0.4, type: 'highpass' });
    tone({ type: 'triangle', freq: 170, to: 45, dur: 0.32, vol: 0.3 });
    noise({ dur: 0.5, vol: 0.24, freq: 2600, to: 800, q: 0.9, delay: 0.015 });
    tone({ type: 'square', freq: 2600, to: 1100, dur: 0.07, vol: 0.05, delay: 0.01 });
    for (let i = 0; i < 16; i++) {
      tone({
        type: Math.random() < 0.5 ? 'sine' : 'triangle',
        freq: 2200 + Math.random() * 4600,
        dur: 0.04 + Math.random() * 0.12,
        vol: 0.025 + Math.random() * 0.045,
        delay: 0.05 + Math.random() * Math.random() * 0.9, // most early, a few late
      });
    }
  },
  // A cartoon slide whistle swooping down as something drops toward you,
  // getting louder as it gets closer.
  slideWhistle(dur = 2.2) {
    if (!ready()) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(1900, t);
    o.frequency.exponentialRampToValueAtTime(380, t + dur);
    const lfo = ctx.createOscillator(); // a little wobble, like a real slide whistle
    lfo.frequency.value = 6;
    const depth = ctx.createGain();
    depth.gain.value = 16;
    lfo.connect(depth).connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.04, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.15, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.04);
    o.connect(g).connect(master);
    for (const n of [o, lfo]) { n.start(t); n.stop(t + dur + 0.06); }
  },
  launch() {
    noise({ dur: 1.4, vol: 0.22, freq: 200, to: 3200, q: 0.8 });
    tone({ type: 'triangle', freq: 95, to: 40, dur: 0.8, vol: 0.25 });
  },
  nukeBoom() {
    noise({ dur: 3.6, vol: 0.7, freq: 3200, to: 40, q: 0.5, type: 'lowpass' });
    tone({ type: 'triangle', freq: 75, to: 18, dur: 3.2, vol: 0.6 });
    noise({ dur: 3, vol: 0.3, freq: 320, to: 45, q: 0.6, type: 'lowpass', delay: 0.9 });
  },
  // Achievement unlocked: a bright little coin-and-sparkle jingle.
  achievement() {
    [[83, 0], [88, 0.09], [91, 0.18], [95, 0.27]].forEach(([n, t]) => tone({ freq: NOTE(n), dur: n === 95 ? 0.35 : 0.08, vol: 0.08, delay: t }));
    tone({ type: 'triangle', freq: NOTE(59), dur: 0.4, vol: 0.1, delay: 0.27 });
  },
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
