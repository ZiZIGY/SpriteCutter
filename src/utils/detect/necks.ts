// Splitting blobs that are really two sprites joined by a thin neck.
//
// Generated sheets pack sprites tightly: two icons touch tip to tip, or a
// faint glow runs between them, and they become one connected blob.
// Connectivity alone cannot tell them apart, but shape can: erode the blob and
// the thin joint disappears first, leaving solid bodies ("cores"). Each blob
// pixel then goes to the core it reaches first through the blob, so the cut
// runs through the neck.
//
// Guards against cutting one sprite in two: parts that meet along a wide
// front merge back, and a part too light to be a sprite of its own (a head, a
// lobe of a swirl) joins the neighbour it touches most. The weight test uses
// the grown parts, not the cores, so an airy sprite made of thin swirls still
// counts as a sprite next to a solid disc.

/** Neck width that breaks, as a share of the blob's shorter side (x2). */
const ERODE_SHARE = 0.02;
/** A part lighter than this share of the heaviest one is not a sprite. */
const PART_SHARE = 0.15;
const MIN_SIDE = 24;
const MIN_AREA = 800;

// Chamfer 3-4 distance: 3 per straight step, 4 per diagonal.
const STRAIGHT = 3;
const DIAGONAL = 4;

/**
 * Relabels necked blobs in place; returns the new label count.
 *
 * `labels` covers every pixel of the blobs; `solid` marks pixels
 * that are fully sprite, so a faint glow neither forms a core nor counts as
 * a wide contact between two parts.
 */
export function splitNecks(
  labels: Int32Array,
  numLabels: number,
  solid: Uint8Array,
  W: number,
  H: number
): number {
  const minX = new Int32Array(numLabels).fill(W);
  const minY = new Int32Array(numLabels).fill(H);
  const maxX = new Int32Array(numLabels).fill(-1);
  const maxY = new Int32Array(numLabels).fill(-1);
  const area = new Int32Array(numLabels);
  for (let i = 0, n = W * H; i < n; i++) {
    const l = labels[i];
    if (l < 0) continue;
    const x = i % W;
    const y = (i / W) | 0;
    if (x < minX[l]) minX[l] = x;
    if (x > maxX[l]) maxX[l] = x;
    if (y < minY[l]) minY[l] = y;
    if (y > maxY[l]) maxY[l] = y;
    area[l]++;
  }

  let next = numLabels;
  for (let c = 0; c < numLabels; c++) {
    const w = maxX[c] - minX[c] + 1;
    const h = maxY[c] - minY[c] + 1;
    if (Math.min(w, h) < MIN_SIDE || area[c] < MIN_AREA) continue;
    // A blob spanning the whole sheet is sprites glued by drawn grid lines;
    // the grid method deals with those.
    if (w > W * 0.6 && h > H * 0.6) continue;
    next = splitOne(labels, c, next, solid, W, minX[c], minY[c], w, h);
  }
  return next;
}

/**
 * Marker-controlled flood: pixels are claimed in order of decreasing distance
 * value, FIFO within a level, by the part of the neighbour that reached them
 * first. Returns a part index per pixel (-1 outside the blob).
 */
function growByThickness(
  seedOf: number[],
  core: Int32Array,
  dist: Int32Array,
  inBlob: Uint8Array,
  w: number,
  h: number
): Int32Array {
  const n = w * h;
  const part = new Int32Array(n).fill(-1);
  const queued = new Uint8Array(n);
  let maxLevel = 0;
  for (let j = 0; j < n; j++) if (dist[j] > maxLevel) maxLevel = dist[j];
  const buckets: number[][] = Array.from({ length: maxLevel + 1 }, () => []);
  const heads = new Int32Array(maxLevel + 1);
  let level = 0;

  const pushNeighbours = (j: number) => {
    const x = j % w;
    const y = (j / w) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const k = yy * w + xx;
        if (!inBlob[k] || queued[k]) continue;
        queued[k] = 1;
        part[k] = part[j];
        buckets[dist[k]].push(k);
        if (dist[k] > level) level = dist[k];
      }
    }
  };

  const seedPixels: number[] = [];
  for (let j = 0; j < n; j++) {
    const k = core[j];
    if (k >= 0 && seedOf[k] >= 0) {
      part[j] = seedOf[k];
      queued[j] = 1;
      seedPixels.push(j);
    }
  }
  // Only seed pixels expand here; everything they reach waits in the queue
  // for its level.
  for (const j of seedPixels) pushNeighbours(j);

  for (;;) {
    while (level > 0 && heads[level] >= buckets[level].length) level--;
    if (heads[level] >= buckets[level].length) break;
    pushNeighbours(buckets[level][heads[level]++]);
  }
  return part;
}

