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
// - Reacting to you, like real koi: the pointer's speed and distance matter.
//   A slow or still pointer makes curious fish come over and hover at it; a
//   medium move nearby makes them turn calmly away; a fast move close by (or
//   touching a fish) startles it away from the pointer. Each fish has its own
//   boldness, gets used to you after a few frights (and slowly forgets), avoids
//   the spot where it was scared for a few seconds, and its fright spreads to
//   neighbours a moment later.
// - Feeding: fish notice food pellets nearby, race to them and eat them.
//
// The only pointer interaction: when the pointer is over a fish's body, that
// fish darts (a short burst of speed that fades out). Nothing else.

export const TAU = Math.PI * 2;
export const SPINE_SEGMENTS = 16;

// Koi varieties (colour patterns), interpreted by the scene shader.
// SOLID covers the single-colour koi: Ogon (gold, platinum, orange), Kigoi, Chagoi, Benigoi.
// KOHAKU includes Taisho Sanke (half of them carry small black spots).
export const VARIETIES = Object.freeze({
  KOHAKU: 0, SHOWA: 1, ASAGI: 2, SOLID: 3, TANCHO: 4,
  SHIRO_UTSURI: 5, HI_UTSURI: 6, KI_UTSURI: 7, SHIRO_BEKKO: 8, AI_GOROMO: 9, GOSHIKI: 10,
  SHUSUI: 11, KUMONRYU: 12, OCHIBA: 13, KUJAKU: 14, HARIWAKE: 15, SORAGOI: 16,
});
// How common each variety is (same order as above). The classic gosanke stay the most common.
export const VARIETY_WEIGHTS = [
  0.17, 0.13, 0.07, 0.09, 0.06,
  0.05, 0.04, 0.03, 0.05, 0.04, 0.04,
  0.04, 0.04, 0.03, 0.04, 0.04, 0.04,
];

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

// Names for the varieties option, in VARIETIES order.
export const VARIETY_NAMES = Object.freeze([
  'kohaku', 'showa', 'asagi', 'ogon', 'tancho',
  'shiro-utsuri', 'hi-utsuri', 'ki-utsuri', 'shiro-bekko', 'ai-goromo', 'goshiki',
  'shusui', 'kumonryu', 'ochiba', 'kujaku', 'hariwake', 'soragoi',
]);

/**
 * Turn a varieties option ('all', 'kohaku,showa', ['kohaku', 3], ...) into a
 * list of variety ids, or null for all of them. Unknown names are ignored.
 */
export function resolveVarieties(list) {
  if (list == null || list === 'all') return null;
  const items = Array.isArray(list) ? list : String(list).split(',');
  const ids = [];
  for (const item of items) {
    const id = typeof item === 'number' ? item : VARIETY_NAMES.indexOf(String(item).trim().toLowerCase());
    if (id >= 0 && id < VARIETY_NAMES.length && !ids.includes(id)) ids.push(id);
  }
  return ids.length ? ids : null;
}

/** Pick a variety from a fixed per-fish roll (0..1), weighted, among the allowed ones. */
export function pickVariety(roll, allowed = null) {
  const ids = allowed || VARIETY_NAMES.map((_, i) => i);
  let total = 0;
  for (const id of ids) total += VARIETY_WEIGHTS[id];
  let r = roll * total;
  for (const id of ids) {
    r -= VARIETY_WEIGHTS[id];
    if (r < 0) return id;
  }
  return ids[ids.length - 1];
}

/** Move a fish just outside a random edge of the pond, facing in, so it swims into view. */
export function enterFromEdge(fish, bounds, rng) {
  const side = Math.floor(rng() * 4);
  const t = 0.15 + rng() * 0.7;
  const out = fish.length * 0.4;
  const x = side === 0 ? -out : side === 1 ? bounds.width + out : bounds.width * t;
  const y = side === 2 ? -out : side === 3 ? bounds.height + out : bounds.height * t;
  const angle = Math.atan2(bounds.height / 2 - y, bounds.width / 2 - x) + (rng() - 0.5) * 0.8;
  for (let i = 0; i <= SPINE_SEGMENTS; i++) {
    fish.spine[i * 2] = x - Math.cos(angle) * fish.segLen * i;
    fish.spine[i * 2 + 1] = y - Math.sin(angle) * fish.segLen * i;
  }
  fish.angle = angle;
  fish.heading = angle;
  fish.decide = 2 + rng() * 2;
}

