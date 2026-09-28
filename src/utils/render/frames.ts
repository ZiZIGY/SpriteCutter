// From a sprite box to an output frame: cut the sprite's own pixels out of the
// sheet, then fit every sprite into one common frame size.

import type { Analysis } from '@/utils/detect/analyze';
import { ALPHA_MIN, nearestColor } from '@/utils/detect/background';
import type { SpriteBox } from '@/utils/detect/sprites';

export interface CleanOptions {
  /** Background becomes transparent. */
  removeBg: boolean;
  /** Pixels of other sprites that fall inside the box are cut out. */
  isolate: boolean;
  /** Un-mix the background colour from the 1px edge (kills the white halo). */
  soften: boolean;
  /** Crop to the sprite's own pixels. */
  trim: boolean;
}

export interface Extracted {
  canvas: HTMLCanvasElement;
  /** Where the (trimmed) pixels sit in the source image. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Alpha of the sprite's own pixels over the trimmed box (w*h); the
   *  background stays 0 even when it is kept opaque in the canvas. */
  mask: Uint8Array;
  /** Alpha-weighted centre of mass, in source coordinates. */
  cx: number;
  cy: number;
}

export function extractSprite(
  an: Analysis,
  box: SpriteBox,
  o: CleanOptions
): Extracted {
  const { width: W, height: H, pixels: px, content, labels } = an;
  const bg = an.background;

  const x0 = clamp(Math.round(box.x), 0, W - 1);
  const y0 = clamp(Math.round(box.y), 0, H - 1);
  const x1 = clamp(Math.round(box.x + box.w), x0 + 1, W);
  const y1 = clamp(Math.round(box.y + box.h), y0 + 1, H);
  const w = x1 - x0;
  const h = y1 - y0;

  let owned: Uint8Array | null = null;
  if (o.isolate && box.owned) {
    owned = new Uint8Array(an.components.length);
    for (const l of box.owned) owned[l] = 1;
  }
  const bgColors = bg.kind === 'color' ? bg.colors : null;
  // With the background kept, cut-out neighbour pixels are painted over with
  // it instead of punching transparent holes into an opaque frame.
  const fill = !o.removeBg && bgColors ? bgColors[0] : null;
  const soften = o.soften && o.removeBg && bgColors ? bgColors : null;

  const out = new Uint8ClampedArray(w * h * 4);
  const mask = new Uint8Array(w * h);
  let tMinX = w;
  let tMinY = h;
  let tMaxX = -1;
  let tMaxY = -1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y0 + y) * W + x0 + x;
      const s = i * 4;
      const d = (y * w + x) * 4;
      const isContent = content[i] === 1;
      const foreign = isContent && owned !== null && owned[labels[i]] === 0;

      if (foreign || (!isContent && o.removeBg)) {
        if (fill) {
          out[d] = fill[0];
          out[d + 1] = fill[1];
          out[d + 2] = fill[2];
          out[d + 3] = 255;
        }
        continue;
      }

      out[d] = px[s];
      out[d + 1] = px[s + 1];
      out[d + 2] = px[s + 2];
      out[d + 3] = px[s + 3];

      if (!isContent) continue;
      if (x < tMinX) tMinX = x;
      if (x > tMaxX) tMaxX = x;
      if (y < tMinY) tMinY = y;
      if (y > tMaxY) tMaxY = y;

      if (soften && touchesBackground(content, i, W, H)) {
        unmix(out, d, nearestColor(soften, px[s], px[s + 1], px[s + 2]));
      }
      mask[y * w + x] = out[d + 3];
    }
  }

  const trimmed = o.trim && tMaxX >= 0;
  const tx = trimmed ? tMinX : 0;
  const ty = trimmed ? tMinY : 0;
  const tw = trimmed ? tMaxX - tMinX + 1 : w;
  const th = trimmed ? tMaxY - tMinY + 1 : h;

  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  canvas.getContext('2d')!.putImageData(new ImageData(out, w, h), -tx, -ty);

  const trimmedMask = new Uint8Array(tw * th);
  let sum = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const a = mask[(ty + y) * w + tx + x];
      trimmedMask[y * tw + x] = a;
      sum += a;
      sx += a * x;
      sy += a * y;
    }
  }
  return {
    canvas,
    x: x0 + tx,
    y: y0 + ty,
    w: tw,
    h: th,
    mask: trimmedMask,
    cx: x0 + tx + (sum ? sx / sum : tw / 2),
    cy: y0 + ty + (sum ? sy / sum : th / 2),
  };
}

function touchesBackground(
  content: Uint8Array,
  i: number,
  W: number,
  H: number
): boolean {
  const x = i % W;
  return (
    (x > 0 && !content[i - 1]) ||
    (x < W - 1 && !content[i + 1]) ||
    (i >= W && !content[i - W]) ||
    (i < W * (H - 1) && !content[i + W])
  );
}

/**
 * "Colour to alpha": the most transparent pixel that, composited over the
 * background colour, reproduces the original. An anti-aliased pixel that was
 * half sprite, half white keeps the sprite half and drops the white.
 */
function unmix(
  out: Uint8ClampedArray,
  d: number,
  bg: readonly [number, number, number]
) {
  let a = 0;
  for (let k = 0; k < 3; k++) {
    const v = out[d + k];
    const b = bg[k];
    const ak = v > b ? (v - b) / (255 - b || 1) : v < b ? (b - v) / (b || 1) : 0;
    if (ak > a) a = ak;
  }
  a = Math.min(1, a);
  if (a * out[d + 3] < ALPHA_MIN) {
    out[d + 3] = 0;
    return;
  }
  for (let k = 0; k < 3; k++) {
    out[d + k] = Math.round((out[d + k] - bg[k]) / a + bg[k]);
  }
  out[d + 3] = Math.round(out[d + 3] * a);
}

