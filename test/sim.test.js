import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SPINE_SEGMENTS,
  angleDiff,
  bodyHalfWidth,
  createFish,
  hitTest,
  VARIETIES,
  VARIETY_WEIGHTS,
  enterFromEdge,
  mulberry32,
  pickVariety,
  resolveVarieties,
  scaleFish,
  startle,
  stepFish,
} from '../src/sim.js';
import { FLOATS_PER_VERTEX, VERTICES_PER_FISH, buildGeometry } from '../src/geometry.js';

const bounds = { width: 1200, height: 800 };

function opts(extra = {}) {
  return { speed: 1, dartBoost: 1.5, dartDuration: 1, bounds, fishes: [], pointer: null, rng: mulberry32(1), ...extra };
}

function placeFish(fish, x, y, angle) {
  fish.angle = angle;
  for (let i = 0; i <= SPINE_SEGMENTS; i++) {
    fish.spine[i * 2] = x - Math.cos(angle) * fish.segLen * i;
    fish.spine[i * 2 + 1] = y - Math.sin(angle) * fish.segLen * i;
  }
}

test('angleDiff wraps to the shortest turn', () => {
  assert.ok(Math.abs(angleDiff(0.1, Math.PI * 2 - 0.1) - 0.2) < 1e-9);
  assert.ok(Math.abs(angleDiff(-3, 3) - (2 * Math.PI - 6)) < 1e-9);
});

test('body is widest near the front and narrow at the tail', () => {
  assert.equal(bodyHalfWidth(0), 0);
  assert.ok(bodyHalfWidth(0.3) > bodyHalfWidth(0.9));
  assert.ok(bodyHalfWidth(1) > 0);
});

test('spine segments keep their length while swimming', () => {
  const rng = mulberry32(42);
  const f = createFish(rng, bounds, 100);
  for (let k = 0; k < 600; k++) stepFish(f, 1 / 60, k / 60, opts({ fishes: [f] }));
  for (let i = 0; i < SPINE_SEGMENTS; i++) {
    const d = Math.hypot(f.spine[i * 2 + 2] - f.spine[i * 2], f.spine[i * 2 + 3] - f.spine[i * 2 + 1]);
    assert.ok(Math.abs(d - f.segLen) < 1e-3, `segment ${i} length ${d} != ${f.segLen}`);
  }
});

test('fish stay near the pond over a long run', () => {
  const rng = mulberry32(7);
  const fishes = Array.from({ length: 10 }, () => createFish(rng, bounds, 110));
  for (let k = 0; k < 60 * 120; k++) {
    for (const f of fishes) stepFish(f, 1 / 60, k / 60, opts({ fishes }));
  }
  for (const f of fishes) {
    assert.ok(f.spine[0] > -f.length && f.spine[0] < bounds.width + f.length, `x ${f.spine[0]}`);
    assert.ok(f.spine[1] > -f.length && f.spine[1] < bounds.height + f.length, `y ${f.spine[1]}`);
  }
});

test('hitTest finds points on the body and misses points beside it', () => {
  const f = createFish(mulberry32(3), bounds, 120);
  placeFish(f, 600, 400, 0);
  const mid = f.length * 0.3;
  assert.equal(hitTest(f, 600 - mid, 400), true);
  assert.equal(hitTest(f, 600 - mid, 400 + f.length * 0.5), false);
  assert.equal(hitTest(f, 100, 100), false);
});

test('a fish darts (speeds up) when the pointer is on it, then calms down', () => {
  const f = createFish(mulberry32(5), bounds, 120);
  placeFish(f, 600, 400, 0);
  const o = opts({ fishes: [f] });
  for (let k = 0; k < 120; k++) stepFish(f, 1 / 60, k / 60, o);
  const cruising = f.baseSpeed;

  // Put the pointer on the middle of the body.
  const px = f.spine[(SPINE_SEGMENTS >> 1) * 2];
  const py = f.spine[(SPINE_SEGMENTS >> 1) * 2 + 1];
  stepFish(f, 1 / 60, 2, { ...o, pointer: { x: px, y: py, active: true } });
  assert.ok(f.burst > 0.95, `burst ${f.burst}`);
  assert.ok(Math.abs(f.flick) > 1.2, 'startle starts with a quick bend');
  let peak = 0;
  for (let k = 0; k < 60; k++) {
    stepFish(f, 1 / 60, 2 + k / 60, o);
    peak = Math.max(peak, f.speed);
  }
  assert.ok(peak > cruising * 1.7, `dart speed ${peak} vs cruising ${cruising}`);
  assert.ok(peak < cruising * 3.2, `dart stays gentle: ${peak} vs cruising ${cruising}`);

  for (let k = 0; k < 60 * 6; k++) stepFish(f, 1 / 60, 3 + k / 60, o);
  assert.ok(f.speed < cruising * 1.6, `speed after calming ${f.speed}`);
});

