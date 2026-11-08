// Turns simulated fish into triangles for the scene pass.
//
// Vertex layout (8 floats): x, y, u, v, kind, seed, depth, variety
//   kind 0 = body, 1 = tail fin, 2 = paired fin (pectoral / pelvic)
//   u runs along the part (0 = front), v runs across it (-1 .. 1)

import { SPINE_SEGMENTS, bodyHalfWidth } from './sim.js';

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
  out[o++] = f.variety;
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

// A paired fin attached at spine index i, on both sides of the body.
function pairedFins(f, i, len, halfW, sweepBase, flapAmp, flapOffset) {
  const L = f.length;
  let tx = px[i - 1] - px[i + 1];
  let ty = py[i - 1] - py[i + 1];
  const tl = Math.hypot(tx, ty) || 1;
  tx /= tl;
  ty /= tl;
  const hw = bodyHalfWidth(i / SPINE_SEGMENTS) * L;
  for (const side of [-1, 1]) {
    // Fins fold back when the fish speeds up, and paddle gently while cruising.
    const sweep =
      sweepBase + 0.45 * f.burst + flapAmp * Math.sin(f.phase * 0.55 + side * 1.3 + flapOffset);
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

function writeFish(f) {
  const s = f.spine;
  const L = f.length;
  const amp = L * 0.045 * (1 + 0.6 * f.burst);

  // Spine with the travelling tail-beat wave applied.
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

  // --- Paired fins first: they sit under the body.
  const pect = Math.round(SPINE_SEGMENTS * 0.2);
  const pelv = Math.round(SPINE_SEGMENTS * 0.56);
  pairedFins(f, pect, L * 0.24, L * 0.11, 0.95, 0.3, 0);
  pairedFins(f, pelv, L * 0.15, L * 0.065, 0.8, 0.18, 2.1);

  // --- Tail fin: a wide fan continuing from the tail stem, lagging the beat.
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

  // --- Body.
  for (let i = 0; i < SPINE_SEGMENTS; i++) {
    const ua = i / SPINE_SEGMENTS;
    const ub = (i + 1) / SPINE_SEGMENTS;
    // The nose gets a little width so the blunt head reads well.
    const wa = Math.max(bodyHalfWidth(ua), 0.05) * L;
    const wb = bodyHalfWidth(ub) * L;
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
