// Achievements: a retro menu (opened from the trophy button next to the sound
// button) listing each achievement with a pixel-art icon, a title and a
// description. Some descriptions stay hidden ("???") until you earn them.
// Unlocking shows a toast with a jingle. Progress is saved in this browser.
import { PALETTE } from './cube3d.js';

const KEY = 'rubish-achievements';

// Pixel-art icons: one character per pixel.
const PIX = {
  k: '#111111', w: PALETTE.white, y: PALETTE.yellow, o: PALETTE.orange,
  r: PALETTE.red, g: PALETTE.green, b: PALETTE.blue,
};

// Two little cube faces, the second overlapping the first.
function twinCubes() {
  const rows = Array.from({ length: 12 }, () => Array(12).fill('.'));
  const face = (ox, oy, [a, b, c, d]) => {
    const pat = ['kkkkkkk', `k${a}${a}k${b}${b}k`, `k${a}${a}k${b}${b}k`, 'kkkkkkk', `k${c}${c}k${d}${d}k`, `k${c}${c}k${d}${d}k`, 'kkkkkkk'];
    pat.forEach((row, y) => [...row].forEach((ch, x) => { rows[oy + y][ox + x] = ch; }));
  };
  face(0, 0, ['r', 'w', 'b', 'y']);
  face(5, 5, ['g', 'o', 'w', 'r']);
  return rows.map((r) => r.join(''));
}

const ICONS = {
  trophy: [
    '..kkkkkkkk..',
    '.kyyyyyyyyk.',
    'kkyyyywyyykk',
    'kykyyywyykyk',
    'kykyyyyyykyk',
    'kkkyyyyyykkk',
    '..kyyyyyyk..',
    '...kyyyyk...',
    '....kyyk....',
    '....kyyk....',
    '...kkkkkk...',
    '..kyyyyyyk..',
    '..kkkkkkkk..',
  ],
  boom: [
    '.....k......',
    '..k.kyk..k..',
    '..kkyoykk...',
    '.kyyooooyk..',
    'kyoorrrooyk.',
    '.kyorwwroyk.',
    'kyoorwwrooyk',
    '.kyoorrooyk.',
    '..kyyooyyk..',
    '..kkkyykkk..',
    '.k...kk...k.',
    '............',
  ],
  twins: twinCubes(),
  lock: [
    '...kkkkk....',
    '..kk...kk...',
    '..k.....k...',
    '..k.....k...',
    '.kkkkkkkkk..',
    '.kwwwwwwwk..',
    '.kwwwkwwwk..',
    '.kwwwkwwwk..',
    '.kwwwwwwwk..',
    '.kkkkkkkkk..',
  ],
};

export function iconURL(name) {
  const rows = ICONS[name];
  const w = Math.max(...rows.map((r) => r.length));
  let rects = '';
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (PIX[ch]) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${PIX[ch]}"/>`;
  }));
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${rows.length}" shape-rendering="crispEdges">${rects}</svg>`)}`;
}

export const ACHIEVEMENTS = [
  { id: 'first-word', icon: 'trophy', title: 'FIRST WORD', desc: 'Spell out your first word.' },
  { id: 'kaboom', icon: 'boom', title: 'KABOOM', desc: 'Zoom into a cube until it bursts apart.', secret: true },
  { id: 'copycat', icon: 'twins', title: 'COPYCAT', desc: 'Click a flying cube to clone it.', secret: true },
];

export function createAchievements({ button, panel, list, count, close, toast, sound = {} }) {
  let got = new Set();
  try { got = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { /* storage blocked */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify([...got])); } catch { /* storage blocked */ } };

  function render() {
    count.textContent = `${got.size}/${ACHIEVEMENTS.length}`;
    list.innerHTML = '';
    for (const a of ACHIEVEMENTS) {
      const have = got.has(a.id);
      const li = document.createElement('li');
      li.className = `ach ${have ? 'got' : 'locked'}`;
      li.innerHTML = `
        <div class="ach-icon"><img src="${iconURL(a.icon)}" alt="" />${have ? '' : `<img class="ach-lock" src="${iconURL('lock')}" alt="" />`}</div>
        <div class="ach-text">
          <p class="ach-title">${a.title}</p>
          <p class="ach-desc">${have || !a.secret ? a.desc : '???'}</p>
        </div>
        <span class="ach-check" aria-label="${have ? 'Unlocked' : 'Locked'}">${have ? '✔' : ''}</span>`;
      list.appendChild(li);
    }
    button.classList.toggle('has-new', false);
  }

  const isOpen = () => panel.classList.contains('show');
  function open() {
    render();
    panel.hidden = false;
    void panel.offsetWidth;
    panel.classList.add('show');
    close.focus({ preventScroll: true });
    sound.blip?.(2);
  }
  function hide() {
    panel.classList.remove('show');
    setTimeout(() => { if (!isOpen()) panel.hidden = true; }, 300);
    button.focus({ preventScroll: true });
  }

  button.addEventListener('click', () => (isOpen() ? hide() : open()));
  close.addEventListener('click', hide);
  panel.addEventListener('click', (e) => { if (e.target === panel) hide(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) hide(); });

  let toastTimer = 0;
  function showToast(a) {
    toast.innerHTML = `<img src="${iconURL(a.icon)}" alt="" /><div><p class="toast-kicker">ACHIEVEMENT UNLOCKED</p><p class="toast-title">${a.title}</p></div>`;
    toast.classList.remove('show');
    void toast.offsetWidth;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
  }

  render();
  return {
    isOpen,
    unlock(id) {
      if (got.has(id)) return;
      const a = ACHIEVEMENTS.find((x) => x.id === id);
      if (!a) return;
      got.add(id);
      save();
      render();
      button.classList.add('has-new');
      showToast(a);
      sound.achievement?.();
    },
  };
}
