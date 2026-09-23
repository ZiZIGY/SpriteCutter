// Turning blobs into sprite boxes, and boxes into reading order.
//
// A box owns a set of components. Export copies only owned pixels, which is
// what cuts a neighbour's sword tip out of a box it pokes into: the tip is
// inside the rectangle but belongs to the neighbour's component.

import type { Analysis, Component } from './analyze';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SpriteBox extends Rect {
  /** Owned component ids; null takes every sprite pixel inside the rect. */
  owned: number[] | null;
}

export interface FindOptions {
  /** Smallest sprite side, percent of the sheet's shorter side. */
  minSize: number;
}

interface Group {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  area: number;
  ids: number[];
}

const side = (c: Component | Group) =>
  Math.max(c.maxX - c.minX + 1, c.maxY - c.minY + 1);

function gap(a: Component | Group, b: Component | Group): number {
  const dx = Math.max(0, a.minX - b.maxX - 1, b.minX - a.maxX - 1);
  const dy = Math.max(0, a.minY - b.maxY - 1, b.minY - a.maxY - 1);
  return Math.hypot(dx, dy);
}

/** Box overlap as a share of the smaller box: 1 when one box holds the other. */
function containShare(a: Component, b: Group): number {
  const w = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) + 1;
  const h = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY) + 1;
  if (w <= 0 || h <= 0) return 0;
  const boxA = (a.maxX - a.minX + 1) * (a.maxY - a.minY + 1);
  const boxB = (b.maxX - b.minX + 1) * (b.maxY - b.minY + 1);
  return (w * h) / Math.min(boxA, boxB);
}

/**
 * Share of component `id`'s outline lying within `d` px of the group's
 * pixels. A fragment split off by a crack hugs its sprite along the crack
 * (tens of percent); a neighbour touching tip to rim scores a percent or two.
 */
function hugShare(an: Analysis, id: number, g: Group, d: number): number {
  const { labels, width: W, height: H } = an;
  const inGroup = new Uint8Array(an.components.length);
  for (const k of g.ids) inGroup[k] = 1;
  const c = an.components[id];
  let outline = 0;
  let near = 0;
  for (let y = c.minY; y <= c.maxY; y++) {
    for (let x = c.minX; x <= c.maxX; x++) {
      const i = y * W + x;
      if (labels[i] !== id) continue;
      const edge =
        x === 0 || x === W - 1 || y === 0 || y === H - 1 ||
        labels[i - 1] !== id || labels[i + 1] !== id ||
        labels[i - W] !== id || labels[i + W] !== id;
      if (!edge) continue;
      outline++;
      search: for (let yy = Math.max(0, y - d); yy <= Math.min(H - 1, y + d); yy++) {
        for (let xx = Math.max(0, x - d); xx <= Math.min(W - 1, x + d); xx++) {
          const l = labels[yy * W + xx];
          if (l >= 0 && inGroup[l]) {
            near++;
            break search;
          }
        }
      }
    }
  }
  return outline ? near / outline : 0;
}

function absorb(g: Group, c: Component, id: number) {
  g.minX = Math.min(g.minX, c.minX);
  g.minY = Math.min(g.minY, c.minY);
  g.maxX = Math.max(g.maxX, c.maxX);
  g.maxY = Math.max(g.maxY, c.maxY);
  g.area += c.area;
  g.ids.push(id);
}

/** A satellite is at most this share of its owner's size… */
const SATELLITE_SIZE = 0.35;
/** …and its box overlaps the owner's or stays within this share of its size. */
const SATELLITE_REACH = 0.03;

/**
 * Shards flying around a sprite (crystals around a vortex, sparks off a
 * blade) are separate structures, often big enough to pass for sprites. What
 * gives them away is being much smaller than a neighbour whose box they
 * overlap or all but touch; a neighbouring sprite on a sheet is of a similar
 * size, or keeps its distance.
 *
 * Sizes and reach are measured against each owner's own box, before any
 * satellite joined it, so shards cannot chain outward from sprite to sprite.
 * Smallest first, so a shard of a shard ends up with the big sprite.
 */
