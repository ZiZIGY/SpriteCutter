// Lining up the frames of an animation.
//
// Each frame is cut and trimmed on its own, so its box moves with every flick
// of a flame's tail. Centring those boxes makes the animation jitter. Instead
// the frames are shifted (in source pixels) so that their bodies coincide,
// and the whole animation is then placed as one unit.

import type { Extracted, Shift } from './frames';

export type AlignMode = 'match' | 'centroid' | 'bottom' | 'source' | 'none';

/**
 * - match: search the shift at which each frame overlaps the first one and
 *   its predecessor best — the body stays put, loose tendrils do not pull it;
 * - centroid: centres of mass coincide;
 * - bottom: centres of mass horizontally, lowest pixels vertically (feet on
 *   the ground);
 * - source: keep each frame where it sat in its slot of the source row, so a
 *   jump or a lunge drawn into the sheet survives.
 * `rows` are the frames' source rows, used by 'source'.
 */
export function alignFrames(
  frames: Extracted[],
  rows: number[],
  mode: Exclude<AlignMode, 'none'>
): Shift[] {
  switch (mode) {
    case 'centroid':
      return frames.map((f) => ({ x: -f.cx, y: -f.cy }));
    case 'bottom':
      return frames.map((f) => ({ x: -f.cx, y: -(f.y + f.h) }));
    case 'source':
      return slotShifts(frames, rows);
    case 'match':
      return matchShifts(frames);
  }
}

/**
 * Frames of a source row sit in cells of a steady pitch. The pitch and origin
 * come from a least-squares line through the frames' centres of mass (box
 * edges would do, but a tail flicking out of one frame skews them, and the
 * error grows cell by cell). Each frame keeps its offset inside its cell; all
 * frames of a row share one vertical reference.
 */
function slotShifts(frames: Extracted[], rows: number[]): Shift[] {
  const out: Shift[] = frames.map(() => ({ x: 0, y: 0 }));
  const byRow = new Map<number, number[]>();
  rows.forEach((r, i) => byRow.set(r, [...(byRow.get(r) ?? []), i]));
  for (const idx of byRow.values()) {
    idx.sort((a, b) => frames[a].cx - frames[b].cx);
    const n = idx.length;
    const top = Math.min(...idx.map((i) => frames[i].y));
    if (n === 1) {
      out[idx[0]] = { x: -frames[idx[0]].cx, y: -top };
      continue;
    }
    const meanJ = (n - 1) / 2;
    const meanX = idx.reduce((sum, i) => sum + frames[i].cx, 0) / n;
    let num = 0;
    let den = 0;
    idx.forEach((i, j) => {
      num += (j - meanJ) * (frames[i].cx - meanX);
      den += (j - meanJ) ** 2;
    });
    const pitch = num / den;
    const origin = meanX - pitch * meanJ;
    idx.forEach((i, j) => (out[i] = { x: -(origin + j * pitch), y: -top }));
  }
  return out;
}

function matchShifts(frames: Extracted[]): Shift[] {
  if (!frames.length) return [];
  // Start from centres of mass, then let the shape decide.
  const out: Shift[] = frames.map((f) => ({
    x: frames[0].cx - f.cx,
    y: frames[0].cy - f.cy,
  }));
  out[0] = { x: 0, y: 0 };
  for (let i = 1; i < frames.length; i++) {
    const refs = [{ f: frames[0], s: out[0] }];
    if (i > 1) refs.push({ f: frames[i - 1], s: out[i - 1] });
    out[i] = register(frames[i], out[i], refs);
  }
  // Report shifts relative to the first frame's centre so the unit's union
  // stays compact whichever frame is first.
  return out.map((s) => ({ x: s.x - frames[0].cx, y: s.y - frames[0].cy }));
}

/**
 * Overlap of `cur` shifted by (sx, sy) with `ref` shifted by (rx, ry): the sum
 * of alpha products, sampling every `stride`-th pixel.
 */
function overlap(
  cur: Extracted,
  sx: number,
  sy: number,
  ref: Extracted,
  rx: number,
  ry: number,
  stride: number
): number {
  const ox = Math.round(cur.x + sx - ref.x - rx);
  const oy = Math.round(cur.y + sy - ref.y - ry);
  const j0 = Math.max(0, -oy);
  const j1 = Math.min(cur.h, ref.h - oy);
  const i0 = Math.max(0, -ox);
  const i1 = Math.min(cur.w, ref.w - ox);
  let sum = 0;
  for (let j = j0; j < j1; j += stride) {
    const cRow = j * cur.w;
    const rRow = (j + oy) * ref.w + ox;
    for (let i = i0; i < i1; i += stride) {
      const a = cur.mask[cRow + i];
      if (a) sum += a * ref.mask[rRow + i];
    }
  }
  return sum;
}

/**
 * Coarse-to-fine search: a wide sparse sweep around the initial guess, then
 * ever finer steps around the best hit, finishing at single pixels.
 */
function register(
  cur: Extracted,
  init: Shift,
  refs: { f: Extracted; s: Shift }[]
): Shift {
  const size = Math.max(cur.w, cur.h);
  let step = Math.max(1, Math.round(size / 48));
  let radius = Math.max(4, Math.round(size * 0.2));
  let best = { x: Math.round(init.x), y: Math.round(init.y) };

  for (;;) {
    // Sparse pixel sampling keeps the wide sweeps cheap; the last pass uses
    // (nearly) every pixel.
    const stride = step > 1 ? step : Math.max(1, Math.round(size / 200));
    let bestScore = -1;
    let bx = best.x;
    let by = best.y;
    for (let dy = -radius; dy <= radius; dy += step) {
      for (let dx = -radius; dx <= radius; dx += step) {
        const x = best.x + dx;
        const y = best.y + dy;
        let score = 0;
        for (const r of refs) score += overlap(cur, x, y, r.f, r.s.x, r.s.y, stride);
        if (score > bestScore) {
          bestScore = score;
          bx = x;
          by = y;
        }
      }
    }
    best = { x: bx, y: by };
    if (step === 1) break;
    radius = step;
    step = Math.max(1, Math.floor(step / 2));
    if (step === 1) radius = Math.min(radius, 2);
  }
  return best;
}
