// Turns simulated fish into triangles for the scene pass.
//
// Vertex layout (8 floats): x, y, u, v, kind, seed, depth, variety
//   kind 0 = body, 1 = tail fin, 2 = paired fin (pectoral / pelvic)
//   u runs along the part (0 = front), v runs across it (-1 .. 1)

import { SPINE_SEGMENTS, bodyHalfWidth, clamp } from './sim.js';

export const FLOATS_PER_VERTEX = 8;
const TAIL_ROWS = 7;
const FIN_COUNT = 4; // two pectoral + two pelvic fins
// body quads + tail quads + fin quads, 6 vertices per quad
export const VERTICES_PER_FISH = (SPINE_SEGMENTS + (TAIL_ROWS - 1) + FIN_COUNT) * 6;

const px = new Float32Array(SPINE_SEGMENTS + 1);
const py = new Float32Array(SPINE_SEGMENTS + 1);
const nx = new Float32Array(SPINE_SEGMENTS + 1);
const ny = new Float32Array(SPINE_SEGMENTS + 1);

let out;
let o; // write cursor

function vert(x, y, u, v, kind, f) {
  out[o++] = x;
  out[o++] = y;
  out[o++] = u;
  out[o++] = v;
  out[o++] = kind;
  out[o++] = f.seed;
  out[o++] = f.depth;
  out[o++] = f.variety + (f.longFin ? 32 : 0);
}

// Quad from two "rows" (a = front, b = back), each with a left and right point.
function quad(alx, aly, arx, ary, blx, bly, brx, bry, ua, ub, kind, f) {
  vert(alx, aly, ua, -1, kind, f);
  vert(arx, ary, ua, 1, kind, f);
  vert(blx, bly, ub, -1, kind, f);
  vert(arx, ary, ua, 1, kind, f);
  vert(brx, bry, ub, 1, kind, f);
  vert(blx, bly, ub, -1, kind, f);
}

// Body wave: lateral offset at position u along the body (u = 0 snout, 1 tail stem,
// > 1 out into the tail fin). A wave travels from head to tail, about one fish
// length long, growing towards the tail: the head barely sways, the tail sweeps.
const WAVE_K = 4.65;
function waveOffset(f, u, lag = 0) {
  const envelope = 0.012 + 0.022 * u + 0.05 * u * u;
  return f.length * f.amp * envelope * Math.sin(f.phase - WAVE_K * u - lag);
}

// A pair of fins attached at spine index i, one on each side of the body.
// Spread out when slow or hovering (braking, steering, gentle sculling), tucked
// back along the body when swimming fast. The fin on the inside of a turn opens more.
function pairedFins(f, i, len, halfW, spread, tucked, scull, phaseOffset) {
  const L = f.length;
  let tx = px[i - 1] - px[i + 1];
  let ty = py[i - 1] - py[i + 1];
  const tl = Math.hypot(tx, ty) || 1;
  tx /= tl;
  ty /= tl;
  const hw = bodyHalfWidth(i / SPINE_SEGMENTS) * L;
  const fold = clamp(f.speed / (L * 0.8), 0, 1);
  for (const side of [-1, 1]) {
    const sweep =
      spread + (tucked - spread) * fold +
      scull * (1 - fold) * Math.sin(f.finPhase + side * 1.3 + phaseOffset) +
      0.35 * clamp(f.turn * side * 0.8, 0, 1);
    // Direction: backwards and outwards.
    const dx = -tx * Math.cos(sweep) + -ty * side * Math.sin(sweep);
    const dy = -ty * Math.cos(sweep) + tx * side * Math.sin(sweep);
    const rx = px[i] + -ty * side * hw * 0.62;
    const ry = py[i] + tx * side * hw * 0.62;
    const qx = -dy; // across the fin
    const qy = dx;
    const ex = rx + dx * len;
    const ey = ry + dy * len;
    quad(
      rx - qx * halfW, ry - qy * halfW, rx + qx * halfW, ry + qy * halfW,
      ex - qx * halfW, ey - qy * halfW, ex + qx * halfW, ey + qy * halfW,
      0, 1, 2, f,
    );
  }
}

const tcx = new Float32Array(TAIL_ROWS);
const tcy = new Float32Array(TAIL_ROWS);

