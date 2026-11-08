// Koi simulation: pure math, no DOM / WebGL, so it can be unit-tested in Node.
//
// Each koi is a "rope" of spine points. The head steers, every following point
// is pulled to a fixed distance behind the one in front, so turns bend the whole
// body. On top of that, swimming follows how real carp-like fish move:
//
// - Burst and glide: a few tail beats to speed up, then a coast with the body
//   almost straight while water drag slows the fish, then beats again.
// - Thrust comes from a body wave that travels from head to tail, growing in
//   amplitude towards the tail (applied at render time, see geometry.js). Tail
//   beat frequency rises with speed.
// - Behaviour: mostly straight runs with deliberate turns to a new heading,
//   occasional slow hovering. Slow fish turn slowly; fast fish turn more easily.
// - Startle (pointer on the fish): a sharp C-bend to one side, then a burst of
//   strong, fast tail beats, then a long glide back to calm.
//
// The only pointer interaction: when the pointer is over a fish's body, that
// fish darts (a short burst of speed that fades out). Nothing else.

export const TAU = Math.PI * 2;
export const SPINE_SEGMENTS = 16;

// Koi varieties (colour patterns), interpreted by the scene shader.
export const VARIETIES = Object.freeze({ KOHAKU: 0, SHOWA: 1, ASAGI: 2, SOLID: 3, TANCHO: 4 });
const VARIETY_WEIGHTS = [0.3, 0.24, 0.18, 0.16, 0.12];

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
 * Top-view koi outline: half-width (as a fraction of body length) at points
 * along the spine, u = 0 at the snout, u = 1 at the root of the tail.
 * Spindle shape: a narrower head that tapers to a rounded snout, the widest
 * point just behind the head (about a third of the way back), then a long,
 * even taper to a slim tail stem. Measured against the reference fish.
 */
const OUTLINE = [
  [0.0, 0.0],
  [0.025, 0.0495],
  [0.07, 0.0814],
  [0.14, 0.1078],
  [0.23, 0.1276],
  [0.32, 0.1364],
  [0.42, 0.132],
  [0.54, 0.1144],
  [0.66, 0.088],
  [0.77, 0.0627],
  [0.88, 0.044],
  [1.0, 0.0363],
];

// Tangents for a smooth (cubic Hermite) curve through the outline points.
const OUTLINE_T = OUTLINE.map((p, i) => {
  const a = OUTLINE[Math.max(0, i - 1)];
  const b = OUTLINE[Math.min(OUTLINE.length - 1, i + 1)];
  return (b[1] - a[1]) / (b[0] - a[0]);
});

export function bodyHalfWidth(u) {
  if (u <= 0) return 0;
  if (u >= 1) return OUTLINE[OUTLINE.length - 1][1];
  // Rounded snout: a quarter ellipse over the first few percent.
  if (u < OUTLINE[1][0]) {
    const k = u / OUTLINE[1][0];
    return OUTLINE[1][1] * Math.sqrt(1 - (1 - k) * (1 - k));
  }
  let i = 1;
  while (u > OUTLINE[i + 1][0]) i++;
  const [u0, w0] = OUTLINE[i];
  const [u1, w1] = OUTLINE[i + 1];
  const h = u1 - u0;
  const t = (u - u0) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * w0 +
    (t3 - 2 * t2 + t) * h * OUTLINE_T[i] +
    (-2 * t3 + 3 * t2) * w1 +
    (t3 - t2) * h * OUTLINE_T[i + 1]
  );
}

/** Default fish length for a viewport, in CSS pixels. */
export function defaultFishSize(width, height) {
  return clamp(Math.min(width, height) * 0.13, 52, 128);
}