function joinSatellites(groups: Group[]): Group[] {
  const home = groups.map((g) => ({ ...g }));
  const owner = groups.map((_, i) => i);
  const root = (i: number): number => (owner[i] === i ? i : (owner[i] = root(owner[i])));
  const order = groups.map((_, i) => i).sort((a, b) => side(home[a]) - side(home[b]));

  for (const i of order) {
    const s = home[i];
    let best = -1;
    let bestGap = Infinity;
    for (let j = 0; j < home.length; j++) {
      if (j === i || root(j) === i) continue;
      const o = home[j];
      if (side(s) > side(o) * SATELLITE_SIZE) continue;
      const d = gap(s, o);
      if (d > side(o) * SATELLITE_REACH) continue;
      if (d < bestGap || (d === bestGap && best >= 0 && side(o) > side(home[best]))) {
        best = j;
        bestGap = d;
      }
    }
    if (best >= 0) owner[i] = root(best);
  }

  const out: Group[] = [];
  const byRoot = new Map<number, Group>();
  groups.forEach((_, i) => {
    const r = root(i);
    if (r === i) byRoot.set(i, { ...groups[i], ids: [...groups[i].ids] });
  });
  groups.forEach((g, i) => {
    const r = root(i);
    if (r === i) return;
    const target = byRoot.get(r)!;
    target.minX = Math.min(target.minX, g.minX);
    target.minY = Math.min(target.minY, g.minY);
    target.maxX = Math.max(target.maxX, g.maxX);
    target.maxY = Math.max(target.maxY, g.maxY);
    target.area += g.area;
    target.ids.push(...g.ids);
  });
  for (const g of byRoot.values()) out.push(g);
  return out;
}

export function findSprites(an: Analysis, opts: FindOptions): SpriteBox[] {
  const comps = an.components;
  const minSide = Math.max(
    4,
    (opts.minSize / 100) * Math.min(an.width, an.height)
  );

  // 1. Blobs big enough to be a sprite on their own are cores; the rest
  //    (sparkles, detached tips, JPEG dust) get attached or dropped below.
  let cores: number[] = [];
  const rest: number[] = [];
  comps.forEach((c, id) => {
    if (c.area) (side(c) >= minSide ? cores : rest).push(id);
  });
  if (!cores.length) {
    cores = rest.filter((id) => side(comps[id]) >= 2);
    rest.length = 0;
  }

  // 2. Largest first. A core joins an existing group only on evidence that
  //    they are one sprite: the boxes mostly overlap (a halo ring, a staff
  //    held across the body), or it hugs the group along a good part of its
  //    outline at crack distance — a piece split off by a broken outline.
  //    Being close is not evidence: on a tightly packed sheet a neighbour's
  //    tip sits a few pixels away, touching at a single point.
  cores.sort((a, b) => comps[b].area - comps[a].area);
  const groups: Group[] = [];
  for (const id of cores) {
    const c = comps[id];
    const host =
      groups.find((g) => containShare(c, g) >= 0.6) ??
      groups.find(
        (g) =>
          gap(c, g) <= an.crackGap && hugShare(an, id, g, an.crackGap) >= 0.15
      );
    if (host) absorb(host, c, id);
    else
      groups.push({
        minX: c.minX,
        minY: c.minY,
        maxX: c.maxX,
        maxY: c.maxY,
        area: c.area,
        ids: [id],
      });
  }

  const sprites = joinSatellites(groups);

  // 3. Small blobs join the nearest group within reach; stray ones stay
  //    unowned, so export drops them as noise.
  for (const id of rest) {
    const c = comps[id];
    let best: Group | null = null;
    let bestGap = Infinity;
    for (const g of sprites) {
      const d = gap(c, g);
      if (d < bestGap) {
        bestGap = d;
        best = g;
      }
    }
    if (best && bestGap <= Math.max(4, side(best) * 0.1)) absorb(best, c, id);
  }

  return sprites.map((g) => ({
    x: g.minX,
    y: g.minY,
    w: g.maxX - g.minX + 1,
    h: g.maxY - g.minY + 1,
    owned: g.ids.sort((a, b) => a - b),
  }));
}

