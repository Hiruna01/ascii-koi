# Changelog

All notable changes to koi-pond. Versions follow [semantic versioning](https://semver.org/):
a new major version may change how the pond looks or behaves for existing sites, minor
versions add features, patch versions fix bugs.

Pin a version in your script tag (`@v1.0.0`) so your site never changes unexpectedly.

## 1.1.0

Fish react to you like real koi.

- `behavior: 'natural'` (new default): the pointer's speed and distance matter. A slow or
  still pointer makes curious fish come over and hover at it, a medium move nearby makes
  them turn calmly away, and a fast move close by (or touching a fish) startles it away
  from the pointer instead of to a random side.
- Each fish has its own boldness, gets used to you after a few frights (and slowly
  forgets), and avoids the spot where it was scared for a few seconds.
- A fright spreads: nearby fish react a moment later, a little weaker.
- `feeding: true`: a left click or tap on an empty part of the page drops a small cluster
  of food. Fish notice it, race to it and eat it. Never on links, buttons, fields, text or
  elements with `data-koi-no-feed`. `pond.feed(x, y)` drops food from code.
- `behavior: 'simple'` keeps the 1.0 behaviour (startle on touch only).

## 1.0.0

First versioned release.

- Dithered koi pond for any website background: one script tag or an ES module.
- 17 real koi varieties (Kohaku, Sanke, Showa, Tancho, Utsuri, Bekko, Goromo, Goshiki,
  Asagi, Shusui, Kumonryu, Ochiba, Kujaku, Hariwake, Soragoi, Ogon and solid colours),
  each painted as a real koi and then dithered.
- Blue (single ink) or real koi colours, on any background.
- Burst-and-glide swimming, a body wave into a flexible tail, fins that tuck and spread.
- A fish under the pointer startles and darts away.
- Options for count, size, varieties, butterfly fins, Bayer or line screen, tones, dot
  size and more; `pond.set()`, `pond.addFish()`, `pond.pause()`, `pond.destroy()`.