export function createFish(rng, bounds, size) {
  const length = size * (0.8 + rng() * 0.38);
  const baseSpeed = length * (0.3 + rng() * 0.2); // body lengths per second
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

  let pick = rng();
  let variety = 0;
  while (variety < VARIETY_WEIGHTS.length - 1 && pick >= VARIETY_WEIGHTS[variety]) {
    pick -= VARIETY_WEIGHTS[variety];
    variety++;
  }

  return {
    spine,
    length,
    segLen,
    angle,
    turn: 0, // current turning rate (rad/s)
    baseSpeed, // cruising speed (px/s)
    speed: baseSpeed * (0.6 + rng() * 0.4),
    burst: 0, // 0..1, dart intensity
    flick: 0, // short turn impulse when startled (rad/s)
    phase: rng() * TAU, // tail-beat phase
    amp: 0.8, // tail-beat amplitude, 0 = gliding straight, ~1 = cruising, >1 = bursting
    beating: true, // burst-and-glide: currently beating the tail (true) or gliding
    glideTo: 0.75, // glide until speed drops to this fraction of the target speed
    heading: angle, // the heading the fish has decided to swim towards
    decide: 1 + rng() * 3, // seconds until the next decision
    rest: 0, // seconds left of slow hovering
    finPhase: rng() * TAU, // slow sculling of the side fins
    rand: mulberry32((rng() * 4294967296) >>> 0), // per-fish randomness
    seed: rng(),
    depth: rng() < 0.3 ? 0.45 + rng() * 0.4 : rng() * 0.25, // deeper fish are paler
    variety,
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
 * opts: { speed, dartBoost, dartDuration, bounds:{width,height}, fishes, pointer:{x,y,active} }
 */
export function stepFish(fish, dt, time, opts) {
  const { bounds, fishes, pointer } = opts;
  const s = fish.spine;
  const hx = s[0];
  const hy = s[1];
  const L = fish.length;
  const rand = fish.rand;

  // --- Decisions: hold a heading for a while, then pick a new one. Sometimes hover.
  fish.decide -= dt;
  if (fish.rest > 0) fish.rest -= dt;
  if (fish.decide <= 0) {
    const r = rand();
    if (r < 0.12 && fish.rest <= 0) {
      fish.rest = 2 + rand() * 3; // slow down and hover for a few seconds
      fish.decide = fish.rest + 0.5;
    } else {
      // Mostly gentle course changes, sometimes a bigger turn.
      const big = r > 0.8;
      fish.heading = fish.angle + (rand() - 0.5) * (big ? 3.2 : 1.3);
      fish.decide = 2 + rand() * 4;
    }
  }
  let want = angleDiff(fish.heading, fish.angle);

  // --- Stay inside the bounds: near an edge, head back towards the middle.
  const margin = Math.max(L * 1.2, 70);
  const ex = smoothstep(margin, 0, hx) - smoothstep(bounds.width - margin, bounds.width, hx);
  const ey = smoothstep(margin, 0, hy) - smoothstep(bounds.height - margin, bounds.height, hy);
  const edge = Math.min(1, Math.hypot(ex, ey));
  if (edge > 0) {
    const toCentre = Math.atan2(bounds.height / 2 - hy, bounds.width / 2 - hx);
    want = want * (1 - edge) + angleDiff(toCentre, fish.angle) * edge;
    if (edge > 0.5) {
      fish.heading = toCentre;
      fish.rest = 0;
    }
  }

  // --- Mild separation so fish don't swim through each other too often.
  if (fishes) {
    for (const o of fishes) {
      if (o === fish) continue;
      const dx = hx - o.spine[(SPINE_SEGMENTS >> 1) * 2];
      const dy = hy - o.spine[(SPINE_SEGMENTS >> 1) * 2 + 1];
      const d2 = dx * dx + dy * dy;
      const r = (L + o.length) * 0.4;
      if (d2 < r * r && d2 > 1e-6) {
        const k = 1 - Math.sqrt(d2) / r;
        want += angleDiff(Math.atan2(dy, dx), fish.angle) * 0.8 * k;
      }
    }
  }

  // --- Pointer: startle when the pointer is on this fish. Nothing else.
  if (pointer && pointer.active && hitTest(fish, pointer.x, pointer.y)) {
    if (fish.burst < 0.35) {
      // Startle: a quick bend to one side, then a few strong strokes.
      const side = rand() < 0.5 ? -1 : 1;
      fish.flick = side * (1.6 + rand() * 1.0);
      fish.heading = fish.angle + side * (0.5 + rand() * 0.6);
      fish.amp = Math.max(fish.amp, 1.1);
      fish.rest = 0;
    }
    fish.burst = 1;
  }
  fish.burst *= Math.exp(-dt / Math.max(0.05, opts.dartDuration * 0.45));
  fish.flick *= Math.exp(-dt / 0.15);

  // --- Turning: limited by speed (a slow fish can only turn slowly), smoothed.
  const speedRatio = fish.speed / L;
  const maxTurn = (0.35 + 1.5 * Math.min(1, speedRatio / 0.6)) * (1 + edge);
  const turnTarget = clamp(want * 1.4, -maxTurn, maxTurn);
  fish.turn += (turnTarget - fish.turn) * (1 - Math.exp(-dt * 2.5));
  fish.angle += (fish.turn + fish.flick) * dt;

  // --- Burst and glide.
  const cruise = fish.baseSpeed * opts.speed;
  const target = fish.burst > 0.02
    ? cruise * (1 + opts.dartBoost * fish.burst)
    : fish.rest > 0 ? cruise * 0.22 : cruise;
  if (fish.burst > 0.05 || Math.abs(want) > 0.9) {
    fish.beating = true; // power through startles and sharp turns
  } else if (fish.beating && fish.speed > target * 1.15) {
    fish.beating = false; // up to speed: glide
    fish.glideTo = 0.62 + rand() * 0.22;
  } else if (!fish.beating && fish.speed < target * fish.glideTo) {
    fish.beating = true; // slowed down: beat again
  }

  // Tail-beat amplitude eases in and out; a gliding fish keeps a tiny residual sway.
  const ampTarget = fish.beating ? 0.85 + 0.25 * fish.burst : fish.rest > 0 ? 0.05 : 0.1;
  fish.amp += (ampTarget - fish.amp) * (1 - Math.exp(-dt * (fish.burst > 0.1 ? 7 : 4)));

  // Thrust while beating, water drag always.
  if (fish.beating) {
    const k = 1.3 * fish.amp * (1 + 2.5 * fish.burst);
    fish.speed += (target * (1.3 - 0.2 * fish.burst) - fish.speed) * (1 - Math.exp(-dt * k));
  } else {
    fish.speed *= Math.exp(-dt / 2.1);
  }

  // Tail beat frequency rises with speed (about 1-2 beats/s cruising, faster when bursting).
  const hz = (0.8 + 2.4 * (fish.speed / L)) * (1 + 0.3 * fish.burst);
  fish.phase += TAU * hz * dt * (0.3 + 0.7 * Math.min(1, fish.amp)) * Math.max(0.2, Math.min(1, opts.speed * 2));
  fish.finPhase += TAU * 0.9 * dt;

  // --- Move the head (with a slight surge on each tail stroke), then pull the rope.
  const v = fish.speed * (1 + 0.06 * Math.min(1, fish.amp) * Math.sin(2 * fish.phase));
  s[0] = hx + Math.cos(fish.angle) * v * dt;
  s[1] = hy + Math.sin(fish.angle) * v * dt;
  for (let i = 1; i <= SPINE_SEGMENTS; i++) {
    const dx = s[i * 2] - s[i * 2 - 2];
    const dy = s[i * 2 + 1] - s[i * 2 - 1];
    const d = Math.hypot(dx, dy) || 1;
    s[i * 2] = s[i * 2 - 2] + (dx / d) * fish.segLen;
    s[i * 2 + 1] = s[i * 2 - 1] + (dy / d) * fish.segLen;
  }

  // Safety net: if a fish somehow ends up far outside (e.g. after a resize), bring it back.
  const far = L * 3;
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
