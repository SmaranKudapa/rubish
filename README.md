# rubish

Type a letter or digit (A–Z, 0–9) and get the exact moves that make a solved Rubik's cube show it on the front face.

**Live:** https://rubish-delta.vercel.app (link straight to a character with `#A`, `#7`, ...)

## Using the moves

Start with a **solved** cube, **white on top** and **green facing you**, and keep it in that orientation.

- `U D R L F B` turn the Up, Down, Right, Left, Front or Back face a quarter turn clockwise, as seen looking straight at that face.
- `'` means counter-clockwise, `2` means a half turn.

The page lists every move in plain English and shows the cube after each step (Prev/Next or arrow keys).

## How it works

All sequences are precomputed; the site is a static page with no backend.

1. `scripts/glyphs.js` defines a 3×3 pixel pattern for each character.
2. `scripts/generate.js` builds a random legal cube state whose front face matches the pattern, solves it with Kociemba's algorithm ([cubejs](https://github.com/ldez/cubejs)), and inverts the solution to get moves from solved → letter. It keeps the shortest of many tries (17–20 moves) and replays each sequence to verify it.
3. Results go to `public/solutions.json`, which `public/index.html` reads.

The center sticker can't move, so it sets the colors: green letter on white if the center is part of the glyph, otherwise white on green. A 3×3 face can't tell some characters apart (2/Z, 5/S, 9/Q share shapes).

## Development

```sh
npm install
npm run generate        # rewrites public/solutions.json (~4 min)
TRIES=20 npm run generate   # faster, slightly longer sequences
npx serve public        # preview locally
```

## Deploy

Hosted on Vercel, connected to this repo: every push to `main` deploys to production. Config is in `vercel.json` (serves `public/`, no build step).
