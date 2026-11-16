# rubish

Type a word (letters A–Z, digits 0–9) and get the exact moves that make a solved Rubik's cube show each character on its front face, one letter at a time.

**Live:** https://rubish-delta.vercel.app

## Using the moves

Start each letter with a **solved** cube held the way the 3D cube is shown (it turns to that orientation before the first move; which colors face you and face up depends on the letter color), and keep it in that orientation.

- `U D R L F B` turn the Up, Down, Right, Left, Front or Back face a quarter turn clockwise, as seen looking straight at that face.
- `'` means counter-clockwise, `2` means a half turn.

On the landing page a 3D cube reshuffles itself into a random letter every 3 seconds (drag it to look around; click a RUBISH title cube to blow it up). Type a word, pick a letter color and hit `>`: the cube scrambles while shaking, solves itself, and turns to the orientation you should hold yours in. Press <kbd>space</kbd> (or tap **next step**) for each move; <kbd>←</kbd> goes back, <kbd>Esc</kbd> starts over. Each finished letter gets a celebration and the next letter starts automatically; at the end every cube you made spells out the word.

## How it works

All sequences are precomputed; the site is static, built with Vite and Three.js.

1. `scripts/glyphs.cjs` defines a 3×3 pixel pattern for each character.
2. `scripts/generate.cjs` builds a random legal cube state whose front face matches the pattern, solves it with Kociemba's algorithm ([cubejs](https://github.com/ldez/cubejs)), and inverts the solution to get moves from solved → letter. It keeps the shortest of many tries (17–20 moves) and replays each sequence to verify it. Output: `src/solutions.json`.
3. **Letter color:** the sequences are generated with the letter on the front face and the background on the top face (or the reverse, when the glyph's fixed center sticker is background). So any letter color works by changing how you hold the cube: `holdFor()` in `src/cube3d.js` picks the front/top colors.
4. `src/cube3d.js` is the 3D cube model (animated turns, whole-cube rotations). `scripts/check-cube.mjs` plays every character in every color on it and confirms the front face matches.

A 3×3 face can't tell some characters apart (2/Z, 5/S, 9/Q share shapes).

## Development

```sh
npm install
npm run dev             # local dev server
npm run check           # verify the 3D model draws every character in every color
npm run generate        # rewrites src/solutions.json (~4 min)
TRIES=20 npm run generate   # faster, slightly longer sequences
npm run build           # production build into dist/
```

## Deploy

Hosted on Vercel, connected to this repo: every push to `main` deploys to production (`vercel.json`: Vite build, output `dist/`).
