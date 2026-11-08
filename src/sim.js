// Koi simulation: pure math, no DOM / WebGL, so it can be unit-tested in Node.
//
// Each koi is a "rope" of spine points. The head steers with a gentle wander,
// every following point is pulled to a fixed distance behind the one in front.
// That alone gives natural S-curves when the fish turns. A travelling sine wave
// is added on top at render time for the tail beat.
//
// The only pointer interaction: when the pointer is over a fish's body, that
// fish darts (a short burst of speed that fades out). Nothing else.

export const TAU = Math.PI * 2;
export const SPINE_SEGMENTS = 14;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(x, a, b) {
  return x < a ? a : x > b ? b : x;
}

export function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Shortest signed difference between two angles, in (-PI, PI]. */
export function angleDiff(to, from) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

/**
 * Half-width of the body (as a fraction of body length) at position u along
 * the spine, u = 0 at the nose, u = 1 at the root of the tail.
 */
export function bodyHalfWidth(u) {
  const nose = Math.sqrt(clamp(u / 0.2, 0, 1)); // rounded head
  const taper = 1 - 0.68 * smoothstep(0.34, 1, u); // slim towards the tail
  return 0.13 * nose * taper;
}

/** Default fish length for a viewport, in CSS pixels. */
export function defaultFishSize(width, height) {
  return clamp(Math.min(width, height) * 0.115, 54, 120);
}

export function createFish(rng, bounds, size) {
  const length = size * (0.72 + rng() * 0.5);
  const segLen = length / SPINE_SEGMENTS;
  const margin = Math.min(length, Math.min(bounds.width, bounds.height) * 0.25);
  const x = margin + rng() * Math.max(1, bounds.width - 2 * margin);
  const y = margin + rng() * Math.max(1, bounds.height - 2 * margin);
  const angle = rng() * TAU;
  const spine = new Float32Array((SPINE_SEGMENTS + 1) * 2);
  for (let i = 0; i <= SPINE_SEGMENTS; i++) {
    spine[i * 2] = x - Math.cos(angle) * segLen * i;
    spine[i * 2 + 1] = y - Math.sin(angle) * segLen * i;
  }

  // Pattern: roughly a third solid, the rest with white patches of varying size.
  const r = rng();
  const patch = r < 0.33 ? 2 : 0.52 + rng() * 0.18; // >1 means "no patches"

  return {
    spine,
    length,
    segLen,
    angle,
    turn: 0,
    baseSpeed: length * (0.32 + rng() * 0.22), // body lengths per second
    speed: 0,
    burst: 0, // 0..1, dart intensity
    flick: 0, // short turn impulse when startled (rad/s)
    phase: rng() * TAU, // tail-beat phase
    wander: rng() * 1000,
    seed: rng(),
    depth: rng() < 0.3 ? 0.45 + rng() * 0.4 : rng() * 0.25, // deeper fish are paler
    patch,
  };
}

/** Is point (px, py) on the fish's body (with a small padding, in px)? */
export function hitTest(fish, px, py, pad = 6) {
  const s = fish.spine;
  // Quick reject with a bounding circle around the body middle.
  const mid = (SPINE_SEGMENTS >> 1) * 2;
  const dxm = px - s[mid];
  const dym = py - s[mid + 1];
  const r = fish.length * 0.65 + pad;
  if (dxm * dxm + dym * dym > r * r) return false;

  for (let i = 0; i < SPINE_SEGMENTS; i++) {
    const ax = s[i * 2];
    const ay = s[i * 2 + 1];
    const bx = s[i * 2 + 2];
    const by = s[i * 2 + 3];
    const vx = bx - ax;
    const vy = by - ay;
    const len2 = vx * vx + vy * vy || 1;
    const t = clamp(((px - ax) * vx + (py - ay) * vy) / len2, 0, 1);
    const cx = ax + vx * t - px;
    const cy = ay + vy * t - py;
    const u = (i + t) / SPINE_SEGMENTS;
    const w = bodyHalfWidth(u) * fish.length + pad;
    if (cx * cx + cy * cy <= w * w) return true;
  }
  return false;
}

/**
 * Advance one fish by dt seconds.
 * opts: { speed, dartBoost, dartDuration, bounds:{width,height}, fishes, pointer:{x,y,active}, rng }
 */
