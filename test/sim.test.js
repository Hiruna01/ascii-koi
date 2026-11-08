import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SPINE_SEGMENTS,
  angleDiff,
  bodyHalfWidth,
  createFish,
  hitTest,
  mulberry32,
  stepFish,
} from '../src/sim.js';
import { FLOATS_PER_VERTEX, VERTICES_PER_FISH, buildGeometry } from '../src/geometry.js';

const bounds = { width: 1200, height: 800 };

function opts(extra = {}) {
  return { speed: 1, dartBoost: 3.5, dartDuration: 1.2, bounds, fishes: [], pointer: null, rng: mulberry32(1), ...extra };
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
  const cruising = f.speed;

  // Put the pointer on the middle of the body.
  const px = f.spine[(SPINE_SEGMENTS >> 1) * 2];
  const py = f.spine[(SPINE_SEGMENTS >> 1) * 2 + 1];
  stepFish(f, 1 / 60, 2, { ...o, pointer: { x: px, y: py, active: true } });
  assert.equal(f.burst, 1 * Math.exp(-(1 / 60) / (1.2 * 0.45)));
  for (let k = 0; k < 12; k++) stepFish(f, 1 / 60, 2 + k / 60, o);
  assert.ok(f.speed > cruising * 2, `dart speed ${f.speed} vs cruising ${cruising}`);

  for (let k = 0; k < 60 * 5; k++) stepFish(f, 1 / 60, 3 + k / 60, o);
  assert.ok(f.speed < cruising * 1.3, `speed after calming ${f.speed}`);
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

test('geometry writes the expected number of vertices', () => {
  const rng = mulberry32(11);
  const fishes = Array.from({ length: 4 }, () => createFish(rng, bounds, 100));
  const buf = new Float32Array(4 * VERTICES_PER_FISH * FLOATS_PER_VERTEX);
  const n = buildGeometry(fishes, buf);
  assert.equal(n, 4 * VERTICES_PER_FISH);
  assert.ok(buf.every(Number.isFinite));
});