// ── frame layout ─────────────────────────────────────────────────────────────

export type ScaleMode = 'none' | 'fit' | 'uniform';
export type Anchor = 'center' | 'bottom';

export interface FrameOptions {
  /** 'auto' sizes the frame to the largest sprite. */
  size: 'auto' | 'custom';
  width: number;
  height: number;
  square: boolean;
  /** none: original pixels; fit: every sprite fills the frame; uniform: one
   *  factor for all, so relative sizes survive. */
  scale: ScaleMode;
  padding: number;
  anchor: Anchor;
  smooth: boolean;
}

export interface Placement {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  /** Output pixels per source pixel. */
  k: number;
}

export interface Shift {
  x: number;
  y: number;
}

/**
 * Sprites placed together: one scale and one anchor for all of them, each
 * shifted (in source pixels) so they line up. An animation is a unit; a
 * standalone sprite is a unit of one with no shift.
 */
export interface Unit {
  members: number[];
  shifts: Shift[];
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FrameLayout {
  width: number;
  height: number;
  places: Placement[];
}

/**
 * `include` marks the sprites that decide the frame (skipped sprites still get
 * a placement for their thumbnail, but do not size a sheet they are not on).
 */
export function layoutFrames(
  exts: Box[],
  o: FrameOptions,
  units: Unit[],
  include?: boolean[]
): FrameLayout {
  // Each unit is laid out by the union of its aligned members: scaling and
  // centring that union keeps every frame of an animation in step.
  const unions = units.map((u) => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    u.members.forEach((m, j) => {
      const e = exts[m];
      const sh = u.shifts[j];
      x0 = Math.min(x0, e.x + sh.x);
      y0 = Math.min(y0, e.y + sh.y);
      x1 = Math.max(x1, e.x + sh.x + e.w);
      y1 = Math.max(y1, e.y + sh.y + e.h);
    });
    return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
  });
  const sizes = unions.filter(
    (_, i) => !include || units[i].members.some((m) => include[m])
  );

  const pad = Math.max(0, Math.round(o.padding));
  let fw: number;
  let fh: number;
  if (o.size === 'custom') {
    fw = Math.max(1, Math.round(o.width));
    fh = o.square ? fw : Math.max(1, Math.round(o.height));
  } else {
    // Unscaled sprites need room for the largest one. Scaled to fit, the
    // typical (median) size wins, so one oversized sprite does not force every
    // other one to be blown up to its size.
    const pick = o.scale === 'fit' ? median : (v: number[]) => Math.max(...v);
    const w = sizes.length ? pick(sizes.map((s) => s.w)) : 1;
    const h = sizes.length ? pick(sizes.map((s) => s.h)) : 1;
    if (o.square) {
      const side = sizes.length ? pick(sizes.map((s) => Math.max(s.w, s.h))) : 1;
      fw = fh = Math.ceil(side) + 2 * pad;
    } else {
      fw = Math.ceil(w) + 2 * pad;
      fh = Math.ceil(h) + 2 * pad;
    }
  }

  const iw = Math.max(1, fw - 2 * pad);
  const ih = Math.max(1, fh - 2 * pad);
  const fitOf = (s: Box) => Math.min(iw / s.w, ih / s.h);
  let common = Infinity;
  for (const s of sizes) common = Math.min(common, fitOf(s));
  if (!isFinite(common)) common = 1;

  const places: Placement[] = new Array(exts.length);
  units.forEach((u, i) => {
    const U = unions[i];
    const k = o.scale === 'fit' ? fitOf(U) : o.scale === 'uniform' ? common : 1;
    const ox = (fw - U.w * k) / 2;
    const oy = o.anchor === 'bottom' ? fh - pad - U.h * k : (fh - U.h * k) / 2;
    u.members.forEach((m, j) => {
      const e = exts[m];
      const sh = u.shifts[j];
      places[m] = {
        dx: Math.round(ox + (e.x + sh.x - U.x) * k),
        dy: Math.round(oy + (e.y + sh.y - U.y) * k),
        dw: Math.max(1, Math.round(e.w * k)),
        dh: Math.max(1, Math.round(e.h * k)),
        k,
      };
    });
  });
  return { width: fw, height: fh, places };
}

export interface FrameSet {
  width: number;
  height: number;
  smooth: boolean;
  /** Frame fill when the background is kept; null for transparent frames. */
  background: string | null;
}

/** A whole frame, background included, at (ox, oy) scaled by k. */
export function paintFrame(
  ctx: CanvasRenderingContext2D,
  set: FrameSet,
  item: { ext: Extracted; place: Placement },
  ox = 0,
  oy = 0,
  k = 1
) {
  if (set.background) {
    ctx.fillStyle = set.background;
    ctx.fillRect(ox, oy, set.width * k, set.height * k);
  }
  // Shrunk previews read better smoothed, even for pixel art.
  drawFrame(ctx, item.ext, item.place, set.smooth || k < 1, ox, oy, k);
}

/** Draws one sprite into its frame at (ox, oy), optionally scaled by k. */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  ext: Extracted,
  place: Placement,
  smooth: boolean,
  ox = 0,
  oy = 0,
  k = 1
) {
  ctx.imageSmoothingEnabled = smooth;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    ext.canvas,
    ox + place.dx * k,
    oy + place.dy * k,
    place.dw * k,
    place.dh * k
  );
}

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
