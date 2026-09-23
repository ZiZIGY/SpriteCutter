// Background estimation and removal.
//
// Two kinds of sheets show up in practice: PNGs with real transparency, and
// flat images (typically from image generators) painted on a solid colour or
// on a fake "transparency" checkerboard. The latter is handled by sampling the
// border ring for up to three dominant colours and flood-filling inward from
// the edges through pixels close to any of them, so a white highlight inside a
// sprite survives while the white sheet around it goes.

export type Rgb = readonly [number, number, number];

export type Background =
  | { kind: 'transparent' }
  | { kind: 'color'; colors: Rgb[] };

/** Pixels below this alpha count as transparent everywhere in the app. */
export const ALPHA_MIN = 16;

const RING = 3;
const MIN_SHARE = 0.06;
const SAME_COLOR = 24;

export function estimateBackground(
  px: Uint8ClampedArray,
  w: number,
  h: number
): Background {
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  let total = 0;
  let clear = 0;

  const sample = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    total++;
    if (px[i + 3] < ALPHA_MIN) {
      clear++;
      return;
    }
    const key =
      ((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4);
    const bin = bins.get(key);
    if (bin) {
      bin.n++;
      bin.r += px[i];
      bin.g += px[i + 1];
      bin.b += px[i + 2];
    } else {
      bins.set(key, { n: 1, r: px[i], g: px[i + 1], b: px[i + 2] });
    }
  };

  const depth = Math.min(RING, w, h);
  for (let d = 0; d < depth; d++) {
    for (let x = 0; x < w; x++) {
      sample(x, d);
      sample(x, h - 1 - d);
    }
    for (let y = depth; y < h - depth; y++) {
      sample(d, y);
      sample(w - 1 - d, y);
    }
  }

  if (clear >= total * 0.5) return { kind: 'transparent' };

  // Sprites cut by the sheet edge also land in the ring, but only as a small
  // share; anything above MIN_SHARE is background (a checkerboard has two).
  const opaque = total - clear;
  const sorted = [...bins.values()].sort((a, b) => b.n - a.n);
  const colors: Rgb[] = [];
  for (const bin of sorted) {
    if (colors.length === 3) break;
    if (colors.length && bin.n < opaque * MIN_SHARE) break;
    const c: Rgb = [
      Math.round(bin.r / bin.n),
      Math.round(bin.g / bin.n),
      Math.round(bin.b / bin.n),
    ];
    if (colors.some((p) => distSq(p, c) < SAME_COLOR * SAME_COLOR)) continue;
    colors.push(c);
  }
  return { kind: 'color', colors };
}

/**
 * 1 = sprite pixel, 0 = background.
 *
 * `fillHoles` also clears background-coloured areas enclosed by a sprite
 * (the gap between a bow and its string); without it only background reachable
 * from the sheet edge is removed, which keeps eye whites and highlights.
 */
export function contentMask(
  px: Uint8ClampedArray,
  w: number,
  h: number,
  bg: Background,
  tolerance: number,
  fillHoles: boolean
): Uint8Array {
  const n = w * h;
  const content = new Uint8Array(n);

  if (bg.kind === 'transparent') {
    for (let i = 0; i < n; i++) content[i] = px[i * 4 + 3] >= ALPHA_MIN ? 1 : 0;
    return content;
  }

  const bgLike = new Uint8Array(n);
  const tolSq = tolerance * tolerance;
  const colors = bg.colors;
  let bgCount = 0;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    if (px[p + 3] < ALPHA_MIN) {
      bgLike[i] = 1;
      bgCount++;
      continue;
    }
    for (const c of colors) {
      const dr = px[p] - c[0];
      const dg = px[p + 1] - c[1];
      const db = px[p + 2] - c[2];
      if (dr * dr + dg * dg + db * db <= tolSq) {
        bgLike[i] = 1;
        bgCount++;
        break;
      }
    }
  }

  let source: Uint8Array = bgLike;
  if (!fillHoles) {
    const outside = floodFromBorder(bgLike, w, h);
    let reached = 0;
    for (let i = 0; i < n; i++) reached += outside[i];
    // A frame drawn around the whole sheet stops the flood at the edge and
    // would turn every pixel inside it into "content"; fall back to keying the
    // colour globally when the flood reached only a sliver of the background.
    if (reached >= bgCount * 0.3) {
      source = outside;
      if (colors.length >= 2) clearCheckerHoles(px, bgLike, outside, w, h, colors);
    }
  }
  for (let i = 0; i < n; i++) content[i] = source[i] ^ 1;
  return content;
}

/** 4-connected flood fill over `open` pixels, seeded from the image border. */
function floodFromBorder(open: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let sp = 0;
  const push = (i: number) => {
    if (open[i] && !out[i]) {
      out[i] = 1;
      stack[sp++] = i;
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  const last = w * (h - 1);
  while (sp) {
    const i = stack[--sp];
    const x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < last) push(i + w);
  }
  return out;
}

/**
 * Enclosed background-coloured areas are kept by default (eye whites), but on
 * a fake-transparency checkerboard an enclosed area showing BOTH squares is
 * certainly background seen through a ring or a handle; eye whites are one
 * colour. Such areas are added to `outside`.
 */
function clearCheckerHoles(
  px: Uint8ClampedArray,
  bgLike: Uint8Array,
  outside: Uint8Array,
  w: number,
  h: number,
  colors: Rgb[]
) {
  const n = w * h;
  const seen = new Uint8Array(n);
  const stack = new Int32Array(n);
  const region = new Int32Array(n);
  const counts = new Array<number>(colors.length);
  const last = w * (h - 1);
  let sp = 0;
  const push = (j: number) => {
    if (bgLike[j] && !outside[j] && !seen[j]) {
      seen[j] = 1;
      stack[sp++] = j;
    }
  };

  for (let start = 0; start < n; start++) {
    if (!bgLike[start] || outside[start] || seen[start]) continue;
    counts.fill(0);
    let len = 0;
    sp = 0;
    push(start);
    while (sp) {
      const i = stack[--sp];
      region[len++] = i;
      const p = i * 4;
      if (px[p + 3] >= ALPHA_MIN) {
        let best = 0;
        let bestD = Infinity;
        for (let k = 0; k < colors.length; k++) {
          const dr = px[p] - colors[k][0];
          const dg = px[p + 1] - colors[k][1];
          const db = px[p + 2] - colors[k][2];
          const d = dr * dr + dg * dg + db * db;
          if (d < bestD) {
            bestD = d;
            best = k;
          }
        }
        counts[best]++;
      }
      const x = i % w;
      if (x > 0) push(i - 1);
      if (x < w - 1) push(i + 1);
      if (i >= w) push(i - w);
      if (i < last) push(i + w);
    }
    const mixed = counts.filter((c) => c >= len * 0.15).length >= 2;
    if (mixed && len >= 64) {
      for (let k = 0; k < len; k++) outside[region[k]] = 1;
    }
  }
}

export function nearestColor(colors: Rgb[], r: number, g: number, b: number): Rgb {
  let best = colors[0];
  let bestD = Infinity;
  for (const c of colors) {
    const d = distSq(c, [r, g, b]);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

function distSq(a: Rgb, b: Rgb): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}
