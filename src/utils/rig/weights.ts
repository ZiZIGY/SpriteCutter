// Skinning weights: automatic assignment by bone-distance falloff, plus the
// linear-blend deformation that consumes them.

import {
  applyMat,
  boneSegment,
  restTransforms,
  type Bone,
  type Mat2x3,
} from './skeleton';

/**
 * Per-vertex bone influences. Parallel arrays sized `vertexCount * maxInfluences`
 * keep this compact and cheap to iterate during deformation.
 */
export interface Weights {
  /** Bone ids, or -1 for an unused slot. */
  boneIds: Int32Array;
  /** Influence per slot; the slots of one vertex sum to 1. */
  values: Float32Array;
  maxInfluences: number;
  vertexCount: number;
}

export const MAX_INFLUENCES = 4;

export function emptyWeights(
  vertexCount: number,
  maxInfluences = MAX_INFLUENCES
): Weights {
  return {
    boneIds: new Int32Array(vertexCount * maxInfluences).fill(-1),
    values: new Float32Array(vertexCount * maxInfluences),
    maxInfluences,
    vertexCount,
  };
}

/** Shortest distance from a point to a bone shaft (a line segment). */
function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Closest point to (px,py) on the segment a-b. */
function closestPointOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): { x: number; y: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) return { x: ax, y: ay };
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return { x: ax + t * dx, y: ay + t * dy };
}

export interface AutoWeightOptions {
  /**
   * Falloff exponent. Higher values make influence drop off faster, giving
   * each bone a tighter, more local region.
   */
  falloff: number;
  /** Influences below this fraction of the strongest one are discarded. */
  cutoff: number;
  maxInfluences: number;
}

export const defaultAutoWeightOptions: AutoWeightOptions = {
  falloff: 2.5,
  cutoff: 0.08,
  maxInfluences: MAX_INFLUENCES,
};

/**
 * The sprite silhouette, used to stop influence leaking across empty space.
 * Without it a bone lying in a hole — the gap inside a curled tentacle, the
 * space between two legs — grabs vertices on the far side purely because they
 * are close in a straight line.
 */
export interface OccluderMask {
  mask: Uint8Array;
  width: number;
  height: number;
}

/**
 * Walks the segment from a bone to a vertex and reports whether it stays on
 * drawn pixels. A few empty samples are tolerated so antialiased edges and the
 * mask's own raggedness do not sever legitimate influence.
 */
function visibleThroughMask(
  occluder: OccluderMask,
  ax: number,
  ay: number,
  bx: number,
  by: number
): boolean {
  const { mask, width, height } = occluder;
  const dist = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(2, Math.ceil(dist / 2));
  let empty = 0;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = Math.round(ax + (bx - ax) * t);
    const py = Math.round(ay + (by - ay) * t);
    if (px < 0 || py < 0 || px >= width || py >= height) {
      empty++;
      continue;
    }
    if (mask[py * width + px] === 0) empty++;
  }
  // More than a quarter of the path off the sprite means it crosses a gap.
  return empty / (steps + 1) <= 0.25;
}

/**
 * Assigns weights by inverse-distance falloff to each bone shaft, keeping the
 * strongest few influences per vertex and normalising them to sum to 1.
 *
 * This is the standard "auto weights" heuristic used by 2D rigging tools: it is
 * shape-agnostic and instant, unlike bounded-biharmonic weights which need a
 * Laplacian solve over the mesh. Users refine the result by painting.
 */
export function autoWeights(
  vertices: Float32Array,
  bones: Bone[],
  options: AutoWeightOptions = defaultAutoWeightOptions,
  occluder?: OccluderMask
): Weights {
  const vertexCount = vertices.length / 2;
  const maxInf = Math.max(1, options.maxInfluences);
  const weights = emptyWeights(vertexCount, maxInf);
  if (!bones.length) return weights;

  const transforms = restTransforms(bones);
  const segments = bones.map((bone) => {
    const { start, end } = boneSegment(bone, transforms);
    return { id: bone.id, start, end };
  });

  /**
   * Fraction of a bone's own shaft that lies on drawn pixels. A bone floating
   * in a hole scores ~0 and must never win the fallback, otherwise removing its
   * line-of-sight influence would just hand it every hidden vertex instead.
   */
  const onSprite = new Map<number, number>();
  if (occluder) {
    for (const seg of segments) {
      const steps = Math.max(
        2,
        Math.ceil(Math.hypot(seg.end.x - seg.start.x, seg.end.y - seg.start.y) / 2)
      );
      let hit = 0;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const px = Math.round(seg.start.x + (seg.end.x - seg.start.x) * t);
        const py = Math.round(seg.start.y + (seg.end.y - seg.start.y) * t);
        if (
          px >= 0 &&
          py >= 0 &&
          px < occluder.width &&
          py < occluder.height &&
          occluder.mask[py * occluder.width + px] === 1
        )
          hit++;
      }
      onSprite.set(seg.id, hit / (steps + 1));
    }
  }
  /** Bones that actually sit on the sprite; the only valid fallback targets. */
  const grounded = occluder
    ? segments.filter((seg) => (onSprite.get(seg.id) ?? 0) >= 0.5)
    : segments;

  for (let v = 0; v < vertexCount; v++) {
    const px = vertices[v * 2];
    const py = vertices[v * 2 + 1];

    const candidates: { id: number; value: number }[] = [];
    let best = 0;
    for (const seg of segments) {
      const dist = distanceToSegment(
        px,
        py,
        seg.start.x,
        seg.start.y,
        seg.end.x,
        seg.end.y
      );

      // A bone that does not lie on the sprite owns nothing.
      if (occluder && (onSprite.get(seg.id) ?? 0) < 0.5) continue;

      // Skip a bone whose line of sight to this vertex leaves the silhouette.
      if (occluder) {
        const closest = closestPointOnSegment(
          px,
          py,
          seg.start.x,
          seg.start.y,
          seg.end.x,
          seg.end.y
        );
        if (!visibleThroughMask(occluder, closest.x, closest.y, px, py))
          continue;
      }

      // +1 keeps the weight finite for vertices sitting exactly on a bone.
      const influence = 1 / Math.pow(dist + 1, options.falloff);
      candidates.push({ id: seg.id, value: influence });
      if (influence > best) best = influence;
    }

    // A vertex hidden from every bone falls back to the nearest bone that is
    // itself on the sprite, so it still follows the rig without handing power
    // to a bone floating in a hole.
    if (!candidates.length) {
      const pool = grounded.length ? grounded : segments;
      let nearest = pool[0];
      let nearestDist = Infinity;
      for (const seg of pool) {
        const d = distanceToSegment(
          px,
          py,
          seg.start.x,
          seg.start.y,
          seg.end.x,
          seg.end.y
        );
        if (d < nearestDist) {
          nearestDist = d;
          nearest = seg;
        }
      }
      weights.boneIds[v * maxInf] = nearest.id;
      weights.values[v * maxInf] = 1;
      continue;
    }

    // Keep the strongest influences above the relative cutoff.
    const threshold = best * options.cutoff;
    const picked = candidates.filter((c) => c.value >= threshold);
    picked.sort((a, b) => b.value - a.value);
    picked.length = Math.min(picked.length, maxInf);

    let total = 0;
    for (const p of picked) total += p.value;
    if (total <= 0) continue;

    const base = v * maxInf;
    for (let i = 0; i < picked.length; i++) {
      weights.boneIds[base + i] = picked[i].id;
      weights.values[base + i] = picked[i].value / total;
    }
  }

  return weights;
}