function splitOne(
  labels: Int32Array,
  c: number,
  next: number,
  solid: Uint8Array,
  W: number,
  x0: number,
  y0: number,
  w: number,
  h: number
): number {
  const n = w * h;
  const inBlob = new Uint8Array(n);
  const dist = new Int32Array(n);
  const BIG = 1 << 29;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y0 + y) * W + x0 + x;
      if (labels[i] !== c) continue;
      const j = y * w + x;
      inBlob[j] = 1;
      if (solid[i]) dist[j] = BIG;
    }
  }

  // Distance to the nearest non-solid pixel; outside the box counts as 0.
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= w || y >= h ? 0 : dist[y * w + x];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const j = y * w + x;
      if (!dist[j]) continue;
      dist[j] = Math.min(
        dist[j],
        at(x - 1, y) + STRAIGHT,
        at(x, y - 1) + STRAIGHT,
        at(x - 1, y - 1) + DIAGONAL,
        at(x + 1, y - 1) + DIAGONAL
      );
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const j = y * w + x;
      if (!dist[j]) continue;
      dist[j] = Math.min(
        dist[j],
        at(x + 1, y) + STRAIGHT,
        at(x, y + 1) + STRAIGHT,
        at(x + 1, y + 1) + DIAGONAL,
        at(x - 1, y + 1) + DIAGONAL
      );
    }
  }

  // Cores: what survives eroding by t pixels. Necks thinner than ~2t vanish.
  const t = Math.max(2, Math.round(ERODE_SHARE * Math.min(w, h)));
  const threshold = t * STRAIGHT;
  const core = new Int32Array(n).fill(-1);
  const coreArea: number[] = [];
  const stack = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    if (dist[s] <= threshold || core[s] >= 0) continue;
    const id = coreArea.length;
    let sp = 0;
    let a = 0;
    core[s] = id;
    stack[sp++] = s;
    while (sp) {
      const j = stack[--sp];
      a++;
      const x = j % w;
      const y = (j / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const k = yy * w + xx;
          if (dist[k] > threshold && core[k] < 0) {
            core[k] = id;
            stack[sp++] = k;
          }
        }
      }
    }
    coreArea.push(a);
  }
  if (coreArea.length < 2) return next;

  // Specks that barely survive the erosion would only fragment the growth.
  const minCore = Math.max(16, t * t);
  const seedOf = coreArea.map((a): number => (a >= minCore ? 0 : -1));
  let seeds = 0;
  for (let k = 0; k < seedOf.length; k++) if (seedOf[k] === 0) seedOf[k] = seeds++;
  if (seeds < 2) return next;

  // Grow the seeds through the blob thickest-first (a watershed on the
  // distance map): each side fills its own body before any front may cross a
  // thin place, so fronts meet at the neck even when one sprite's core sits
  // far from it — plain breadth-first growth lets a solid neighbour's front
  // run through the tip and flood an airy sprite made of thin swirls.
  const part = growByThickness(seedOf, core, dist, inBlob, w, h);

  // Borders between parts: all of it, and the solid share of it.
  const partArea = new Array<number>(seeds).fill(0);
  const border = new Map<number, number>();
  const solidBorder = new Map<number, number>();
  const bump = (m: Map<number, number>, a: number, b: number) => {
    const key = a < b ? a * seeds + b : b * seeds + a;
    m.set(key, (m.get(key) ?? 0) + 1);
  };
  const solidAt = (j: number) =>
    solid[(y0 + ((j / w) | 0)) * W + x0 + (j % w)] === 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const j = y * w + x;
      const p = part[j];
      if (p < 0) continue;
      partArea[p]++;
      for (let side = 0; side < 2; side++) {
        const k = side === 0 ? (x + 1 < w ? j + 1 : -1) : y + 1 < h ? j + w : -1;
        if (k < 0 || part[k] < 0 || part[k] === p) continue;
        bump(border, p, part[k]);
        if (solidAt(j) && solidAt(k)) bump(solidBorder, p, part[k]);
      }
    }
  }

  const parent = Array.from({ length: seeds }, (_, k) => k);
  const find = (k: number): number => (parent[k] === k ? k : (parent[k] = find(parent[k])));

  // Parts joined by more solid contact than a tip were one sprite: a concave
  // outline, or bodies tied together by strokes (a swirl through a clock).
  // Two sprites touch tip to tip, a few pixels at most; a glow between them
  // is not solid and does not count.
  const wide = Math.max(3, t);
  for (const [key, count] of solidBorder) {
    if (count > wide) parent[find(Math.floor(key / seeds))] = find(key % seeds);
  }

  // A part too light to be a sprite of its own joins the neighbour it shares
  // the longest border with. Lightest first, until every part is a sprite.
  for (;;) {
    const weight = new Map<number, number>();
    for (let k = 0; k < seeds; k++) {
      const g = find(k);
      weight.set(g, (weight.get(g) ?? 0) + partArea[k]);
    }
    if (weight.size < 2) return next;
    let lightest = -1;
    let heaviest = -1;
    for (const [g, a] of weight) {
      if (lightest < 0 || a < weight.get(lightest)!) lightest = g;
      if (heaviest < 0 || a > weight.get(heaviest)!) heaviest = g;
    }
    if (weight.get(lightest)! >= weight.get(heaviest)! * PART_SHARE) break;
    const shared = new Map<number, number>();
    for (const [key, count] of border) {
      const a = find(Math.floor(key / seeds));
      const b = find(key % seeds);
      if (a === b) continue;
      if (a === lightest) shared.set(b, (shared.get(b) ?? 0) + count);
      else if (b === lightest) shared.set(a, (shared.get(a) ?? 0) + count);
    }
    let target = heaviest;
    let best = 0;
    for (const [g, count] of shared) {
      if (count > best) {
        best = count;
        target = g;
      }
    }
    parent[lightest] = target;
  }

  const groupLabel = new Map<number, number>();
  for (let k = 0; k < seeds; k++) {
    const g = find(k);
    if (!groupLabel.has(g)) groupLabel.set(g, groupLabel.size === 0 ? c : next++);
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const j = y * w + x;
      if (part[j] < 0) continue;
      labels[(y0 + y) * W + x0 + x] = groupLabel.get(find(part[j]))!;
    }
  }
  return next;
}
