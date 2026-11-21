# Bubble Pop 🫧

A cozy pocket fidget toy, made by KumoPlay. Open it while you wait, pop for ten seconds or ten minutes, close it. There are three toys:

- **Bubble wrap**: pop with as many fingers as you like, or slide along a row. Popped bubbles flatten and crinkle; when a sheet is done, a fresh one slides in.
- **Soap bubbles**: press and hold to blow bubbles from a wand, sweep to send them drifting. They shimmer, bob, sometimes merge, and pop when touched.
- **Squishy cloud**: a jelly cloud to poke, pinch and stretch. It wobbles back, giggles when poked, looks surprised when stretched far and dozes off when left alone.

No goals, no score, no streaks. Pops are counted quietly, and every so often a new cosmetic turns up as a surprise (a bubble-wrap color or pattern, a wand, a face or a hat). Now and then a golden bubble with a tiny Kumo inside floats by.

- Runs in phone and computer browsers, upright or sideways. Installable ("Add to Home Screen") and playable offline after the first visit.
- No server, no accounts, no ads, no purchases, no links out, no data collection. No microphone or camera. Everything is saved in the player's own browser.
- Every picture is drawn with code or simple SVG, and every sound is made on the spot with the Web Audio API. No image or audio files to download.

Play: <https://kumoplay.github.io/bubble-pop/>