export function createFish(rng, bounds, size, butterfly = 0, allowed = null) {
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

  const varRoll = rng();
  const finRoll = rng();
  const variety = pickVariety(varRoll, allowed);

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
    finRoll, // fixed per fish: long fins when finRoll < the butterfly option
    longFin: finRoll < butterfly, // butterfly koi: long, flowing fins
    seed: rng(),
    depth: rng() < 0.3 ? 0.45 + rng() * 0.4 : rng() * 0.25, // deeper fish are paler
    boldness: rng(), // 0 shy .. 1 bold: how close it lets you come, how curious it is
    fear: 1, // 1 = not used to you yet; drops after each fright, slowly comes back
    curious: 0, // seconds left of being curious about the pointer
    bored: 0, // seconds before it can get curious again
    alarm: null, // a neighbour's fright reaching this fish: { t, strength, x, y }
    avoid: null, // a spot to keep away from for a while: { x, y, until }
    variety,
    varRoll, // fixed per fish: picks the variety among the allowed ones
    pinned: false, // true for fish added with a chosen variety
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
 * Startle a fish: a quick bend, then a few strong strokes. `strength` (0..1)
 * scales the burst. With `away` (an angle) it flees that way; otherwise it bolts
 * to a random side.
 */
export function startle(fish, strength = 1, away = null) {
  const rand = fish.rand;
  if (fish.burst < 0.35) {
    let side;
    if (away == null) {
      side = rand() < 0.5 ? -1 : 1;
      fish.heading = fish.angle + side * (0.5 + rand() * 0.6);
    } else {
      side = angleDiff(away, fish.angle) >= 0 ? 1 : -1;
      fish.heading = away + (rand() - 0.5) * 0.6;
    }
    fish.flick = side * (1.6 + rand() * 1.0) * (0.6 + 0.4 * strength);
    fish.amp = Math.max(fish.amp, 1.1);
    fish.rest = 0;
  }
  fish.burst = Math.max(fish.burst, strength);
}

/** A fright spreads: nearby fish feel it a moment later, a little weaker. */
function spreadAlarm(fish, fishes, x, y, strength, time) {
  if (!fishes || strength < 0.25) return;
  const mid = (SPINE_SEGMENTS >> 1) * 2;
  for (const o of fishes) {
    if (o === fish || o.alarm || o.burst > 0.35) continue;
    const d = Math.hypot(o.spine[mid] - fish.spine[mid], o.spine[mid + 1] - fish.spine[mid + 1]);
    const reach = 2.6 * Math.max(fish.length, o.length);
    if (d > reach) continue;
    o.alarm = {
      t: time + 0.12 + o.rand() * 0.22 + d / 1500, // reaction time, plus the wave travelling
      strength: strength * (0.75 + 0.25 * (1 - o.boldness)) * (1 - 0.4 * (d / reach)),
      x,
      y,
    };
  }
}

/**
 * What the fish senses this frame, and what it wants to do about it.
 * Returns { urge: 0..1, angle, speedMul }.
 */
function senses(fish, dt, time, opts, hx, hy) {
  const { fishes, pointer, food } = opts;
  const L = fish.length;
  const rand = fish.rand;
  const out = { urge: 0, angle: 0, speedMul: 1 };
  const simple = opts.behavior === 'simple';

  fish.fear = Math.min(1, fish.fear + dt / 45); // slowly forgets
  fish.bored = Math.max(0, fish.bored - dt);
  if (fish.curious > 0) {
    fish.curious -= dt;
    if (fish.curious <= 0) {
      fish.curious = 0;
      fish.bored = 4 + rand() * 6; // lost interest for a while
    }
  }

  // A neighbour's fright arriving.
  if (!simple && fish.alarm && time >= fish.alarm.t) {
    const a = fish.alarm;
    fish.alarm = null;
    if (fish.burst < 0.35 && a.strength > 0.2) {
      startle(fish, a.strength, Math.atan2(hy - a.y, hx - a.x));
      fish.avoid = { x: a.x, y: a.y, until: time + 2.5 };
      fish.curious = 0;
      spreadAlarm(fish, fishes, a.x, a.y, a.strength * 0.6, time);
    }
  }

  // The pointer.
  if (pointer && pointer.active) {
    const dx = hx - pointer.x;
    const dy = hy - pointer.y;
    const d = Math.hypot(dx, dy) || 1;
    const speed = pointer.speed || 0; // CSS px per second
    const touching = hitTest(fish, pointer.x, pointer.y);
    const away = Math.atan2(dy, dx);

    if (simple) {
      if (touching) startle(fish, 1);
    } else {
      const R = L * (1.6 + 1.2 * (1 - fish.boldness)); // how far away it notices you
      const close = clamp(1 - d / R, 0, 1);
      const fast = smoothstep(150, 900, speed); // 0 slow .. 1 sudden
      let threat = touching ? 0.75 + 0.25 * fast : close * close * fast * 1.6;
      threat *= (0.35 + 0.65 * fish.fear) * (1.2 - 0.4 * fish.boldness);

      if (threat > 0.5 && fish.burst < 0.35) {
        // Startle: away from the pointer, and the fright spreads.
        const strength = Math.min(1, threat);
        startle(fish, strength, away);
        fish.fear = Math.max(0.25, fish.fear - 0.18); // gets a little more used to you
        fish.avoid = { x: pointer.x, y: pointer.y, until: time + 3 + 2 * (1 - fish.boldness) };
        fish.curious = 0;
        fish.bored = 4;
        spreadAlarm(fish, fishes, pointer.x, pointer.y, strength * 0.6, time);
      } else if (threat > 0.15) {
        // Wary: turn calmly away, a little quicker.
        out.urge = smoothstep(0.15, 0.5, threat);
        out.angle = away;
        out.speedMul = 1.35;
        fish.curious = 0;
      } else if (
        fish.curious <= 0 && fish.bored <= 0 && !fish.avoid && speed < 80 && d < R * 2.4 &&
        rand() < dt * (0.15 + 0.9 * fish.boldness)
      ) {
        fish.curious = 3 + rand() * 5; // a slow hand: come and have a look
      }

      if (fish.curious > 0) {
        if (speed > 260) {
          fish.curious = 0; // a quick move breaks the spell
          fish.bored = 2;
        } else {
          const stop = L * 0.55;
          out.urge = 0.85;
          out.angle = Math.atan2(-dy, -dx);
          out.speedMul = d < stop * 1.6 ? 0.12 : d < stop * 3 ? 0.5 : 0.9; // slow down on arrival
          fish.rest = 0;
        }
      }
    }
  } else {
    fish.curious = 0;
  }

  // Keep away from where it was frightened, for a while.
  if (fish.avoid) {
    if (time > fish.avoid.until) {
      fish.avoid = null;
    } else if (fish.curious <= 0) {
      const dx = hx - fish.avoid.x;
      const dy = hy - fish.avoid.y;
      const d = Math.hypot(dx, dy);
      const r = L * 3;
      if (d < r) {
        const k = (1 - d / r) * 0.8;
        if (k > out.urge) {
          out.urge = k;
          out.angle = Math.atan2(dy, dx);
        }
      }
    }
  }

  // Food: notice pellets nearby, race to the closest one, eat it.
  if (food && food.length && fish.burst < 0.3) {
    const reach = L * (4 + 2 * fish.boldness);
    let best = null;
    let bestD = reach;
    for (const p of food) {
      if (p.eaten || p.age < 0.25) continue; // takes a moment to notice it
      const d = Math.hypot(p.x - hx, p.y - hy);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (best) {
      fish.curious = 0;
      fish.rest = 0;
      out.urge = 0.95;
      out.angle = Math.atan2(best.y - hy, best.x - hx);
      out.speedMul = bestD < L * 0.8 ? 0.7 : 1.5;
      if (bestD < L * 0.14 + 4) {
        best.eaten = true; // gulp
        fish.speed *= 0.7;
        fish.decide = 1 + rand() * 2;
      }
    }
  }
  return out;
}

/**
 * Advance one fish by dt seconds.
 * opts: { speed, dartBoost, dartDuration, bounds:{width,height}, fishes,
 *         pointer:{x,y,active,speed}, food: [{x,y,age,eaten}], behavior: 'natural'|'simple' }
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

  // --- Senses: the pointer, food, frightened neighbours.
  const sensed = senses(fish, dt, time, opts, hx, hy);
  const speedMul = sensed.speedMul;
  if (sensed.urge > 0) {
    // A goal (go to the pointer, flee it, reach food) overrides the wandering.
    want = want * (1 - sensed.urge) + angleDiff(sensed.angle, fish.angle) * sensed.urge * 1.6;
  }
  // Near an edge, staying in the pond still wins over chasing or fleeing.
  if (edge > 0.3) {
    const toC = Math.atan2(bounds.height / 2 - hy, bounds.width / 2 - hx);
    want = want * (1 - edge) + angleDiff(toC, fish.angle) * edge;
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
    : fish.rest > 0 && speedMul === 1 ? cruise * 0.22 : cruise * speedMul;
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

/**
 * Grow or shrink a fish in place by factor k, keeping its head where it is and
 * its pose, swimming speed in body lengths per second, and everything else.
 */
export function scaleFish(fish, k) {
  if (!(k > 0) || k === 1) return;
  const s = fish.spine;
  const hx = s[0];
  const hy = s[1];
  for (let i = 1; i <= SPINE_SEGMENTS; i++) {
    s[i * 2] = hx + (s[i * 2] - hx) * k;
    s[i * 2 + 1] = hy + (s[i * 2 + 1] - hy) * k;
  }
  fish.length *= k;
  fish.segLen *= k;
  fish.baseSpeed *= k;
  fish.speed *= k;
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
