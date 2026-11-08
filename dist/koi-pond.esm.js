/*! koi-pond v0.1.0 | MIT */

// src/sim.js
var TAU = Math.PI * 2;
var SPINE_SEGMENTS = 16;
var VARIETIES = Object.freeze({ KOHAKU: 0, SHOWA: 1, ASAGI: 2, SOLID: 3, TANCHO: 4 });
var VARIETY_WEIGHTS = [0.3, 0.24, 0.18, 0.16, 0.12];
function mulberry32(seed) {
  let a = seed >>> 0;
  return function() {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function clamp(x, a, b) {
  return x < a ? a : x > b ? b : x;
}
function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
function angleDiff(to, from) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}
function bodyHalfWidth(u) {
  const nose = Math.pow(clamp(u / 0.16, 0, 1), 0.42);
  const taper = 1 - 0.8 * Math.pow(smoothstep(0.34, 1, u), 0.9);
  return 0.17 * nose * taper;
}
function defaultFishSize(width, height) {
  return clamp(Math.min(width, height) * 0.115, 54, 120);
}
function createFish(rng, bounds, size) {
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
    turn: 0,
    baseSpeed: length * (0.32 + rng() * 0.22),
    // body lengths per second
    speed: 0,
    burst: 0,
    // 0..1, dart intensity
    flick: 0,
    // short turn impulse when startled (rad/s)
    phase: rng() * TAU,
    // tail-beat phase
    wander: rng() * 1e3,
    seed: rng(),
    depth: rng() < 0.3 ? 0.45 + rng() * 0.4 : rng() * 0.25,
    // deeper fish are paler
    variety
  };
}
function hitTest(fish, px2, py2, pad = 6) {
  const s = fish.spine;
  const mid = (SPINE_SEGMENTS >> 1) * 2;
  const dxm = px2 - s[mid];
  const dym = py2 - s[mid + 1];
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
    const t = clamp(((px2 - ax) * vx + (py2 - ay) * vy) / len2, 0, 1);
    const cx = ax + vx * t - px2;
    const cy = ay + vy * t - py2;
    const u = (i + t) / SPINE_SEGMENTS;
    const w = bodyHalfWidth(u) * fish.length + pad;
    if (cx * cx + cy * cy <= w * w) return true;
  }
  return false;
}
function stepFish(fish, dt, time, opts) {
  const { bounds, fishes, pointer } = opts;
  const s = fish.spine;
  const hx = s[0];
  const hy = s[1];
  const w = fish.wander;
  let turn = 0.7 * Math.sin(time * 0.31 + w) + 0.45 * Math.sin(time * 0.73 + w * 1.7) + 0.25 * Math.sin(time * 1.37 + w * 2.3);
  const margin = Math.max(fish.length * 1.1, 60);
  const ex = smoothstep(margin, 0, hx) - smoothstep(bounds.width - margin, bounds.width, hx);
  const ey = smoothstep(margin, 0, hy) - smoothstep(bounds.height - margin, bounds.height, hy);
  const edge = Math.min(1, Math.hypot(ex, ey));
  if (edge > 0) {
    const toCentre = Math.atan2(bounds.height / 2 - hy, bounds.width / 2 - hx);
    turn = turn * (1 - edge) + angleDiff(toCentre, fish.angle) * 3.2 * edge;
  }
  if (fishes) {
    for (const o2 of fishes) {
      if (o2 === fish) continue;
      const dx = hx - o2.spine[(SPINE_SEGMENTS >> 1) * 2];
      const dy = hy - o2.spine[(SPINE_SEGMENTS >> 1) * 2 + 1];
      const d2 = dx * dx + dy * dy;
      const r = (fish.length + o2.length) * 0.4;
      if (d2 < r * r && d2 > 1e-6) {
        const away = Math.atan2(dy, dx);
        const k = 1 - Math.sqrt(d2) / r;
        turn += angleDiff(away, fish.angle) * 0.9 * k;
      }
    }
  }
  if (pointer && pointer.active && hitTest(fish, pointer.x, pointer.y)) {
    if (fish.burst < 0.35) {
      fish.flick = (opts.rng() < 0.5 ? -1 : 1) * (1.6 + opts.rng() * 1.4);
    }
    fish.burst = 1;
  }
  const decay = Math.exp(-dt / Math.max(0.05, opts.dartDuration * 0.45));
  fish.burst *= decay;
  fish.flick *= Math.exp(-dt / 0.18);
  fish.turn += (turn - fish.turn) * Math.min(1, dt * 3);
  fish.angle += (fish.turn + fish.flick) * dt;
  const targetSpeed = fish.baseSpeed * (1 + opts.dartBoost * fish.burst) * opts.speed;
  fish.speed += (targetSpeed - fish.speed) * Math.min(1, dt * (fish.burst > 0.1 ? 10 : 2));
  fish.phase += dt * TAU * (0.7 + 1.5 * (fish.speed / fish.length)) * Math.max(0.15, opts.speed);
  s[0] = hx + Math.cos(fish.angle) * fish.speed * dt;
  s[1] = hy + Math.sin(fish.angle) * fish.speed * dt;
  for (let i = 1; i <= SPINE_SEGMENTS; i++) {
    const dx = s[i * 2] - s[i * 2 - 2];
    const dy = s[i * 2 + 1] - s[i * 2 - 1];
    const d = Math.hypot(dx, dy) || 1;
    s[i * 2] = s[i * 2 - 2] + dx / d * fish.segLen;
    s[i * 2 + 1] = s[i * 2 - 1] + dy / d * fish.segLen;
  }
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
function rescaleFishes(fishes, from, to) {
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

// src/geometry.js
var FLOATS_PER_VERTEX = 8;
var TAIL_ROWS = 7;
var FIN_COUNT = 4;
var VERTICES_PER_FISH = (SPINE_SEGMENTS + (TAIL_ROWS - 1) + FIN_COUNT) * 6;
var px = new Float32Array(SPINE_SEGMENTS + 1);
var py = new Float32Array(SPINE_SEGMENTS + 1);
var nx = new Float32Array(SPINE_SEGMENTS + 1);
var ny = new Float32Array(SPINE_SEGMENTS + 1);
var out;
var o;
function vert(x, y, u, v, kind, f) {
  out[o++] = x;
  out[o++] = y;
  out[o++] = u;
  out[o++] = v;
  out[o++] = kind;
  out[o++] = f.seed;
  out[o++] = f.depth;
  out[o++] = f.variety;
}
function quad(alx, aly, arx, ary, blx, bly, brx, bry, ua, ub, kind, f) {
  vert(alx, aly, ua, -1, kind, f);
  vert(arx, ary, ua, 1, kind, f);
  vert(blx, bly, ub, -1, kind, f);
  vert(arx, ary, ua, 1, kind, f);
  vert(brx, bry, ub, 1, kind, f);
  vert(blx, bly, ub, -1, kind, f);
}
function pairedFins(f, i, len, halfW, sweepBase, flapAmp, flapOffset) {
  const L = f.length;
  let tx = px[i - 1] - px[i + 1];
  let ty = py[i - 1] - py[i + 1];
  const tl = Math.hypot(tx, ty) || 1;
  tx /= tl;
  ty /= tl;
  const hw = bodyHalfWidth(i / SPINE_SEGMENTS) * L;
  for (const side of [-1, 1]) {
    const sweep = sweepBase + 0.45 * f.burst + flapAmp * Math.sin(f.phase * 0.55 + side * 1.3 + flapOffset);
    const dx = -tx * Math.cos(sweep) + -ty * side * Math.sin(sweep);
    const dy = -ty * Math.cos(sweep) + tx * side * Math.sin(sweep);
    const rx = px[i] + -ty * side * hw * 0.62;
    const ry = py[i] + tx * side * hw * 0.62;
    const qx = -dy;
    const qy = dx;
    const ex = rx + dx * len;
    const ey = ry + dy * len;
    quad(
      rx - qx * halfW,
      ry - qy * halfW,
      rx + qx * halfW,
      ry + qy * halfW,
      ex - qx * halfW,
      ey - qy * halfW,
      ex + qx * halfW,
      ey + qy * halfW,
      0,
      1,
      2,
      f
    );
  }
}
function writeFish(f) {
  const s = f.spine;
  const L = f.length;
  const amp = L * 0.045 * (1 + 0.6 * f.burst);
  for (let i = 0; i <= SPINE_SEGMENTS; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(SPINE_SEGMENTS, i + 1);
    let tx = s[a * 2] - s[b * 2];
    let ty = s[a * 2 + 1] - s[b * 2 + 1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    nx[i] = -ty;
    ny[i] = tx;
    const u = i / SPINE_SEGMENTS;
    const off = Math.sin(f.phase - u * 4.6) * amp * (0.1 + Math.pow(u, 1.6));
    px[i] = s[i * 2] + nx[i] * off;
    py[i] = s[i * 2 + 1] + ny[i] * off;
  }
  const pect = Math.round(SPINE_SEGMENTS * 0.2);
  const pelv = Math.round(SPINE_SEGMENTS * 0.56);
  pairedFins(f, pect, L * 0.24, L * 0.11, 0.95, 0.3, 0);
  pairedFins(f, pelv, L * 0.15, L * 0.065, 0.8, 0.18, 2.1);
  {
    const e = SPINE_SEGMENTS;
    const base = Math.atan2(py[e] - py[e - 1], px[e] - px[e - 1]);
    const tailLen = L * 0.38;
    const step = tailLen / (TAIL_ROWS - 1);
    let prev = null;
    let cx = px[e];
    let cy = py[e];
    for (let j = 0; j < TAIL_ROWS; j++) {
      const t = j / (TAIL_ROWS - 1);
      const ang = base + Math.sin(f.phase - 5.2 - t * 1.4) * 0.5 * t;
      if (j > 0) {
        cx += Math.cos(ang) * step;
        cy += Math.sin(ang) * step;
      }
      const hw = L * (0.035 + 0.24 * Math.pow(t, 0.9));
      const qx = -Math.sin(ang);
      const qy = Math.cos(ang);
      const row = { lx: cx - qx * hw, ly: cy - qy * hw, rx: cx + qx * hw, ry: cy + qy * hw, t };
      if (prev) quad(prev.lx, prev.ly, prev.rx, prev.ry, row.lx, row.ly, row.rx, row.ry, prev.t, row.t, 1, f);
      prev = row;
    }
  }
  for (let i = 0; i < SPINE_SEGMENTS; i++) {
    const ua = i / SPINE_SEGMENTS;
    const ub = (i + 1) / SPINE_SEGMENTS;
    const wa = Math.max(bodyHalfWidth(ua), 0.05) * L;
    const wb = bodyHalfWidth(ub) * L;
    const j = i + 1;
    quad(
      px[i] - nx[i] * wa,
      py[i] - ny[i] * wa,
      px[i] + nx[i] * wa,
      py[i] + ny[i] * wa,
      px[j] - nx[j] * wb,
      py[j] - ny[j] * wb,
      px[j] + nx[j] * wb,
      py[j] + ny[j] * wb,
      ua,
      ub,
      0,
      f
    );
  }
}
function buildGeometry(fishes, buffer) {
  out = buffer;
  o = 0;
  const order = fishes.slice().sort((a, b) => b.depth - a.depth);
  for (const f of order) writeFish(f);
  return o / FLOATS_PER_VERTEX;
}

// src/renderer.js
var SCENE_VS = `#version 300 es
layout(location = 0) in vec2 a_pos;
layout(location = 1) in vec2 a_uv;
layout(location = 2) in vec4 a_meta;
uniform vec2 u_res;
out vec2 v_uv;
out vec4 v_meta;
void main() {
  v_uv = a_uv;
  v_meta = a_meta;
  vec2 c = a_pos / u_res * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
}`;
var SCENE_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
in vec4 v_meta;
out vec4 o;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// Patches: blobs that stretch across the back, like real koi markings.
float blobs(vec2 p) {
  return vnoise(p) * 0.62 + vnoise(p * 2.1 + 3.1) * 0.27 + vnoise(p * 4.7 + 7.7) * 0.11;
}

const float WHITE = 0.25;   // "white" skin: a fill of the palest dots
const float RIM = 0.44;     // the outline around every fish, a step darker than white skin

void main() {
  float kind = v_meta.x;
  float seed = v_meta.y;
  float depth = v_meta.z;
  float variety = v_meta.w;
  float u = v_uv.x;
  float v = v_uv.y;
  float av = abs(v);
  float ink;
  float a;

  if (kind < 0.5) {
    // ---------- Body ----------
    a = 1.0 - smoothstep(0.9, 1.0, av);
    float edge = smoothstep(0.62, 0.97, av);        // 0 along the spine, 1 at the rim
    float ridge = 1.0 - smoothstep(0.0, 0.38, av);  // darker line down the back

    vec2 sd = seed * vec2(37.1, 11.7);
    float n = blobs(vec2(u * 2.7, v * 0.7) + sd);
    float n2 = blobs(vec2(u * 3.9, v * 0.9) + sd.yx * 1.7);

    // Scales: an offset grid of small rounded cells along the body.
    vec2 sc = vec2(u * 13.0, v * 2.3);
    sc.y += 0.5 * mod(floor(sc.x), 2.0);
    float scaleRim = smoothstep(0.24, 0.5, length((fract(sc) - 0.5) * vec2(1.0, 1.2)));

    float base;
    if (variety < 0.5) {
      // Kohaku: white body with large deep patches.
      base = mix(WHITE, 0.97, smoothstep(0.47, 0.505, n));
    } else if (variety < 1.5) {
      // Showa: deep body broken by white and mid-tone patches.
      base = mix(0.97, 0.6, smoothstep(0.55, 0.58, n2));
      base = mix(base, WHITE, smoothstep(0.58, 0.61, n));
    } else if (variety < 2.5) {
      // Asagi: mid-tone body with a net of lighter scale edges and a darker back.
      base = 0.6 + 0.2 * ridge - 0.16 * scaleRim * (1.0 - ridge * 0.6);
    } else if (variety < 3.5) {
      // Solid: deep all over, scales just catching the light.
      base = 0.93 - 0.12 * scaleRim * (1.0 - ridge);
    } else {
      // Tancho-like: white with a deep spot on the head and a few small marks.
      float head = 1.0 - smoothstep(0.7, 1.0, length(vec2((u - 0.14) * 9.0, v * 1.9)));
      float marks = smoothstep(0.62, 0.65, n);
      base = mix(WHITE, 0.95, max(head, marks));
    }

    // White skin shows a faint scale texture too.
    float isWhite = 1.0 - smoothstep(WHITE, WHITE + 0.2, base);
    base += isWhite * 0.05 * (1.0 - scaleRim);

    ink = base + 0.05 * ridge;
    // Pale outline: dark areas fade to the rim tone, white areas gain it.
    ink = mix(ink, RIM, edge * 0.8);
    // Snout and tail stem are a touch lighter, so the head reads rounded.
    ink = mix(ink, min(ink, 0.55), (1.0 - smoothstep(0.0, 0.06, u)) * 0.7);
    ink = mix(ink, 0.5, smoothstep(0.88, 1.0, u) * 0.6);

    // Eyes: tiny dark points on each side of the head.
    float eye = 1.0 - smoothstep(0.012, 0.022, length(vec2(u - 0.085, (av - 0.62) * 0.13)));
    ink = mix(ink, 1.0, eye);
  } else if (kind < 1.5) {
    // ---------- Tail fin: big, pale and forked, with fin rays ----------
    float cut = (u - 0.5) * 0.85;
    float notch = cut > 0.0 ? 1.0 - smoothstep(cut - 0.16, cut + 0.02, av) : 0.0;
    float edge = 1.0 - smoothstep(0.72, 1.0, av);
    float tip = 1.0 - smoothstep(0.78, 1.0, u + 0.18 * (1.0 - av));
    a = edge * tip * (1.0 - notch);
    float rays = 0.85 + 0.15 * sin(v * 15.0 + seed * 20.0);
    ink = mix(0.42, 0.15, smoothstep(0.0, 0.5, u)) * rays;
  } else {
    // ---------- Paired fins: translucent rounded fans with rays ----------
    float r = length(vec2((u - 0.55) / 0.5, v / (0.3 + 0.7 * u)));
    a = 1.0 - smoothstep(0.62, 1.0, r);
    float rays = 0.88 + 0.12 * sin(v * 10.0 + u * 3.0);
    ink = mix(0.3, 0.13, u) * rays;
  }

  // Deeper fish are paler.
  ink *= mix(1.0, 0.6, depth);
  o = vec4(clamp(ink, 0.0, 1.0), 0.0, 0.0, a);
}`;
var DITHER_VS = `#version 300 es
void main() {
  // Full-screen triangle.
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
var DITHER_FS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D u_scene;
uniform float u_canvasH;
uniform float u_dot;
uniform int u_mode;
uniform vec3 u_ink;
uniform vec4 u_bg;
uniform float u_stops[9]; // ink amount of each palette tone, u_stops[0] = 0 (paper)
uniform int u_count;      // number of tones including paper
out vec4 o;

float bayer8(ivec2 p) {
  int x = p.x & 7;
  int y = p.y & 7;
  int xy = x ^ y;
  int v = ((xy & 1) << 5) | ((y & 1) << 4) | ((xy & 2) << 2)
        | ((y & 2) << 1) | ((xy & 4) >> 1) | ((y & 4) >> 2);
  return (float(v) + 0.5) / 64.0;
}

void main() {
  vec2 fc = vec2(gl_FragCoord.x, u_canvasH - gl_FragCoord.y);
  ivec2 cell = ivec2(floor(fc / u_dot));
  ivec2 ts = textureSize(u_scene, 0);
  ivec2 tc = ivec2(min(cell.x, ts.x - 1), ts.y - 1 - min(cell.y, ts.y - 1));
  float k = texelFetch(u_scene, tc, 0).r;

  float b = bayer8(cell);
  float th;
  if (u_mode == 1) {
    // Line screen: horizontal lines that get thicker as ink increases.
    float l = abs(fract((float(cell.y) + 0.5) / 5.0) - 0.5) * 2.0;
    th = l * 0.86 + b * 0.14;
  } else {
    th = b;
  }
  // Ordered dither between the two palette tones around k.
  int i = 0;
  for (int j = 1; j < 9; j++) {
    if (j >= u_count) break;
    if (k >= u_stops[j]) i = j;
  }
  float tone;
  if (i >= u_count - 1) {
    tone = u_stops[u_count - 1];
  } else {
    float lo = u_stops[i];
    float hi = u_stops[i + 1];
    tone = (k - lo) / (hi - lo) > th ? hi : lo;
  }
  vec3 bgP = u_bg.rgb * u_bg.a; // premultiplied
  o = vec4(mix(bgP, u_ink, tone), mix(u_bg.a, 1.0, tone));
}`;
function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("koi-pond: shader compile failed: " + log);
  }
  return sh;
}
function program(gl, vs, fs) {
  const p = gl.createProgram();
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error("koi-pond: program link failed: " + gl.getProgramInfoLog(p));
  }
  return p;
}
function createRenderer(gl) {
  const sceneProg = program(gl, SCENE_VS, SCENE_FS);
  const ditherProg = program(gl, DITHER_VS, DITHER_FS);
  const loc = {
    res: gl.getUniformLocation(sceneProg, "u_res"),
    scene: gl.getUniformLocation(ditherProg, "u_scene"),
    canvasH: gl.getUniformLocation(ditherProg, "u_canvasH"),
    dot: gl.getUniformLocation(ditherProg, "u_dot"),
    mode: gl.getUniformLocation(ditherProg, "u_mode"),
    ink: gl.getUniformLocation(ditherProg, "u_ink"),
    bg: gl.getUniformLocation(ditherProg, "u_bg"),
    stops: gl.getUniformLocation(ditherProg, "u_stops"),
    count: gl.getUniformLocation(ditherProg, "u_count")
  };
  const stopBuf = new Float32Array(9);
  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  const stride = 8 * 4;
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 16);
  gl.bindVertexArray(null);
  const emptyVao = gl.createVertexArray();
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer();
  let sceneW = 0;
  let sceneH = 0;
  function resizeScene(w, h) {
    if (w === sceneW && h === sceneH) return;
    sceneW = w;
    sceneH = h;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  return {
    /**
     * frame: { canvasW, canvasH (device px), dot (device px per dot), cssPerDot,
     *          vertices: Float32Array, count, mode: 0|1, ink:[r,g,b], bg:[r,g,b,a],
     *          stops: [0, ..., 1] ink amount of each palette tone }
     */
    render(frame) {
      const sw = Math.max(1, Math.ceil(frame.canvasW / frame.dot));
      const sh = Math.max(1, Math.ceil(frame.canvasH / frame.dot));
      resizeScene(sw, sh);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, sw, sh);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (frame.count > 0) {
        gl.useProgram(sceneProg);
        gl.uniform2f(loc.res, sw * frame.cssPerDot, sh * frame.cssPerDot);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, frame.vertices.subarray(0, frame.count * 8), gl.DYNAMIC_DRAW);
        gl.drawArrays(gl.TRIANGLES, 0, frame.count);
        gl.disable(gl.BLEND);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, frame.canvasW, frame.canvasH);
      gl.useProgram(ditherProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(loc.scene, 0);
      gl.uniform1f(loc.canvasH, frame.canvasH);
      gl.uniform1f(loc.dot, frame.dot);
      gl.uniform1i(loc.mode, frame.mode);
      gl.uniform3fv(loc.ink, frame.ink);
      gl.uniform4fv(loc.bg, frame.bg);
      stopBuf.fill(1);
      stopBuf.set(frame.stops.slice(0, 9));
      gl.uniform1fv(loc.stops, stopBuf);
      gl.uniform1i(loc.count, Math.min(9, frame.stops.length));
      gl.bindVertexArray(emptyVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
    },
    dispose() {
      gl.deleteProgram(sceneProg);
      gl.deleteProgram(ditherProg);
      gl.deleteBuffer(vbo);
      gl.deleteVertexArray(vao);
      gl.deleteVertexArray(emptyVao);
      gl.deleteTexture(tex);
      gl.deleteFramebuffer(fbo);
    }
  };
}

// src/index.js
var DEFAULTS = Object.freeze({
  target: null,
  // element or selector; null / document.body = fixed full-page background
  canvas: null,
  // use your own <canvas> instead (sized by your CSS)
  count: 10,
  // number of koi
  fishSize: "auto",
  // body length in CSS px, or 'auto' (scales with the viewport)
  ink: "#1a42e2",
  // dot colour
  background: "#eff5fd",
  // paper colour, or 'transparent'
  mode: "bayer",
  // 'bayer' | 'lines'
  tones: 4,
  // shades of ink between paper and full ink (1 = single colour, max 8)
  pixelSize: 1.5,
  // size of one dot in CSS px
  speed: 1,
  // swimming speed multiplier
  dartBoost: 3.5,
  // extra speed while darting (3.5 = 4.5x normal)
  dartDuration: 1.2,
  // seconds until a dart has mostly faded
  interactive: true,
  // dart when the pointer is on a fish
  maxDpr: 2,
  // cap for devicePixelRatio
  reducedMotion: "auto",
  // 'auto' slows everything down if the user prefers reduced motion
  zIndex: -1,
  // z-index of the full-page canvas
  seed: null
  // number for a repeatable pond
});
function parseColor(c) {
  if (c == null || c === "transparent") return [0, 0, 0, 0];
  if (Array.isArray(c)) return [c[0] / 255, c[1] / 255, c[2] / 255, c[3] == null ? 1 : c[3]];
  let s = String(c).trim();
  const m = s.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return [p[0] / 255, p[1] / 255, p[2] / 255, p[3] == null ? 1 : p[3]];
  }
  if (s[0] === "#") s = s.slice(1);
  if (s.length === 3 || s.length === 4) s = s.split("").map((ch) => ch + ch).join("");
  const n = parseInt(s, 16);
  if (Number.isNaN(n) || s.length !== 6 && s.length !== 8) {
    throw new Error('koi-pond: unsupported colour "' + c + '" (use hex or rgb())');
  }
  if (s.length === 8) {
    return [(n >>> 24 & 255) / 255, (n >>> 16 & 255) / 255, (n >>> 8 & 255) / 255, (n & 255) / 255];
  }
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255, 1];
}
function toneStops(n) {
  const count = Math.max(1, Math.min(8, Math.round(n) || 1));
  const stops = [0];
  for (let i = 1; i <= count; i++) stops.push(Math.pow(i / count, 0.85));
  return stops;
}
function resolveTarget(t) {
  if (typeof document === "undefined") throw new Error("koi-pond needs a browser");
  if (!t) return document.body;
  if (typeof t === "string") {
    const el = document.querySelector(t);
    if (!el) throw new Error('koi-pond: no element matches "' + t + '"');
    return el;
  }
  return t;
}
function createKoiPond(options = {}) {
  const opts = { ...DEFAULTS, ...options };
  let ownsCanvas = false;
  let canvas = opts.canvas;
  let host = null;
  let fullPage = false;
  if (!canvas) {
    host = resolveTarget(opts.target);
    fullPage = host === document.body || host === document.documentElement;
    canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.className = "koi-pond-canvas";
    const st = canvas.style;
    st.display = "block";
    st.pointerEvents = "none";
    st.userSelect = "none";
    if (fullPage) {
      st.position = "fixed";
      st.inset = "0";
      st.width = "100vw";
      st.height = "100vh";
      st.zIndex = String(opts.zIndex);
      document.body.prepend(canvas);
    } else {
      if (getComputedStyle(host).position === "static") host.style.position = "relative";
      st.position = "absolute";
      st.inset = "0";
      st.width = "100%";
      st.height = "100%";
      st.zIndex = "0";
      host.prepend(canvas);
    }
    ownsCanvas = true;
  }
  const rng = mulberry32(opts.seed == null ? Math.random() * 2 ** 32 >>> 0 : opts.seed);
  const reduceQuery = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  let gl = null;
  let renderer = null;
  let ink = parseColor(opts.ink);
  let bg = parseColor(opts.background);
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
    return opts.fishSize === "auto" ? defaultFishSize(bounds.width, bounds.height) : +opts.fishSize;
  }
  function syncFishCount() {
    const n = Math.max(0, Math.floor(opts.count));
    const size = fishSize();
    while (fishes.length < n) fishes.push(createFish(rng, bounds, size));
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
    dpr = Math.min(opts.maxDpr, typeof devicePixelRatio === "number" && devicePixelRatio || 1);
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
    gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      powerPreference: "low-power"
    });
    if (!gl) {
      console.warn("koi-pond: WebGL2 is not available, showing a plain background.");
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
      mode: opts.mode === "lines" ? 1 : 0,
      ink: ink.slice(0, 3),
      bg,
      stops: toneStops(opts.tones)
    });
  }
  function speedFactor() {
    const reduce = opts.reducedMotion === true || opts.reducedMotion === "auto" && reduceQuery && reduceQuery.matches;
    return opts.speed * (reduce ? 0.25 : 1);
  }
  function frame(now) {
    raf = 0;
    if (!running || destroyed) return;
    const dt = last ? Math.min(0.05, (now - last) / 1e3) : 1 / 60;
    last = now;
    time += dt;
    const stepOpts = {
      speed: speedFactor(),
      dartBoost: opts.dartBoost,
      dartDuration: opts.dartDuration,
      bounds,
      fishes,
      pointer: opts.interactive ? pointer : null,
      rng
    };
    for (const f of fishes) stepFish(f, dt, time, stepOpts);
    draw();
    schedule();
  }
  function schedule() {
    if (!raf && running && onScreen && !document.hidden) raf = requestAnimationFrame(frame);
  }
  function updatePointer(e) {
    const r = canvas.getBoundingClientRect();
    pointer.x = e.clientX - r.left;
    pointer.y = e.clientY - r.top;
    pointer.active = pointer.x >= 0 && pointer.y >= 0 && pointer.x <= r.width && pointer.y <= r.height;
  }
  function onPointerUp(e) {
    if (e.pointerType !== "mouse") pointer.active = false;
  }
  function onPointerOut(e) {
    if (!e.relatedTarget) pointer.active = false;
  }
  function onVisibility() {
    last = 0;
    schedule();
  }
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => {
    measure();
    if (!running) draw();
  }) : null;
  const io = !fullPage && typeof IntersectionObserver === "function" ? new IntersectionObserver((entries) => {
    onScreen = entries[entries.length - 1].isIntersecting;
    last = 0;
    schedule();
  }) : null;
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
  measure();
  regenerate();
  const ok = initGL();
  if (ok) {
    window.addEventListener("pointermove", updatePointer, { passive: true });
    window.addEventListener("pointerdown", updatePointer, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    window.addEventListener("pointercancel", onPointerUp, { passive: true });
    document.addEventListener("pointerout", onPointerOut, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    canvas.addEventListener("webglcontextlost", onContextLost);
    canvas.addEventListener("webglcontextrestored", onContextRestored);
    if (ro) ro.observe(canvas);
    else window.addEventListener("resize", measure);
    if (io) io.observe(canvas);
    running = true;
    draw();
    schedule();
  }
  const api = {
    canvas,
    get fishes() {
      return fishes;
    },
    get options() {
      return { ...opts };
    },
    /** Change any option at runtime. */
    set(partial = {}) {
      const prevSize = opts.fishSize;
      Object.assign(opts, partial);
      if ("ink" in partial) ink = parseColor(opts.ink);
      if ("background" in partial) {
        bg = parseColor(opts.background);
        if (!gl) canvas.style.background = `rgba(${bg[0] * 255},${bg[1] * 255},${bg[2] * 255},${bg[3]})`;
      }
      if ("maxDpr" in partial) measure();
      if ("fishSize" in partial && partial.fishSize !== prevSize) regenerate();
      else if ("count" in partial) syncFishCount();
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
      window.removeEventListener("pointermove", updatePointer);
      window.removeEventListener("pointerdown", updatePointer);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      document.removeEventListener("pointerout", onPointerOut);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", measure);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      if (ro) ro.disconnect();
      if (io) io.disconnect();
      if (renderer) renderer.dispose();
      renderer = null;
      if (ownsCanvas) canvas.remove();
    }
  };
  return api;
}
var index_default = createKoiPond;
export {
  DEFAULTS,
  createKoiPond,
  index_default as default,
  toneStops
};