/**
 * Components with at least half their pixels inside `r` — what a hand-drawn
 * or hand-resized box claims. Null when the box holds no whole blob, in which
 * case it simply clips whatever is inside.
 */
export function ownedFor(an: Analysis, r: Rect): number[] | null {
  const x0 = Math.max(0, Math.floor(r.x));
  const y0 = Math.max(0, Math.floor(r.y));
  const x1 = Math.min(an.width, Math.ceil(r.x + r.w));
  const y1 = Math.min(an.height, Math.ceil(r.y + r.h));
  const counts = new Map<number, number>();
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const l = an.labels[y * an.width + x];
      if (l >= 0) counts.set(l, (counts.get(l) ?? 0) + 1);
    }
  }
  const owned: number[] = [];
  for (const [l, n] of counts) {
    if (n >= an.components[l].area * 0.5) owned.push(l);
  }
  return owned.length ? owned.sort((a, b) => a - b) : null;
}

/** A loosely drawn box snaps to the blobs it mostly covers. */
export function snapBox(an: Analysis, r: Rect): SpriteBox {
  const owned = ownedFor(an, r);
  if (!owned) return { ...r, owned: null };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const id of owned) {
    const c = an.components[id];
    minX = Math.min(minX, c.minX);
    minY = Math.min(minY, c.minY);
    maxX = Math.max(maxX, c.maxX);
    maxY = Math.max(maxY, c.maxY);
  }
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, owned };
}

export interface GridSpec {
  cellW: number;
  cellH: number;
  offX: number;
  offY: number;
  gapX: number;
  gapY: number;
}

const MAX_CELLS = 10000;

/** Uniform grid cells, skipping the empty ones. Cells clip, they own nothing. */
export function gridSprites(an: Analysis, g: GridSpec): SpriteBox[] {
  const cw = Math.max(1, Math.round(g.cellW));
  const ch = Math.max(1, Math.round(g.cellH));
  const stepX = cw + Math.max(0, Math.round(g.gapX));
  const stepY = ch + Math.max(0, Math.round(g.gapY));
  const minFill = Math.max(4, cw * ch * 0.002);
  const out: SpriteBox[] = [];
  for (let y = Math.max(0, g.offY); y + ch <= an.height; y += stepY) {
    for (let x = Math.max(0, g.offX); x + cw <= an.width; x += stepX) {
      if (out.length >= MAX_CELLS) return out;
      let fill = 0;
      for (let yy = y; yy < y + ch && fill < minFill; yy++) {
        const row = yy * an.width;
        for (let xx = x; xx < x + cw; xx++) fill += an.content[row + xx];
      }
      if (fill >= minFill) out.push({ x, y, w: cw, h: ch, owned: null });
    }
  }
  return out;
}

/**
 * Rows of different lengths, sprites of different heights: sort by vertical
 * center, start a new row when a box no longer overlaps the current row's
 * band, then read each row left to right.
 */
export function readingOrder<T extends Rect>(
  items: T[]
): { item: T; row: number }[] {
  const sorted = [...items].sort(
    (a, b) => a.y + a.h / 2 - (b.y + b.h / 2)
  );
  const rows: { items: T[]; top: number; bottom: number }[] = [];
  for (const it of sorted) {
    const row = rows[rows.length - 1];
    if (row) {
      const overlap =
        Math.min(it.y + it.h, row.bottom) - Math.max(it.y, row.top);
      if (overlap >= 0.4 * Math.min(it.h, row.bottom - row.top)) {
        row.items.push(it);
        // The band is the running mean of member extents, so one tall sprite
        // does not stretch it over the next row.
        const k = row.items.length;
        row.top += (it.y - row.top) / k;
        row.bottom += (it.y + it.h - row.bottom) / k;
        continue;
      }
    }
    rows.push({ items: [it], top: it.y, bottom: it.y + it.h });
  }
  return rows.flatMap((row, r) =>
    row.items.sort((a, b) => a.x - b.x).map((item) => ({ item, row: r }))
  );
}

export function iou(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  const inter = w * h;
  return inter / (a.w * a.h + b.w * b.h - inter);
}
