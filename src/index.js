// koi-pond: a dithered koi pond you can drop into any website background.
//
//   import { createKoiPond } from 'koi-pond';
//   const pond = createKoiPond();             // full-page background
//   const pond = createKoiPond({ target: '#hero' }); // inside one element

import {
  TAU,
  createFish,
  defaultFishSize,
  mulberry32,
  rescaleFishes,
  resolveVarieties,
  pickVariety,
  enterFromEdge,
  VARIETY_NAMES,
  scaleFish,
  stepFish,
} from './sim.js';
import { FLOATS_PER_VERTEX, VERTICES_PER_FISH, buildGeometry } from './geometry.js';
import { createRenderer } from './renderer.js';

export const DEFAULTS = Object.freeze({
  target: null, // element or selector; null / document.body = fixed full-page background
  canvas: null, // use your own <canvas> instead (sized by your CSS)
  count: 10, // number of koi
  fishSize: 'auto', // body length in CSS px, or 'auto' (scales with the viewport)
  fishScale: 1, // size multiplier on top of fishSize (0.5 = half, 2 = double); changes resize fish live
  butterfly: 0, // share of butterfly koi with long, flowing fins (0 = none, 0.2 = about 1 in 5, 1 = all)
  still: false, // true: fish stay where they are placed and only move their body, tail and fins
  varieties: 'all', // which koi varieties swim: 'all', or names like ['kohaku', 'showa', 'ogon'] (see VARIETY_NAMES)
  colors: 'ink', // 'ink' = single ink colour, 'koi' = real koi colours (red, black, white, gold...)
  ink: '#1a42e2', // dot colour when colors is 'ink'
  background: 'auto', // 'auto', any colour, or 'transparent'. Auto = light paper for ink, dark pond for koi.
  //                     Any background works with either colour mode.
  mode: 'bayer', // 'bayer' | 'lines'
  tones: 4, // shades of ink between paper and full ink (1 = single colour, max 8)
  pixelSize: 2, // size of one dot in CSS px
  speed: 1, // swimming speed multiplier
  dartBoost: 1.5, // extra speed while darting (1.5 = up to 2.5x normal)
  dartDuration: 1, // seconds until a dart has mostly faded
  interactive: true, // dart when the pointer is on a fish
  maxDpr: 2, // cap for devicePixelRatio
  reducedMotion: 'auto', // 'auto' slows everything down if the user prefers reduced motion
  zIndex: -1, // z-index of the full-page canvas
  seed: null, // number for a repeatable pond
});

function parseColor(c) {
  if (c == null || c === 'transparent') return [0, 0, 0, 0];
  if (Array.isArray(c)) return [c[0] / 255, c[1] / 255, c[2] / 255, c[3] == null ? 1 : c[3]];
  let s = String(c).trim();
  const m = s.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return [p[0] / 255, p[1] / 255, p[2] / 255, p[3] == null ? 1 : p[3]];
  }
  if (s[0] === '#') s = s.slice(1);
  if (s.length === 3 || s.length === 4) s = s.split('').map((ch) => ch + ch).join('');
  const n = parseInt(s, 16);
  if (Number.isNaN(n) || (s.length !== 6 && s.length !== 8)) {
    throw new Error('koi-pond: unsupported colour "' + c + '" (use hex or rgb())');
  }
  if (s.length === 8) {
    return [((n >>> 24) & 255) / 255, ((n >>> 16) & 255) / 255, ((n >>> 8) & 255) / 255, (n & 255) / 255];
  }
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
}

/**
 * Ink amount of each palette tone for `n` shades of ink, starting with paper (0).
 * For 4 tones this gives about 0.31, 0.55, 0.78, 1: pale, light, mid and deep blue.
 */
export function toneStops(n) {
  const count = Math.max(1, Math.min(8, Math.round(n) || 1));
  const stops = [0];
  for (let i = 1; i <= count; i++) stops.push(Math.pow(i / count, 0.85));
  return stops;
}

export { VARIETY_NAMES };

/* global __KOI_POND_VERSION__ */
/** The library version, e.g. '1.0.0' ('dev' when run from source). */
export const VERSION = typeof __KOI_POND_VERSION__ !== 'undefined' ? __KOI_POND_VERSION__ : 'dev';
export const PAPER = '#eff5fd';
export const POND = '#0d2a30';

function backgroundFor(opts) {
  if (opts.background == null || opts.background === 'auto') {
    return parseColor(opts.colors === 'koi' ? POND : PAPER);
  }
  return parseColor(opts.background);
}

/** 0..1: how light a background is (transparent counts as light: most pages are). */
export function backgroundLightness(c) {
  if (c[3] < 0.5) return 1;
  const lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return Math.min(1, Math.max(0, (lum - 0.35) / 0.3));
}

