// Entry for the <script> build (dist/koi-pond.min.js), exposed as window.KoiPond.
//
// One-line setup, no JavaScript needed:
//   <script src="koi-pond.min.js" data-koi-pond></script>
// Options as data attributes (all optional):
//   data-ink="#1a42e2" data-background="#eff5fd" data-mode="lines"
//   data-count="12" data-pixel-size="2" data-speed="0.8" data-tones="4" data-target="#hero"

import { createKoiPond, DEFAULTS } from './index.js';

export { createKoiPond, DEFAULTS };
export const create = createKoiPond;

const script = typeof document !== 'undefined' ? document.currentScript : null;

if (script && script.hasAttribute('data-koi-pond')) {
  const d = script.dataset;
  const num = (v) => (v == null || v === '' ? undefined : Number(v));
  const opts = {
    target: d.target || null,
    ink: d.ink,
    background: d.background,
    mode: d.mode,
    tones: num(d.tones),
    count: num(d.count),
    pixelSize: num(d.pixelSize),
    speed: num(d.speed),
    fishSize: d.fishSize ? (d.fishSize === 'auto' ? 'auto' : Number(d.fishSize)) : undefined,
    seed: num(d.seed),
  };
  for (const k of Object.keys(opts)) if (opts[k] === undefined) delete opts[k];

  const start = () => {
    const pond = createKoiPond(opts);
    window.koiPond = pond;
  };
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
}
