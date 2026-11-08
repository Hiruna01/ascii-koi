# koi·pond

A dithered koi pond for your website background. Koi made of ordered-dither dots
swim behind your content; put your pointer on a fish and it darts away.

- WebGL2, no dependencies, about 15 KB gzipped
- Multi-tone Bayer dot or line-screen dithering (paper, pale, light, mid and deep ink)
- 17 real koi varieties with markings, scales, eyes and translucent fins: Kohaku, Taisho Sanke,
  Showa, Tancho, Shiro/Hi/Ki Utsuri, Shiro Bekko, Ai Goromo, Goshiki, Asagi, Shusui, Kumonryu,
  Ochiba Shigure, Kujaku, Hariwake, Soragoi and single-colour Ogon, Kigoi, Chagoi, Benigoi
- Optional butterfly koi with long, flowing fins (`butterfly: 0.2`)
- Optional water (`water: true`): faint dithered light on the water, ripples on click, fish that flee them
- Real koi colours (`colors: 'koi'`): red, black and white Kohaku, Sanke and Showa, Tancho,
  blue-grey Asagi, metallic gold and platinum Ogon, brown Chagoi, on dark pond water
- Works as a full-page background or inside a single element
- Page stays clickable (the canvas ignores pointer events and only reads the pointer position)
- Pauses in background tabs, slows down for `prefers-reduced-motion`

**Live showcase:** https://hiruna01.github.io/ascii-koi/ (source in [`site/`](site/), deployed to
GitHub Pages by [`.github/workflows/pages.yml`](.github/workflows/pages.yml) on every push to `main`).

## Use it

### Script tag

Straight from the CDN (jsDelivr serves files from this GitHub repo):

```html
<script src="https://cdn.jsdelivr.net/gh/Hiruna01/ascii-koi@main/dist/koi-pond.min.js" data-koi-pond></script>
```

Real koi colours on dark pond water, or on white (any `data-background` works):

```html
<script src="https://cdn.jsdelivr.net/gh/Hiruna01/ascii-koi@main/dist/koi-pond.min.js" data-koi-pond data-colors="koi"></script>
<script src="https://cdn.jsdelivr.net/gh/Hiruna01/ascii-koi@main/dist/koi-pond.min.js" data-koi-pond data-colors="koi" data-background="#ffffff"></script>
```

Or download [`dist/koi-pond.min.js`](dist/koi-pond.min.js), host it yourself, and:

```html
<script src="koi-pond.min.js" data-koi-pond></script>
```

Options can go in `data-` attributes:

```html
<script src="koi-pond.min.js" data-koi-pond
        data-mode="lines" data-count="14" data-pixel-size="2"></script>
```

Or call it yourself:

```html
<script src="koi-pond.min.js"></script>
<script>
  const pond = KoiPond.create({ target: '#hero', count: 6 });
</script>
```

### JS module

```js
import { createKoiPond } from './dist/koi-pond.esm.js';

const pond = createKoiPond({ ink: '#1a42e2', background: '#eff5fd' });
pond.set({ mode: 'lines' });
pond.destroy();
```

### Full-page background note

The full-page canvas sits at `position: fixed; z-index: -1`. If your `body` has a
background colour, move it to `html` (or remove it) so the pond shows through.

## Options

| Option | Default | What it does |
| --- | --- | --- |
| `target` | `document.body` | Element or selector to fill. The body gives a fixed full-page background. |
| `canvas` | `null` | Use your own `<canvas>` instead (sized by your CSS). |
| `count` | `10` | Number of koi. |
| `fishSize` | `'auto'` | Body length in CSS px; auto scales with the viewport. |
| `fishScale` | `1` | Size multiplier for the fish (`0.5` = half, `2` = double). Changing it with `pond.set()` resizes the swimming fish smoothly. |
| `butterfly` | `0` | Share of butterfly koi with long, flowing fins (`0.2` = about 1 in 5, `1` = all). |
| `varieties` | `'all'` | Which koi swim: `'all'` or names like `['kohaku', 'showa', 'ogon']` (kohaku, showa, asagi, ogon, tancho, shiro-utsuri, hi-utsuri, ki-utsuri, shiro-bekko, ai-goromo, goshiki, shusui, kumonryu, ochiba, kujaku, hariwake, soragoi). |
| `water` | `false` | Faint light on the water and ripples where you click (left click or tap on empty areas, never on links, buttons or text). Nearby fish flee the ripples. |
| `waterAmount` | `1` | How visible the water is. |
| `ripples` | `true` | With water on, clicks make ripples. Add `data-koi-no-ripple` to any element to exclude it. |
| `colors` | `'ink'` | `'ink'` for one ink colour, `'koi'` for real koi colours. |
| `ink` | `'#1a42e2'` | Dot colour when `colors` is `'ink'` (hex or `rgb()`). |
| `background` | `'auto'` | Light paper (`#eff5fd`) for ink, dark pond (`#0d2a30`) for koi colours; or any colour, or `'transparent'`. Both colour modes work on light and dark backgrounds; on light ones, white koi get a soft grey shading so they stay visible. |
| `mode` | `'bayer'` | `'bayer'` or `'lines'`. |
| `tones` | `4` | Shades of ink between paper and full ink; `1` gives single-colour dots. |
| `pixelSize` | `2` | Size of one dot in CSS px. |
| `speed` | `1` | Swimming speed multiplier. |
| `dartBoost` | `1.5` | Extra speed while darting (1.5 means up to 2.5x normal). |
| `dartDuration` | `1` | Seconds until a dart has mostly faded. |
| `interactive` | `true` | Turn the pointer reaction off. |
| `reducedMotion` | `'auto'` | Slows the pond for users who prefer reduced motion (`true`/`false` to force). |
| `maxDpr` | `2` | Upper limit for device pixel ratio. |
| `zIndex` | `-1` | z-index of the full-page canvas. |
| `seed` | `null` | A number gives the same pond every time. |

Methods: `pond.set({...})`, `pond.addFish({ variety: 'kohaku', longFin: true })` (one koi swims in from the edge), `pond.ripple(x, y)`, `pond.pause()`, `pond.resume()`, `pond.destroy()`.

## How it works

1. **Swim** (`src/sim.js`, `src/geometry.js`): each koi is a chain of spine points; each
   point follows the one in front, so turns bend the whole body. Fish swim in burst-and-glide
   cycles (tail beats, then a coast slowed by drag), hold a heading and then turn to a new one,
   and sometimes hover. A body wave travels from head to tail, growing towards the tail and
   continuing into the flexible tail fin; beat frequency rises with speed. Side fins tuck in at
   speed and spread to brake, steer and scull. When the pointer is on a fish it startles:
   a sharp C-bend, a burst of strong tail beats, then a glide back to calm.
2. **Shade** (`src/renderer.js`, scene pass): each fish is painted as a real koi into a small
   texture with one texel per output dot: markings that keep to the back, a body lit along the
   spine and darker down the flanks, a faint net of scales, eyes, translucent fins tinted by the
   body colour, and a faint halo. In the single-ink look the brightness of that painting sets
   the ink amount (black = deepest, red = mid, white skin = pale).
3. **Dither** (`src/renderer.js`, dither pass): each dot's ink amount falls between two
   palette tones (mixes of `background` and `ink`); an 8x8 Bayer threshold (or a line
   screen) picks which of the two the dot gets.

## Develop

```bash
npm install
npm run dev    # rebuilds on change, serves site/ at http://localhost:8000
npm test       # simulation unit tests (node:test)
npm run build  # dist/ + site/koi-pond.min.js
```

## License

MIT