More KumoPlay games: [Kumo Farm](https://kumoplay.github.io/games/kumo-farm/), [Kumo Café](https://kumoplay.github.io/games/kumo-cafe/) and [Peek-a-Kumo](https://kumoplay.github.io/games/peek-a-kumo/). See them all at <https://kumoplay.github.io>.

## Run it

You need [Node.js](https://nodejs.org) 22.12 or newer (the deployment uses Node 24).

```sh
npm install
npm run dev
```

Open <http://localhost:5173/bubble-pop/>.

### Try it on your phone (same Wi-Fi)

```sh
npm run dev:phone
```

The terminal prints a line like `Network: http://192.168.1.23:5173/bubble-pop/`. Type that address into the phone's browser. The phone and the computer must be on the same Wi-Fi; if the computer asks whether Node may accept incoming connections, allow it.

Good to know when testing:

- The very first tap is silent: browsers only allow sound after a tap has finished.
- On iPhone the sound follows the silent switch (and mixes with music you are already playing). Turn the switch off to hear it.
- iPhone browsers have no vibration for web pages, so the little buzz on pops only happens on Android.
- Over this plain `http` address, installing to the home screen and offline play are switched off by the browser. They work on the real site.

## Check it

```sh
npm test          # the rules: popping, soap bubbles, the cloud's jelly body and moods, surprises, saving, content checks
npm run build     # type-check, then build into dist/
npm run preview   # serve the built toy at http://localhost:4173/bubble-pop/ (offline support works here)
```

## Deploy

Every push to `main` runs the tests, builds the toy and publishes it to GitHub Pages with `.github/workflows/deploy.yml`. The repository's Pages source must be set to "GitHub Actions" (on GitHub's free plan, Pages also needs the repository to be public). If a test fails, nothing is published.

The toy is served from `/bubble-pop/`. That path is set once, as `base` in `vite.config.ts`.

## Where things are

| Folder | What is in it |
| --- | --- |
| `src/content/` | **Everything you can add to without code**: colors, shapes, patterns, wands, faces, hats and the unlock rules, as JSON files. |
| `src/art/` | Pictures kept as SVG files: hats (`hats/`), Kumo, the app icon and some interface icons. |
| `src/i18n/` | **Every word** in the toy (`en.ts`). |
| `src/core/` | The rules in plain TypeScript, with tests next to them. No drawing code. |
| `src/core/wrap/` | Bubble-wrap sheets: layout, which bubble a finger touches, swipes. |
| `src/core/soap/` | Soap bubbles: drifting, swaying, merging, popping. |
| `src/core/cloud/` | The squishy cloud's jelly body (`softbody.ts`) and its moods (`mood.ts`). |
| `src/core/progress/` | What is saved, quiet pop counting, surprises and the golden bubble's timing. |
| `src/core/save/` | The save format, upgrades for old saves, repairs. |
| `src/sound/` | Sound recipes (`recipes.ts`), the Web Audio player (`synth.ts`) and background ambience. |
| `src/render/` | Canvas drawing: one view per toy, faces, previews, the golden bubble and gifts. |
| `src/toys/` | Each toy's glue: fingers → rules → sound, buzz and drawing. |
| `src/platform/` | Browser things: fingers, the frame loop, screen size, buzz, storage, offline support, install. |
| `src/ui/` | The bar, the collection, settings (plain DOM, no framework) and the styles. |
| `public/` | The app icons. |

## How it stays smooth and light

- **Instant pops.** A bubble pops inside the touch-down handler: its sound and buzz start straight away, and the picture changes on the next frame.
- **No frames when nothing moves.** The toy only draws while something moves. A finished sheet, a settled cloud, an empty sky: no frames at all. When the tab is hidden, drawing stops and the audio is switched off; it wakes up with the next tap.
- **Little to draw.** Bubbles are drawn once into small pictures and copied. Bubble wrap only repaints the patches around popping bubbles. Sharpness is capped at 2× (on 3× phones soft shapes look the same) and drops to 1.5× by itself on a phone that cannot keep up.
- **A jelly that cannot break.** The cloud uses *shape matching*: every step, each point is pulled part of the way towards the best-fitting copy of the cloud's resting shape. Speeds and stretches are capped, and anything that is not a number resets it. A test handles it wildly for thousands of steps.
- **The browser stays out of the way.** No scrolling, bouncing, pull-to-refresh, zooming, text selection, long-press menus or picture dragging while playing (CSS `touch-action: none` and friends, plus a few event listeners in `src/platform/input.ts`).
- **Calm motion.** When the device asks for reduced motion, or the player turns on "Calm motion" in settings, there are fewer particles, softer wobbles and fades instead of slides. Nothing ever flashes.

## Adding things

All of these are JSON files in `src/content/`. Every entry is checked when the toy starts and by `npm test`: a mistake is explained in plain words, and the broken entry is skipped rather than breaking the toy. New things are found as surprises automatically (see "Unlock rules" below).

### A bubble-wrap color (`wrap-colors.json`)

```json
{ "id": "rose", "bubble": "#F7A8BC" }
```

Only `bubble` is needed. Optional: `rim` (edges and creases), `sheet` (the flat plastic) and `backdrop` (two colors: background top and bottom). Leave them out and they are worked out from `bubble`. Keep colors light: the test asks for pastel bubbles.

### A bubble shape (`shapes.json`)

SVG path data in a 100 × 100 box, centered on (50, 50), reaching about 46 from the middle (like a circle of radius 46). Draw it in any vector app, set the artboard to 100 × 100, and copy the path's `d`.

### A bubble-wrap pattern (`wrap-patterns.json`)

```json
{ "id": "big-hearts", "shape": "heart", "size": 66, "gap": 14, "layout": "offset" }
```

- `shape`: a name from `shapes.json`.
- `size`: bubble width in points on a phone (28 to 96; bigger screens scale it up a little).
- `gap`: space between bubbles (at least 18% of `size`, so bubbles never touch).
- `layout`: `"offset"` (every other row shifted, like real bubble wrap) or `"grid"`.
- `face`: `true` puts Kumo's little face on every bubble.

### A wand (`wands.json`)

```json
{ "id": "moon", "shape": "cloud", "ring": ["#9F88E6"], "handle": "#FFF8EE", "film": ["#CDB9F5", "#A9D3F7", "#FFE08A"] }
```

`shape` is the ring's shape (from `shapes.json`), `ring` one color or several (a rainbow), and `film` the colors swirling in its bubbles.

### A cloud face (`cloud-faces.json`)

```json
{ "id": "dreamy", "eyes": "sparkle", "mouth": "tiny", "blush": "#CDB9F5", "lashes": true }
```

`eyes`: `oval`, `round`, `sparkle`, `happy` or `star`. `mouth`: `smile`, `cat`, `tiny` or `grin`. Optional extras: `lashes`, `freckles`, `whiskers`. The expressions (giggling, surprised, scrunched, sleepy, blinking) are drawn on top of any face automatically.

### A hat (`cloud-hats.json` + a picture)

1. Draw the hat as an SVG in a 100 × 100 box, sitting on the bottom middle (as if the cloud's top were at the bottom edge). Plum outlines (`#3D3566`) look like the rest of the toy. Save it in `src/art/hats/`, for example `sunhat.svg`.
2. Add an entry:

```json
{ "id": "sunhat", "picture": "sunhat.svg", "width": 0.55, "x": 0, "tilt": -6, "sink": 0.15 }
```

`width` is a share of the cloud's width, `x` where along the top it sits (-1 left, 0 middle, 1 right), `tilt` in degrees, and `sink` how far it sinks into the cloud (a share of its own height). Try it with `npm run dev`; the test checks that every picture is used and every entry has its picture.

### Names

Cosmetic names (read out by screen readers, and shown nowhere else) are in `src/i18n/en.ts` under `names`, as `"kind/id"`. A new cosmetic without a name there is called by its id ("flower-crown" → "Flower crown").

### Unlock rules (`unlocks.json`)

- `starters`: what everyone starts with, as `"kind/id"` (kinds: `wrap-color`, `wrap-pattern`, `wand`, `face`, `hat`). At least one of each.
- `goldenOnly`: what only the golden Kumo bubble gives.
- `pace`: pops between surprises. The first comes after `first` pops, each next one needs `step` more, never more than `most`, give or take `jitter` (a share, so it never feels like a schedule). With the numbers as shipped, the first surprise comes after about 30 pops, and all 27 are found after about 5,400.
- `golden`: the golden bubble never comes in the first `notBefore` seconds of play, comes about every `every` seconds of play, never twice within `gap`, and floats across in `floatSeconds`. Only time spent touching the toy counts.
- `surpriseGap`: at least this many seconds between two surprises.

Everything else in the pool (not a starter, not golden-only) comes as a surprise, preferring the toy being played.

## Tweaking sounds

Every sound is a recipe in `src/sound/recipes.ts`: plain numbers and `[min, max]` ranges, rolled again every time, so no two pops sound the same. Each sound is a few short layers (a click of filtered noise, a tone that glides, a puff of air…). The comment at the top of the file explains the numbers (`freq`, `gain`, `attack`, `decay`, `q`). Change a number, save, and listen with `npm run dev`.

- `src/sound/recipes.test.ts` keeps every sound gentle: never too loud, too bright, too clicky or too long.
- All sounds go through a soft high cut and a limiter (`src/sound/synth.ts`), so many fingers at once never clip. `DRIVE` there sets the overall loudness.
- Background sound (breeze and wind chimes) is in `src/sound/ambience.ts`, with its own volume.

## Saving

Only settings, the cosmetics found and chosen, and the pop count are saved, in the browser on this device:

- IndexedDB database `bubble-pop` (the save, plus a backup copy of the last save that loaded fine),
- localStorage key `bubble-pop.save` (a quick copy, written even as the tab closes).

All KumoPlay games share the `kumoplay.github.io` site, so every name here starts with `bubble-pop`, the service worker only covers `/bubble-pop/`, and its caches are named `bubble-pop-…`. Games never touch each other's saves or caches (a test checks this). "Start over" in Settings removes only this toy's saves, after a hold-to-confirm. The toy asks the browser to keep its storage (`navigator.storage.persist()`).

Saves have a version number. When the shape of the saved data changes, raise `SAVE_VERSION` in `src/core/save/schema.ts` and add an upgrade step in `src/core/save/migrations.ts` (the comment there shows how); old saves are upgraded when loaded. A save from a newer version is never overwritten.

If the toy is open in two tabs, the older tab steps back, so they never overwrite each other's saves.

## Offline and install

`vite-plugin-pwa` builds a service worker that keeps a copy of the whole toy on the device (about 260 KB). A new version downloads quietly and switches on the next time the toy is hidden, so it never changes under the player's fingers. The web app manifest (name, colors, icons, full screen) is in `vite.config.ts`. Settings shows "Add to Home Screen" when the browser can do it.

The home-screen icons in `public/` were exported from `src/art/app/icon.svg`; `public/favicon.svg` is the same picture with rounded corners. After changing the icon, export the sizes again, for example:

```sh
rsvg-convert -w 512 -h 512 src/art/app/icon.svg -o public/icon-512.png
rsvg-convert -w 192 -h 192 src/art/app/icon.svg -o public/icon-192.png
rsvg-convert -w 180 -h 180 src/art/app/icon.svg -o public/apple-touch-icon.png
rsvg-convert -w 32 -h 32 public/favicon.svg -o public/favicon-32.png
```

## Developer helpers

Only in `npm run dev` (they are left out of the real build), in the browser console:

- `bubblePop.golden()` sends the golden bubble by now.
- `bubblePop.surprise()` finds a new cosmetic now.
- `bubblePop.state()` shows what would be saved.

## Words and other languages

Every word is in `src/i18n/en.ts`. To add a language (Thai, for example), copy it to `th.ts`, translate the values and pick it in `src/i18n/index.ts`.
