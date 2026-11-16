// Background layer behind the whole page (2D canvas, pixel style):
//  - a floor: a pixel horizon line and a slightly darker ground band where the
//    confetti lands, with faint reflections of the pieces resting on it
//  - celebration ripples: rings of square pixels that spread out across the
//    screen from behind the cube

const CELL = 16; // ripple pixel size
const easeOut = (t) => 1 - Math.pow(1 - t, 2);

export function createBackdrop(canvas, physics) {
  const ctx = canvas.getContext('2d');
  let W = 1, H = 1, dpr = 1;
  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  };
  window.addEventListener('resize', resize);
  resize();

  const ripples = [];

  function floor() {
    const top = Math.round(physics.floorY(-1)) - 4; // just behind the farthest resting pieces
    ctx.fillStyle = 'rgba(3, 70, 100, 0.10)';
    ctx.fillRect(0, top, W, H - top);
    // A few dithered rows under the line, fading out.
    for (let row = 0; row < 3; row++) {
      ctx.fillStyle = `rgba(3, 70, 100, ${0.16 - row * 0.05})`;
      const y = top + 4 + row * 4;
      for (let x = (row % 2) * 4; x < W; x += 8) ctx.fillRect(x, y, 4, 4);
    }
    ctx.fillStyle = '#1d97c0';
    ctx.fillRect(0, top, W, 4);
    return top;
  }

  // Squashed, faded copies of pieces close to the floor, mirrored under it.
  function reflections(top) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top + 4, W, H - top);
    ctx.clip();
    for (const p of physics.pieces()) {
      if (!p.color || p.size < 3 || p.flying) continue;
      const contact = physics.floorY(p.z);
      const gap = contact - (p.y + p.r);
      if (gap > 80 || gap < -4) continue;
      const k = 1 - Math.max(0, gap) / 80;
      const s = Math.max(2, Math.round(p.size * 0.9 / 2) * 2);
      const h = Math.max(2, Math.round(s * 0.6 / 2) * 2);
      const x = Math.round((p.x - s / 2) / 2) * 2;
      const y = Math.round((contact + gap * 0.6) / 2) * 2;
      ctx.globalAlpha = 0.3 * k;
      ctx.fillStyle = '#111';
      ctx.fillRect(x, y, s, h);
      ctx.fillStyle = p.color;
      ctx.fillRect(x + 2, y + 2, s - 4, h - 4);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawRipples(now) {
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      const k = (now - r.t0) / r.dur;
      if (k >= 1) { ripples.splice(i, 1); continue; }
      if (k < 0) continue;
      const R = easeOut(k) * r.max;
      const alpha = Math.pow(1 - k, 1.1) * r.alpha;
      ctx.fillStyle = r.color;
      ctx.globalAlpha = alpha;
      // Two cells thick, snapped to a pixel grid so it reads as chunky blocks.
      for (const rr of [R, R - CELL]) {
        if (rr <= 0) continue;
        const steps = Math.max(12, Math.ceil((2 * Math.PI * rr) / CELL));
        for (let s = 0; s < steps; s++) {
          const a = (s / steps) * Math.PI * 2;
          const x = Math.round((r.x + Math.cos(a) * rr) / CELL) * CELL;
          const y = Math.round((r.y + Math.sin(a) * rr) / CELL) * CELL;
          ctx.fillRect(x - CELL / 2 + 2, y - CELL / 2 + 2, CELL - 4, CELL - 4);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  function frame(now) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawRipples(now);
    reflections(floor());
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    // A burst of pixel rings from (x, y): a white one, then one in `color`.
    ripple(x, y, color = '#ffffff', big = false) {
      const now = performance.now();
      const max = Math.hypot(W, H);
      const rings = big ? 3 : 1;
      for (let i = 0; i < rings; i++) {
        ripples.push({ x, y, t0: now + i * 320, dur: 2300, max, color: '#ffffff', alpha: 0.6 });
        ripples.push({ x, y, t0: now + i * 320 + 160, dur: 2300, max, color, alpha: 0.55 });
      }
    },
  };
}