export function stepFish(fish, dt, time, opts) {
  const { bounds, fishes, pointer } = opts;
  const s = fish.spine;
  const hx = s[0];
  const hy = s[1];

  // --- Wander: smooth pseudo-random turning from a sum of sines.
  const w = fish.wander;
  let turn =
    0.55 * Math.sin(time * 0.31 + w) +
    0.35 * Math.sin(time * 0.73 + w * 1.7) +
    0.2 * Math.sin(time * 1.37 + w * 2.3);

  // --- Stay inside the bounds: steer towards the centre near the edges.
  const margin = Math.max(fish.length * 1.1, 60);
  const ex =
    smoothstep(margin, 0, hx) - smoothstep(bounds.width - margin, bounds.width, hx);
  const ey =
    smoothstep(margin, 0, hy) - smoothstep(bounds.height - margin, bounds.height, hy);
  const edge = Math.min(1, Math.hypot(ex, ey));
  if (edge > 0) {
    const toCentre = Math.atan2(bounds.height / 2 - hy, bounds.width / 2 - hx);
    turn = turn * (1 - edge) + angleDiff(toCentre, fish.angle) * 3.2 * edge;
  }

  // --- Mild separation so fish don't swim through each other too often.
  if (fishes) {
    for (const o of fishes) {
      if (o === fish) continue;
      const dx = hx - o.spine[(SPINE_SEGMENTS >> 1) * 2];
      const dy = hy - o.spine[(SPINE_SEGMENTS >> 1) * 2 + 1];
      const d2 = dx * dx + dy * dy;
      const r = (fish.length + o.length) * 0.4;
      if (d2 < r * r && d2 > 1e-6) {
        const away = Math.atan2(dy, dx);
        const k = 1 - Math.sqrt(d2) / r;
        turn += angleDiff(away, fish.angle) * 0.9 * k;
      }
    }
  }

  // --- Pointer: darting when the pointer is on this fish. Nothing else.
  if (pointer && pointer.active && hitTest(fish, pointer.x, pointer.y)) {
    if (fish.burst < 0.35) {
      // Fresh startle: a quick flick to one side as it bolts.
      fish.flick = (opts.rng() < 0.5 ? -1 : 1) * (1.6 + opts.rng() * 1.4);
    }
    fish.burst = 1;
  }
  const decay = Math.exp(-dt / Math.max(0.05, opts.dartDuration * 0.45));
  fish.burst *= decay;
  fish.flick *= Math.exp(-dt / 0.18);

  // Turning is a little damped so heading changes stay smooth.
  fish.turn += (turn - fish.turn) * Math.min(1, dt * 3);
  fish.angle += (fish.turn + fish.flick) * dt;

  const targetSpeed = fish.baseSpeed * (1 + opts.dartBoost * fish.burst) * opts.speed;
  fish.speed += (targetSpeed - fish.speed) * Math.min(1, dt * (fish.burst > 0.1 ? 10 : 2));

  // Tail beat speeds up with swimming speed.
  fish.phase += dt * TAU * (0.7 + 1.5 * (fish.speed / fish.length)) * Math.max(0.15, opts.speed);

  // --- Move the head, then pull the rest of the rope behind it.
  s[0] = hx + Math.cos(fish.angle) * fish.speed * dt;
  s[1] = hy + Math.sin(fish.angle) * fish.speed * dt;
  for (let i = 1; i <= SPINE_SEGMENTS; i++) {
    const dx = s[i * 2] - s[i * 2 - 2];
    const dy = s[i * 2 + 1] - s[i * 2 - 1];
    const d = Math.hypot(dx, dy) || 1;
    s[i * 2] = s[i * 2 - 2] + (dx / d) * fish.segLen;
    s[i * 2 + 1] = s[i * 2 - 1] + (dy / d) * fish.segLen;
  }

  // Safety net: if a fish somehow ends up far outside (e.g. after a resize), bring it back.
  const far = fish.length * 3;
  if (s[0] < -far || s[0] > bounds.width + far || s[1] < -far || s[1] > bounds.height + far) {
    const cx = clamp(s[0], 0, bounds.width);
    const cy = clamp(s[1], 0, bounds.height);
    const ox = cx - s[0];
    const oy = cy - s[1];
    for (let i = 0; i <= SPINE_SEGMENTS; i++) {
      s[i * 2] += ox;
      s[i * 2 + 1] += oy;
    }
  }
}

/** Move all fish proportionally when the pond is resized. */
export function rescaleFishes(fishes, from, to) {
  if (!from.width || !from.height) return;
  const sx = to.width / from.width;
  const sy = to.height / from.height;
  for (const f of fishes) {
    const s = f.spine;
    const ox = s[0] * sx - s[0];
    const oy = s[1] * sy - s[1];
    for (let i = 0; i <= SPINE_SEGMENTS; i++) {
      s[i * 2] += ox;
      s[i * 2 + 1] += oy;
    }
  }
}
