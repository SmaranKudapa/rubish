// Retro confetti: tiny 1x1 cubes that fly out, collide with each other and the
// floor, pile up, and after a couple of seconds on the ground shrink away.
const GRAVITY = 2400; // px/s^2
const RESTITUTION = 0.35;
const FRICTION = 0.86;
const SUBSTEPS = 4;
const SHRINK_DELAY = 2000; // ms on the ground before shrinking starts
const SHRINK_TIME = 900;

export function createCubeConfetti(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  let parts = [];
  let running = false;
  let last = 0;

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  };
  window.addEventListener('resize', resize);
  resize();

  function ground(p, now) {
    if (p.landed === null) p.landed = now + Math.random() * 600;
  }

  function step(dt, now) {
    for (const p of parts) {
      p.vy += GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.y + p.s >= H) {
        p.y = H - p.s;
        if (p.vy > 0) p.vy = -p.vy * RESTITUTION;
        if (Math.abs(p.vy) < 40) p.vy = 0;
        p.vx *= FRICTION;
        ground(p, now);
      }
      if (p.x < 0) { p.x = 0; p.vx = Math.abs(p.vx) * RESTITUTION; }
      if (p.x + p.s > W) { p.x = W - p.s; p.vx = -Math.abs(p.vx) * RESTITUTION; }
    }

    // Box-vs-box collisions using a spatial grid.
    const cell = 24;
    const grid = new Map();
    parts.forEach((p, i) => {
      const k = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(i);
    });
    for (let i = 0; i < parts.length; i++) {
      const a = parts[i];
      const cx = Math.floor(a.x / cell), cy = Math.floor(a.y / cell);
      for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) {
        const list = grid.get(`${gx},${gy}`);
        if (!list) continue;
        for (const j of list) {
          if (j <= i) continue;
          const b = parts[j];
          const ox = Math.min(a.x + a.s, b.x + b.s) - Math.max(a.x, b.x);
          const oy = Math.min(a.y + a.s, b.y + b.s) - Math.max(a.y, b.y);
          if (ox <= 0 || oy <= 0) continue;
          if (ox < oy) {
            const dir = a.x < b.x ? -1 : 1;
            a.x += (dir * ox) / 2;
            b.x -= (dir * ox) / 2;
            const rel = a.vx - b.vx;
            if (rel * dir < 0) {
              const avg = (a.vx + b.vx) / 2;
              a.vx = avg - (rel * RESTITUTION) / 2;
              b.vx = avg + (rel * RESTITUTION) / 2;
            }
          } else {
            const [top, bot] = a.y < b.y ? [a, b] : [b, a];
            // Whatever sits lower carries the one on top.
            const botFixed = bot.y + bot.s >= H - 0.5;
            if (botFixed) top.y -= oy;
            else { top.y -= oy / 2; bot.y += oy / 2; }
            if (top.vy > bot.vy) {
              const rel = top.vy - bot.vy;
              if (botFixed) top.vy = bot.vy - rel * RESTITUTION * 0.5;
              else {
                const avg = (top.vy + bot.vy) / 2;
                top.vy = avg - (rel * RESTITUTION) / 2;
                bot.vy = avg + (rel * RESTITUTION) / 2;
              }
              if (Math.abs(top.vy) < 40) top.vy = 0;
              top.vx *= FRICTION;
            }
            if (bot.landed !== null) ground(top, now);
          }
        }
      }
    }
  }

  function shrink(now) {
    for (const p of parts) {
      if (p.landed === null) continue;
      const t = (now - p.landed - SHRINK_DELAY) / SHRINK_TIME;
      if (t <= 0) continue;
      const s = p.s0 * Math.max(0, 1 - t);
      // Keep the bottom-center anchored while shrinking.
      p.x += (p.s - s) / 2;
      p.y += p.s - s;
      p.s = s;
    }
    parts = parts.filter((p) => p.s >= 1 && now - p.born < 12000);
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) {
      const x = Math.round(p.x), y = Math.round(p.y), s = Math.max(1, Math.round(p.s));
      ctx.fillStyle = '#111';
      ctx.fillRect(x, y, s, s);
      const b = s >= 6 ? 2 : s >= 3 ? 1 : 0; // black plastic border
      ctx.fillStyle = p.color;
      ctx.fillRect(x + b, y + b, s - 2 * b, s - 2 * b);
      if (s >= 8) {
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillRect(x + b + 1, y + b + 1, 2, 2);
      }
    }
  }

  function frame(t) {
    const dt = Math.min(0.033, (t - last) / 1000);
    last = t;
    const now = performance.now();
    for (let i = 0; i < SUBSTEPS; i++) step(dt / SUBSTEPS, now);
    shrink(now);
    draw();
    if (parts.length) requestAnimationFrame(frame);
    else running = false;
  }

  return {
    burst({ x, y, colors, count = 150 }) {
      const now = performance.now();
      for (let i = 0; i < count; i++) {
        const fromSide = i % 3 === 0;
        const left = i % 2 === 0;
        const s = 8 + Math.floor(Math.random() * 3) * 2;
        parts.push({
          x: fromSide ? (left ? 0 : W - s) : x - s / 2 + (Math.random() - 0.5) * 60,
          y: fromSide ? H * 0.75 : y,
          vx: fromSide ? (left ? 1 : -1) * (300 + Math.random() * 700) : (Math.random() - 0.5) * 1100,
          vy: fromSide ? -(800 + Math.random() * 700) : -(500 + Math.random() * 900),
          s, s0: s,
          color: colors[Math.floor(Math.random() * colors.length)],
          landed: null,
          born: now,
        });
      }
      if (!running) {
        running = true;
        last = performance.now();
        requestAnimationFrame(frame);
      }
    },
  };
}
