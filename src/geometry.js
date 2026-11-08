// Turns simulated fish into triangles for the scene pass.
//
// Vertex layout (8 floats): x, y, u, v, kind, seed, depth, patch
//   kind 0 = body, 1 = tail fin, 2 = pectoral fin
//   u runs along the part (0 = front), v runs across it (-1 .. 1)

import { SPINE_SEGMENTS, bodyHalfWidth } from './sim.js';

export const FLOATS_PER_VERTEX = 8;
const TAIL_ROWS = 5;
// body quads + tail quads + 2 pectoral fin quads, 6 vertices per quad
export const VERTICES_PER_FISH = (SPINE_SEGMENTS + (TAIL_ROWS - 1) + 2) * 6;

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
  out[o++] = f.patch;
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

function writeFish(f) {
  const s = f.spine;
  const L = f.length;
  const amp = L * 0.05 * (1 + 0.5 * f.burst);

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
    const off = Math.sin(f.phase - u * 4.6) * amp * (0.12 + Math.pow(u, 1.5));
    px[i] = s[i * 2] + nx[i] * off;
    py[i] = s[i * 2 + 1] + ny[i] * off;
  }

  // --- Pectoral fins (drawn first, they sit under the body).
  {
    const i = 3;
    let tx = px[i - 1] - px[i + 1];
    let ty = py[i - 1] - py[i + 1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const hw = bodyHalfWidth(i / SPINE_SEGMENTS) * L;
    const finLen = L * 0.17;
    const finW = L * 0.06;
    for (const side of [-1, 1]) {
      const sweep = 0.85 + 0.28 * Math.sin(f.phase * 0.5 + side);
      // Direction: backwards and outwards.
      const dx = -tx * Math.cos(sweep) + -ty * side * Math.sin(sweep);
      const dy = -ty * Math.cos(sweep) + tx * side * Math.sin(sweep);
      const rx = px[i] + -ty * side * hw * 0.7;
      const ry = py[i] + tx * side * hw * 0.7;
      const qx = -dy; // across the fin
      const qy = dx;
      const ex = rx + dx * finLen;
      const ey = ry + dy * finLen;
      quad(
        rx - qx * finW, ry - qy * finW, rx + qx * finW, ry + qy * finW,
        ex - qx * finW, ey - qy * finW, ex + qx * finW, ey + qy * finW,
        0, 1, 2, f,
      );
    }
  }

  // --- Tail fin: a fan that continues from the end of the body, lagging the beat.
  {
    const e = SPINE_SEGMENTS;
    const base = Math.atan2(py[e] - py[e - 1], px[e] - px[e - 1]);
    const tailLen = L * 0.36;
    let prevL = null;
    for (let j = 0; j < TAIL_ROWS; j++) {
      const t = j / (TAIL_ROWS - 1);
      const ang = base + Math.sin(f.phase - 5.4 - t * 1.2) * 0.45 * t;
      // Each row is placed by walking along the (bending) fin.
      let cx;
      let cy;
      if (j === 0) {
        cx = px[e];
        cy = py[e];
      } else {
        cx = prevL.cx + Math.cos(ang) * (tailLen / (TAIL_ROWS - 1));
        cy = prevL.cy + Math.sin(ang) * (tailLen / (TAIL_ROWS - 1));
      }
      const hw = L * (0.045 + 0.16 * Math.pow(t, 0.8));
      const qx = -Math.sin(ang);
      const qy = Math.cos(ang);
      const row = { cx, cy, lx: cx - qx * hw, ly: cy - qy * hw, rx: cx + qx * hw, ry: cy + qy * hw, t };
      if (prevL) {
        quad(prevL.lx, prevL.ly, prevL.rx, prevL.ry, row.lx, row.ly, row.rx, row.ry, prevL.t, row.t, 1, f);
      }
      prevL = row;
    }
  }

  // --- Body.
  for (let i = 0; i < SPINE_SEGMENTS; i++) {
    const ua = i / SPINE_SEGMENTS;
    const ub = (i + 1) / SPINE_SEGMENTS;
    // The nose gets a tiny non-zero width so the rounded head reads well.
    const wa = Math.max(bodyHalfWidth(ua), 0.025) * L;
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
