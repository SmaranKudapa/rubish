// Three.js renderer for the cube: lighting, idle sway, and celebration effects.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { easeInOutCubic } from './cube3d.js';

export function tween(duration, fn, ease = easeInOutCubic) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / duration);
      fn(ease(t), t);
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

export function createStage(container, cube) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(5, 7, 9);
  scene.add(key, new THREE.AmbientLight(0xffffff, 0.3));

  // holder: tilt + idle sway. cube.group: spins/scales during celebrations.
  const holder = new THREE.Group();
  holder.add(cube.group);
  scene.add(holder);

  const fx = { sway: 1, glow: 0, scale: 1, tiltX: 0.5, tiltY: -0.62, lift: 0 };

  const resize = () => {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.set(0, 0, 13.5 / Math.min(1, camera.aspect * 1.1));
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(container);
  resize();

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const t = clock.getElapsedTime();
    holder.rotation.x = fx.tiltX + Math.sin(t * 0.8) * 0.07 * fx.sway;
    holder.rotation.y = fx.tiltY + Math.sin(t * 0.55) * 0.22 * fx.sway;
    holder.position.y = Math.sin(t * 1.3) * 0.14 * fx.sway + fx.lift;
    cube.group.scale.setScalar(fx.scale);
    for (const m of Object.values(cube.materials)) m.emissiveIntensity = fx.glow;
    renderer.render(scene, camera);
  });

  return {
    fx,
    setSway: (to, ms = 800) => { const from = fx.sway; return tween(ms, (e) => { fx.sway = from + (to - from) * e; }); },
    pop: () => tween(420, (_, t) => { fx.scale = 1 + Math.sin(Math.PI * t) * 0.06; }, (t) => t),
    async celebrate() {
      await Promise.all([
        tween(1500, (e) => { cube.group.rotation.y = e * Math.PI * 2; }),
        tween(1500, (_, t) => {
          fx.scale = 1 + Math.sin(Math.PI * t) * 0.16;
          fx.lift = Math.sin(Math.PI * t) * 0.6;
          fx.glow = Math.sin(Math.PI * t) * 0.85;
        }, (t) => t),
      ]);
      cube.group.rotation.y = 0;
      Object.assign(fx, { scale: 1, lift: 0, glow: 0 });
    },
  };
}