function resolveTarget(t) {
  if (typeof document === 'undefined') throw new Error('koi-pond needs a browser');
  if (!t) return document.body;
  if (typeof t === 'string') {
    const el = document.querySelector(t);
    if (!el) throw new Error('koi-pond: no element matches "' + t + '"');
    return el;
  }
  return t;
}

export function createKoiPond(options = {}) {
  const opts = { ...DEFAULTS, ...options };
  let ownsCanvas = false;
  let canvas = opts.canvas;
  let host = null;
  let fullPage = false;

  if (!canvas) {
    host = resolveTarget(opts.target);
    fullPage = host === document.body || host === document.documentElement;
    canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.className = 'koi-pond-canvas';
    const st = canvas.style;
    st.display = 'block';
    st.pointerEvents = 'none';
    st.userSelect = 'none';
    if (fullPage) {
      st.position = 'fixed';
      st.inset = '0';
      st.width = '100vw';
      st.height = '100vh';
      st.zIndex = String(opts.zIndex);
      document.body.prepend(canvas);
    } else {
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      st.position = 'absolute';
      st.inset = '0';
      st.width = '100%';
      st.height = '100%';
      st.zIndex = '0';
      host.prepend(canvas);
    }
    ownsCanvas = true;
  }

  const rng = mulberry32(opts.seed == null ? (Math.random() * 2 ** 32) >>> 0 : opts.seed);
  const reduceQuery =
    typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

  let gl = null;
  let renderer = null;
  let ink = parseColor(opts.ink);
  let bg = backgroundFor(opts);
  let fishes = [];
  let vertices = new Float32Array(0);
  let bounds = { width: 0, height: 0 };
  let dpr = 1;
  let running = false;
  let destroyed = false;
  let raf = 0;
  let last = 0;
  let time = 0;
  let onScreen = true;
  const pointer = { x: 0, y: 0, active: false };

  function fishSize() {
    const base = opts.fishSize === 'auto' ? defaultFishSize(bounds.width, bounds.height) : +opts.fishSize;
    return base * Math.max(0.1, +opts.fishScale || 1);
  }

  function syncFishCount() {
    const n = Math.max(0, Math.floor(opts.count));
    const size = fishSize();
    const allowed = resolveVarieties(opts.varieties);
    while (fishes.length < n) fishes.push(createFish(rng, bounds, size, +opts.butterfly || 0, allowed));
    if (fishes.length > n) fishes.length = n;
    const need = n * VERTICES_PER_FISH * FLOATS_PER_VERTEX;
    if (vertices.length < need) vertices = new Float32Array(need);
  }

  function regenerate() {
    fishes = [];
    syncFishCount();
  }

  function measure() {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    dpr = Math.min(opts.maxDpr, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1);
    const cw = Math.max(1, Math.round(w * dpr));
    const ch = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== cw) canvas.width = cw;
    if (canvas.height !== ch) canvas.height = ch;
    const prev = bounds;
    bounds = { width: w, height: h };
    if (fishes.length && (prev.width !== w || prev.height !== h)) {
      rescaleFishes(fishes, prev, bounds);
    }
  }

  function initGL() {
    gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      powerPreference: 'low-power',
    });
    if (!gl) {
      console.warn('koi-pond: WebGL2 is not available, showing a plain background.');
      const c = bg;
      canvas.style.background = `rgba(${c[0] * 255},${c[1] * 255},${c[2] * 255},${c[3]})`;
      return false;
    }
    renderer = createRenderer(gl);
    return true;
  }

  function draw() {
    if (!renderer) return;
    const dot = Math.max(1, Math.round(opts.pixelSize * dpr));
    const count = buildGeometry(fishes, vertices);
    renderer.render({
      canvasW: canvas.width,
      canvasH: canvas.height,
      dot,
      cssPerDot: dot / (canvas.width / bounds.width),
      vertices,
      count,
      mode: opts.mode === 'lines' ? 1 : 0,
      ink: ink.slice(0, 3),
      bg,
      stops: toneStops(opts.tones),
      natural: opts.colors === 'koi',
      light: backgroundLightness(bg),
    });
  }

  function speedFactor() {
    const reduce = opts.reducedMotion === true || (opts.reducedMotion === 'auto' && reduceQuery && reduceQuery.matches);
    return opts.speed * (reduce ? 0.25 : 1);
  }

  function frame(now) {
    raf = 0;
    if (!running || destroyed) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    time += dt;
    const stepOpts = {
      speed: speedFactor(),
      dartBoost: opts.dartBoost,
      dartDuration: opts.dartDuration,
      bounds,
      fishes,
      pointer: opts.interactive ? pointer : null,
      rng,
    };
    if (opts.still) {
      // Hover in place: a gentle tail beat and sculling fins, no travel.
      const k = stepOpts.speed;
      for (const f of fishes) {
        f.phase += TAU * 0.8 * dt * k;
        f.finPhase += TAU * 0.6 * dt * k;
      }
    } else {
      for (const f of fishes) stepFish(f, dt, time, stepOpts);
    }
    draw();
    schedule();
  }

  function schedule() {
    if (!raf && running && onScreen && !document.hidden) raf = requestAnimationFrame(frame);
  }

  // --- Pointer (listened on window so page content stays clickable).
  function updatePointer(e) {
    const r = canvas.getBoundingClientRect();
    pointer.x = e.clientX - r.left;
    pointer.y = e.clientY - r.top;
    pointer.active = pointer.x >= 0 && pointer.y >= 0 && pointer.x <= r.width && pointer.y <= r.height;
  }
  function onPointerUp(e) {
    if (e.pointerType !== 'mouse') pointer.active = false;
  }
  function onPointerOut(e) {
    if (!e.relatedTarget) pointer.active = false;
  }
  function onVisibility() {
    last = 0;
    schedule();
  }

  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    measure();
    if (!running) draw();
  }) : null;
  const io = !fullPage && typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((entries) => {
        onScreen = entries[entries.length - 1].isIntersecting;
        last = 0;
        schedule();
      })
    : null;

  function onContextLost(e) {
    e.preventDefault();
    renderer = null;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }
  function onContextRestored() {
    renderer = createRenderer(gl);
    last = 0;
    draw();
    schedule();
  }

  // --- Init.
  measure();
  regenerate();
  const ok = initGL();
  if (ok) {
    window.addEventListener('pointermove', updatePointer, { passive: true });
    window.addEventListener('pointerdown', updatePointer, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    window.addEventListener('pointercancel', onPointerUp, { passive: true });
    document.addEventListener('pointerout', onPointerOut, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);
    if (ro) ro.observe(canvas);
    else window.addEventListener('resize', measure);
    if (io) io.observe(canvas);
    running = true;
    draw();
    schedule();
  }

  const api = {
    canvas,
    /**
     * Add one koi that swims in from the edge. Options: { variety: 'kohaku' | id,
     * longFin: true/false }. Returns the new fish.
     */
    addFish(o = {}) {
      const f = createFish(rng, bounds, fishSize(), +opts.butterfly || 0, resolveVarieties(opts.varieties));
      if (o.variety != null) {
        const id = resolveVarieties([o.variety]);
        if (id) {
          f.variety = id[0];
          f.pinned = true;
        }
      }
      if (o.longFin != null) f.longFin = !!o.longFin;
      enterFromEdge(f, bounds, rng);
      fishes.push(f);
      opts.count = fishes.length;
      const need = fishes.length * VERTICES_PER_FISH * FLOATS_PER_VERTEX;
      if (vertices.length < need) vertices = new Float32Array(need * 1.5);
      if (!running) draw();
      return f;
    },
    get fishes() {
      return fishes;
    },
    get options() {
      return { ...opts };
    },
    /** Change any option at runtime. */
    set(partial = {}) {
      const prevSize = fishSize();
      Object.assign(opts, partial);
      if ('ink' in partial) ink = parseColor(opts.ink);
      if ('background' in partial || 'colors' in partial) {
        bg = backgroundFor(opts);
        if (!gl) canvas.style.background = `rgba(${bg[0] * 255},${bg[1] * 255},${bg[2] * 255},${bg[3]})`;
      }
      if ('maxDpr' in partial) measure();
      if ('fishSize' in partial || 'fishScale' in partial) {
        // Resize the fish that are already swimming instead of replacing them.
        const k = fishSize() / prevSize;
        if (k !== 1 && Number.isFinite(k)) for (const f of fishes) scaleFish(f, k);
      }
      if ('count' in partial) syncFishCount();
      if ('butterfly' in partial) for (const f of fishes) f.longFin = f.finRoll < (+opts.butterfly || 0);
      if ('varieties' in partial) {
        const allowed = resolveVarieties(opts.varieties);
        for (const f of fishes) if (!f.pinned) f.variety = pickVariety(f.varRoll, allowed);
      }
      if (!running) draw();
      return api;
    },
    pause() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      return api;
    },
    resume() {
      if (destroyed || !renderer) return api;
      running = true;
      last = 0;
      schedule();
      return api;
    },
    get paused() {
      return !running;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      api.pause();
      window.removeEventListener('pointermove', updatePointer);
      window.removeEventListener('pointerdown', updatePointer);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      document.removeEventListener('pointerout', onPointerOut);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', measure);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      if (ro) ro.disconnect();
      if (io) io.disconnect();
      if (renderer) renderer.dispose();
      renderer = null;
      if (ownsCanvas) canvas.remove();
    },
  };
  return api;
}

export default createKoiPond;
