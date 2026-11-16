// Background layer behind the whole page (2D canvas, pixel style): a floor
// with a pixel horizon line and a slightly darker ground band where the
// confetti lands, plus faint reflections of the pieces resting on it.

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

  function frame() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    reflections(floor());
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
