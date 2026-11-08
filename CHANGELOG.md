# Changelog

All notable changes to koi-pond. Versions follow [semantic versioning](https://semver.org/):
a new major version may change how the pond looks or behaves for existing sites, minor
versions add features, patch versions fix bugs.

Pin a version in your script tag (`@v1.0.0`) so your site never changes unexpectedly.

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
