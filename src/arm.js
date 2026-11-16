// A blocky 3D robot arm that grows out of one of the title cubes, reaches over
// and presses a button, then blows apart into little cubes. Used when someone
// types MUTE / UNMUTE instead of clicking the sound button.
import * as THREE from 'three';
import { PALETTE } from './cube3d.js';

const easeOutBack = (t) => { const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.min(1, Math.max(0, t));

// from/to: screen points (shoulder and button). color: a palette color name.
// onPress: called the moment the finger hits the button.
export function robotArm({ from, to, color = 'red', physics, sound = {}, onPress = () => {} }) {
  return new Promise((resolve) => {
    const W = innerWidth, H = innerHeight;
    const canvas = document.createElement('canvas');
    canvas.className = 'arm-3d';
    document.body.appendChild(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(W, H, false);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(0, W, 0, -H, -2000, 2000);
    const sun = new THREE.DirectionalLight(0xffffff, 1.7);
    sun.position.set(-0.4, 1, 1);
    scene.add(sun, new THREE.AmbientLight(0xffffff, 1.35));

    const mat = new THREE.MeshLambertMaterial({ color: PALETTE[color] });
    const edge = new THREE.LineBasicMaterial({ color: 0x111111 });
    const box = new THREE.BoxGeometry(1, 1, 1);
    const edges = new THREE.EdgesGeometry(box);
    const tilt = new THREE.Euler(0.45, -0.55, 0);
    const cubeMesh = (size) => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(box, mat), new THREE.LineSegments(edges, edge));
      g.rotation.copy(tilt);
      g.userData.size = size;
      g.scale.setScalar(0.0001);
      scene.add(g);
      return g;
    };

    // The arm's path: up out of the cube, over in an arc, and down to just
    // short of the button so the finger can poke it.
    const dirX = to.x - from.x, dirY = to.y - from.y;
    const len = Math.hypot(dirX, dirY) || 1;
    const hand = { x: to.x - (dirX / len) * 26, y: to.y - (dirY / len) * 26 };
    const elbow = { x: lerp(from.x, hand.x, 0.45), y: Math.max(30, Math.min(from.y, hand.y) - 50) }; // stays on screen
    const SEG = 15;
    const pts = [];
    const quad = (t) => ({
      x: (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * elbow.x + t * t * hand.x,
      y: (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * elbow.y + t * t * hand.y,
    });
    let prev = quad(0);
    pts.push(prev);
    for (let i = 1; i <= 400; i++) {
      const p = quad(i / 400);
      if (Math.hypot(p.x - prev.x, p.y - prev.y) >= SEG * 1.05) { pts.push(p); prev = p; }
    }
    const segs = pts.map((p) => ({ ...p, g: cubeMesh(SEG * 0.92) }));
    // The hand: a bigger block with a finger pointing at the button.
    const handGroup = new THREE.Group();
    const palm = cubeMesh(SEG * 1.5);
    const finger = cubeMesh(SEG * 0.5);
    scene.remove(palm, finger);
    handGroup.add(palm, finger);
    finger.position.set((dirX / len) * SEG * 1.0 / (SEG * 1.5), -(dirY / len) * SEG * 1.0 / (SEG * 1.5), 0);
    scene.add(handGroup);
    const handAt = (k) => handGroup.position.set(hand.x + (dirX / len) * 12 * k, -(hand.y + (dirY / len) * 12 * k), 10);

    const GROW = 45; // ms between segments appearing
    const growEnd = segs.length * GROW + 220;
    const pokeAt = growEnd + 150, pokeDur = 360;
    const blowAt = pokeAt + pokeDur + 500;
    let pressed = false, blown = false;
    const t0 = performance.now();

    const frame = (now) => {
      const ms = now - t0;
      segs.forEach((s, i) => {
        const k = clamp01((ms - i * GROW) / 220);
        const wob = Math.sin(ms / 160 + i * 0.6) * 2 * clamp01(k); // a little life in it
        s.g.position.set(s.x, -(s.y + wob), 0);
        s.g.scale.setScalar(Math.max(0.0001, easeOutBack(k) * s.g.userData.size));
        if (k > 0 && !s.ticked) { s.ticked = true; if (i % 3 === 0) sound.tick?.(0.1); }
      });
      // Hand pops on at the end, then pokes the button.
      const hk = clamp01((ms - segs.length * GROW) / 260);
      palm.scale.setScalar(Math.max(0.0001, easeOutBack(hk)));
      finger.scale.setScalar(Math.max(0.0001, easeOutBack(hk) * (SEG * 0.5) / (SEG * 1.5)));
      handGroup.scale.setScalar(SEG * 1.5); // palm is the unit cube inside the hand group
      const poke = clamp01((ms - pokeAt) / pokeDur);
      handAt(Math.sin(Math.PI * poke));
      if (poke >= 0.5 && !pressed) { pressed = true; onPress(); }

      renderer.render(scene, camera);

      if (ms >= blowAt && !blown) {
        blown = true;
        // Every block becomes a physics piece flying out from the arm's middle.
        const mid = pts[Math.floor(pts.length / 2)];
        const faces = Array(6).fill(color);
        const pieces = segs.map((s) => ({
          x: s.x, y: s.y, dx: s.x - mid.x, dy: s.y - mid.y - 30, size: SEG * 0.92,
          quat: new THREE.Quaternion().setFromEuler(tilt), faces,
        }));
        pieces.push({ x: hand.x, y: hand.y, dx: hand.x - mid.x, dy: hand.y - mid.y, size: SEG * 1.5, quat: new THREE.Quaternion().setFromEuler(tilt), faces });
        physics.shatter(pieces);
        sound.explode?.();
        renderer.dispose();
        canvas.remove();
        resolve();
        return;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

// A burst around a button: expanding square rings and a floating label.
export function zapButton(btn, label) {
  const r = btn.getBoundingClientRect();
  btn.classList.remove('zap');
  void btn.offsetWidth;
  btn.classList.add('zap');
  for (let i = 0; i < 3; i++) {
    const ring = document.createElement('div');
    ring.className = 'zap-ring';
    Object.assign(ring.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, animationDelay: `${i * 0.14}s` });
    ring.addEventListener('animationend', () => ring.remove());
    document.body.appendChild(ring);
  }
  const tag = document.createElement('div');
  tag.className = 'zap-label';
  tag.textContent = label;
  Object.assign(tag.style, { left: `${r.left + r.width / 2}px`, top: `${r.bottom + 10}px` });
  tag.addEventListener('animationend', () => tag.remove());
  document.body.appendChild(tag);
}