function writeFish(f) {
  const s = f.spine;
  const L = f.length;

  // Spine with the travelling body wave applied.
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
    const off = waveOffset(f, i / SPINE_SEGMENTS);
    px[i] = s[i * 2] + nx[i] * off;
    py[i] = s[i * 2 + 1] + ny[i] * off;
  }

  // --- Paired fins first: they sit under the body.
  // Butterfly koi have long, flowing fins.
  const fin = f.longFin ? 1.7 : 1;
  pairedFins(f, Math.round(SPINE_SEGMENTS * 0.2), L * 0.21 * fin, L * 0.09 * (f.longFin ? 1.35 : 1), 1.2, 0.32, 0.3, 0);
  pairedFins(f, Math.round(SPINE_SEGMENTS * 0.56), L * 0.12 * fin, L * 0.048 * (f.longFin ? 1.35 : 1), 0.85, 0.38, 0.18, 2.1);

  // --- Tail fin: the body wave carries on into the fin, which flexes a little
  // behind it like a soft paddle.
  {
    const e = SPINE_SEGMENTS;
    let dx = s[e * 2] - s[e * 2 - 2];
    let dy = s[e * 2 + 1] - s[e * 2 - 1];
    const dl = Math.hypot(dx, dy) || 1;
    dx /= dl;
    dy /= dl;
    const tailLen = L * (f.longFin ? 0.62 : 0.33);
    for (let j = 0; j < TAIL_ROWS; j++) {
      const t = j / (TAIL_ROWS - 1);
      const along = t * tailLen;
      // Long fins trail further behind the beat and sway more.
      const off = waveOffset(f, 1 + along / L, (f.longFin ? 1.1 : 0.55) * t) * (f.longFin ? 0.85 : 1);
      tcx[j] = s[e * 2] + dx * along + nx[e] * off;
      tcy[j] = s[e * 2 + 1] + dy * along + ny[e] * off;
    }
    let prev = null;
    for (let j = 0; j < TAIL_ROWS; j++) {
      const t = j / (TAIL_ROWS - 1);
      const a = Math.max(0, j - 1);
      const b = Math.min(TAIL_ROWS - 1, j + 1);
      const ang = Math.atan2(tcy[b] - tcy[a], tcx[b] - tcx[a]);
      const hw = L * (0.03 + (f.longFin ? 0.27 : 0.19) * Math.pow(t, 0.85));
      const qx = -Math.sin(ang);
      const qy = Math.cos(ang);
      const row = {
        lx: tcx[j] - qx * hw, ly: tcy[j] - qy * hw,
        rx: tcx[j] + qx * hw, ry: tcy[j] + qy * hw, t,
      };
      if (prev) quad(prev.lx, prev.ly, prev.rx, prev.ry, row.lx, row.ly, row.rx, row.ry, prev.t, row.t, 1, f);
      prev = row;
    }
  }

  // --- Body.
  for (let i = 0; i < SPINE_SEGMENTS; i++) {
    const ua = i / SPINE_SEGMENTS;
    const ub = (i + 1) / SPINE_SEGMENTS;
    // A little width at the very tip keeps the rounded snout from collapsing to a point.
    // 16% wider than the body itself: the outer band is drawn as a faint halo.
    const wa = Math.max(bodyHalfWidth(ua), 0.03) * L * 1.16;
    const wb = bodyHalfWidth(ub) * L * 1.16;
    const j = i + 1;
    quad(
      px[i] - nx[i] * wa, py[i] - ny[i] * wa, px[i] + nx[i] * wa, py[i] + ny[i] * wa,
      px[j] - nx[j] * wb, py[j] - ny[j] * wb, px[j] + nx[j] * wb, py[j] + ny[j] * wb,
      ua, ub, 0, f,
    );
  }
}

/**
 * Write triangles for all fish into `buffer` (deepest fish first so nearer fish
 * are drawn on top). Returns the number of vertices written.
 */
export function buildGeometry(fishes, buffer) {
  out = buffer;
  o = 0;
  const order = fishes.slice().sort((a, b) => b.depth - a.depth);
  for (const f of order) writeFish(f);
  return o / FLOATS_PER_VERTEX;
}