/** Reads one vertex influence for a bone; 0 when unbound. */
export function getWeight(
  weights: Weights,
  vertexIndex: number,
  boneId: number
): number {
  const base = vertexIndex * weights.maxInfluences;
  for (let i = 0; i < weights.maxInfluences; i++) {
    if (weights.boneIds[base + i] === boneId) return weights.values[base + i];
  }
  return 0;
}

function countBound(weights: Weights, vertexIndex: number): number {
  const base = vertexIndex * weights.maxInfluences;
  let n = 0;
  for (let i = 0; i < weights.maxInfluences; i++)
    if (weights.boneIds[base + i] !== -1) n++;
  return n;
}

/**
 * Sets one vertex influence for a bone and renormalises the remaining slots so
 * the vertex still sums to 1 — what a weight-painting brush needs.
 */
export function setWeight(
  weights: Weights,
  vertexIndex: number,
  boneId: number,
  value: number
): void {
  const maxInf = weights.maxInfluences;
  const base = vertexIndex * maxInf;
  const clamped = Math.max(0, Math.min(1, value));

  let slot = -1;
  let freeSlot = -1;
  for (let i = 0; i < maxInf; i++) {
    const id = weights.boneIds[base + i];
    if (id === boneId) slot = i;
    else if (id === -1 && freeSlot < 0) freeSlot = i;
  }

  if (slot < 0) {
    if (clamped === 0) return;
    if (freeSlot >= 0) slot = freeSlot;
    else {
      // Evict the weakest influence to make room.
      let weakest = 0;
      for (let i = 1; i < maxInf; i++)
        if (weights.values[base + i] < weights.values[base + weakest])
          weakest = i;
      slot = weakest;
    }
    weights.boneIds[base + slot] = boneId;
  }

  weights.values[base + slot] = clamped;
  if (clamped === 0) weights.boneIds[base + slot] = -1;

  // Distribute the remainder across the other bound slots.
  let othersTotal = 0;
  for (let i = 0; i < maxInf; i++) {
    if (i === slot || weights.boneIds[base + i] === -1) continue;
    othersTotal += weights.values[base + i];
  }
  const remaining = 1 - clamped;
  const otherCount = Math.max(1, countBound(weights, vertexIndex) - 1);
  for (let i = 0; i < maxInf; i++) {
    if (i === slot || weights.boneIds[base + i] === -1) continue;
    weights.values[base + i] =
      othersTotal > 0
        ? (weights.values[base + i] / othersTotal) * remaining
        : remaining / otherCount;
  }
}

/**
 * Linear blend skinning: deforms rest vertices by the bones' skinning matrices,
 * blended per vertex by its weights. Writes into `out` to avoid reallocating
 * every animation frame.
 */
export function deform(
  vertices: Float32Array,
  weights: Weights,
  matrices: Map<number, Mat2x3>,
  out: Float32Array
): Float32Array {
  const vertexCount = vertices.length / 2;
  const maxInf = weights.maxInfluences;

  for (let v = 0; v < vertexCount; v++) {
    const rx = vertices[v * 2];
    const ry = vertices[v * 2 + 1];
    let x = 0;
    let y = 0;
    let totalWeight = 0;
    const base = v * maxInf;

    for (let i = 0; i < maxInf; i++) {
      const boneId = weights.boneIds[base + i];
      if (boneId === -1) continue;
      const weight = weights.values[base + i];
      if (weight === 0) continue;
      const m = matrices.get(boneId);
      if (!m) continue;
      const p = applyMat(m, rx, ry);
      x += p.x * weight;
      y += p.y * weight;
      totalWeight += weight;
    }

    // Unweighted vertices stay put rather than collapsing to the origin.
    if (totalWeight <= 0) {
      out[v * 2] = rx;
      out[v * 2 + 1] = ry;
    } else {
      out[v * 2] = x / totalWeight;
      out[v * 2 + 1] = y / totalWeight;
    }
  }
  return out;
}