test('swimming alternates between tail beats and glides', () => {
  const f = createFish(mulberry32(21), bounds, 110);
  placeFish(f, 600, 400, 0);
  const o = opts({ fishes: [f] });
  let switches = 0;
  let last = f.beating;
  let minAmp = Infinity;
  let maxAmp = 0;
  for (let k = 0; k < 60 * 20; k++) {
    stepFish(f, 1 / 60, k / 60, o);
    if (f.beating !== last) switches++;
    last = f.beating;
    if (k > 120) {
      minAmp = Math.min(minAmp, f.amp);
      maxAmp = Math.max(maxAmp, f.amp);
    }
  }
  assert.ok(switches >= 6, `burst/glide switches in 20 s: ${switches}`);
  assert.ok(minAmp < 0.3 && maxAmp > 0.7, `tail amplitude range ${minAmp}..${maxAmp}`);
});

test('pointer elsewhere does not affect the fish', () => {
  const a = createFish(mulberry32(9), bounds, 120);
  const b = createFish(mulberry32(9), bounds, 120);
  const o = opts();
  for (let k = 0; k < 240; k++) {
    stepFish(a, 1 / 60, k / 60, { ...o, fishes: [a] });
    stepFish(b, 1 / 60, k / 60, { ...o, fishes: [b], pointer: { x: -500, y: -500, active: true } });
  }
  assert.deepEqual(Array.from(a.spine), Array.from(b.spine));
});

test('scaleFish resizes a fish in place and keeps it swimming', () => {
  const f = createFish(mulberry32(31), bounds, 100);
  placeFish(f, 600, 400, 0.3);
  const L = f.length;
  scaleFish(f, 1.5);
  assert.ok(Math.abs(f.length - L * 1.5) < 1e-9);
  assert.equal(f.spine[0], 600);
  for (let k = 0; k < 120; k++) stepFish(f, 1 / 60, k / 60, opts({ fishes: [f] }));
  for (let i = 0; i < SPINE_SEGMENTS; i++) {
    const d = Math.hypot(f.spine[i * 2 + 2] - f.spine[i * 2], f.spine[i * 2 + 3] - f.spine[i * 2 + 1]);
    assert.ok(Math.abs(d - f.segLen) < 1e-3, `segment ${i} length ${d} != ${f.segLen}`);
  }
});

test('all koi varieties appear, and butterfly koi only when asked for', () => {
  assert.ok(Math.abs(VARIETY_WEIGHTS.reduce((a, b) => a + b, 0) - 1) < 1e-9, 'weights add up to 1');
  assert.equal(VARIETY_WEIGHTS.length, Object.keys(VARIETIES).length);
  const rng = mulberry32(77);
  const seen = new Set();
  let long = 0;
  for (let i = 0; i < 2000; i++) {
    const f = createFish(rng, bounds, 100);
    seen.add(f.variety);
    if (f.longFin) long++;
  }
  assert.equal(seen.size, VARIETY_WEIGHTS.length, 'every variety shows up');
  assert.equal(long, 0, 'no butterfly koi by default');
  let longSome = 0;
  for (let i = 0; i < 2000; i++) if (createFish(rng, bounds, 100, 0.2).longFin) longSome++;
  assert.ok(longSome > 300 && longSome < 500, `about 1 in 5 butterfly koi: ${longSome}/2000`);
});

test('varieties can be limited, and a fish can enter from the edge', () => {
  const allowed = resolveVarieties('kohaku, ogon,unknown');
  assert.deepEqual(allowed, [0, 3]);
  assert.equal(resolveVarieties('all'), null);
  const rng = mulberry32(5);
  for (let i = 0; i < 200; i++) {
    const v = createFish(rng, bounds, 100, 0, allowed).variety;
    assert.ok(v === 0 || v === 3, `variety ${v}`);
  }
  assert.equal(pickVariety(0.5, [9]), 9);
  const f = createFish(rng, bounds, 100);
  enterFromEdge(f, bounds, rng);
  const h = [f.spine[0], f.spine[1]];
  const outside = h[0] < 0 || h[0] > bounds.width || h[1] < 0 || h[1] > bounds.height;
  assert.ok(outside, `starts outside: ${h}`);
  for (let k = 0; k < 60 * 6; k++) stepFish(f, 1 / 60, k / 60, opts({ fishes: [f] }));
  const inside = f.spine[0] > 0 && f.spine[0] < bounds.width && f.spine[1] > 0 && f.spine[1] < bounds.height;
  assert.ok(inside, `swims in: ${f.spine[0]}, ${f.spine[1]}`);
});

test('a startle with a direction makes the fish flee that way', () => {
  const f = createFish(mulberry32(41), bounds, 110);
  placeFish(f, 600, 400, 0); // facing +x
  f.heading = 0;
  const away = Math.PI / 2; // flee towards +y
  startle(f, 0.7, away);
  assert.ok(f.burst >= 0.7);
  assert.ok(Math.abs(angleDiff(f.heading, away)) < 0.35, `heading ${f.heading}`);
  for (let k = 0; k < 90; k++) stepFish(f, 1 / 60, k / 60, opts({ fishes: [f] }));
  assert.ok(Math.abs(angleDiff(f.angle, away)) < 0.8, `turned towards ${away}: ${f.angle}`);
});

test('geometry writes the expected number of vertices', () => {
  const rng = mulberry32(11);
  const fishes = Array.from({ length: 4 }, () => createFish(rng, bounds, 100));
  const buf = new Float32Array(4 * VERTICES_PER_FISH * FLOATS_PER_VERTEX);
  const n = buildGeometry(fishes, buf);
  assert.equal(n, 4 * VERTICES_PER_FISH);
  assert.ok(buf.every(Number.isFinite));
});
