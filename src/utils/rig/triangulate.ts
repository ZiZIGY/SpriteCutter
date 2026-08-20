// Mesh generation: contour polygon + interior grid → triangle mesh.

import {
  pointInPolygon,
  resampleClosed,
  signedArea,
  simplifyContour,
  traceContour,
  type Point,
} from './contour';

export interface Mesh {
  /** Flat vertex positions [x0, y0, x1, y1, …] in sprite-local pixels. */
  vertices: Float32Array;
  /** Vertex index triples. */
  triangles: Uint32Array;
  /** Number of leading vertices that lie on the outer contour. */
  contourCount: number;
}

export interface MeshOptions {
  /** RDP tolerance in px: higher = coarser silhouette. */
  simplifyTolerance: number;
  /** Target spacing for contour resampling and the interior grid, in px. */
  spacing: number;
  /** Alpha cutoff for treating a pixel as content. */
  alphaThreshold: number;
  /**
   * Minimum fraction of a triangle that must sit on drawn pixels for it to be
   * kept, 0..1. Lower values keep more triangles along ragged edges; higher
   * values cut harder into holes and concavities.
   */
  minCoverage: number;
}

export const defaultMeshOptions: MeshOptions = {
  simplifyTolerance: 1.5,
  spacing: 24,
  alphaThreshold: 8,
  minCoverage: 0.5,
};

/** Reads the mask at a rounded position; out of bounds counts as empty. */
function sampleMask(
  mask: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number
): boolean {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= width || py >= height) return false;
  return mask[py * width + px] === 1;
}

/**
 * Fraction of a triangle's area that lies on drawn pixels, estimated by
 * sampling a barycentric lattice. Cheap and stable enough to classify
 * bridging triangles without rasterising them exactly.
 */
function maskCoverage(
  mask: Uint8Array,
  width: number,
  height: number,
  a: Point,
  b: Point,
  c: Point
): number {
  const STEPS = 6;
  let hit = 0;
  let total = 0;
  for (let i = 1; i < STEPS; i++) {
    for (let j = 1; i + j < STEPS; j++) {
      const u = i / STEPS;
      const v = j / STEPS;
      const w = 1 - u - v;
      total++;
      if (
        sampleMask(
          mask,
          width,
          height,
          a.x * u + b.x * v + c.x * w,
          a.y * u + b.y * v + c.y * w
        )
      )
        hit++;
    }
  }
  return total ? hit / total : 0;
}

/**
 * Bowyer–Watson Delaunay triangulation over the given points.
 * Returns index triples into `points`. O(n^2) in the worst case, which is fine
 * for the few hundred vertices a sprite mesh needs.
 */
function delaunay(points: Point[]): number[][] {
  if (points.length < 3) return [];

  // Super-triangle large enough to contain every point.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const dx = maxX - minX || 1;
  const dy = maxY - minY || 1;
  const deltaMax = Math.max(dx, dy) * 10;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  const pts: Point[] = [
    ...points,
    { x: midX - deltaMax, y: midY - deltaMax },
    { x: midX + deltaMax, y: midY - deltaMax },
    { x: midX, y: midY + deltaMax },
  ];
  const n = points.length;
  let triangles: number[][] = [[n, n + 1, n + 2]];

  const inCircumcircle = (p: Point, a: Point, b: Point, c: Point): boolean => {
    const ax = a.x - p.x;
    const ay = a.y - p.y;
    const bx = b.x - p.x;
    const by = b.y - p.y;
    const cx = c.x - p.x;
    const cy = c.y - p.y;
    const det =
      (ax * ax + ay * ay) * (bx * cy - cx * by) -
      (bx * bx + by * by) * (ax * cy - cx * ay) +
      (cx * cx + cy * cy) * (ax * by - bx * ay);
    // Sign depends on triangle orientation; normalise by it.
    const orient =
      (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
    return orient > 0 ? det > 0 : det < 0;
  };

  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const bad: number[][] = [];
    const good: number[][] = [];
    for (const tri of triangles) {
      if (inCircumcircle(p, pts[tri[0]], pts[tri[1]], pts[tri[2]]))
        bad.push(tri);
      else good.push(tri);
    }

    // Collect the boundary of the cavity: edges used by exactly one bad tri.
    const edgeCount = new Map<string, number>();
    const edgeVerts = new Map<string, [number, number]>();
    for (const tri of bad) {
      for (let e = 0; e < 3; e++) {
        const a = tri[e];
        const b = tri[(e + 1) % 3];
        const key = a < b ? `${a}_${b}` : `${b}_${a}`;
        edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
        edgeVerts.set(key, [a, b]);
      }
    }
    triangles = good;
    for (const [key, count] of edgeCount) {
      if (count !== 1) continue;
      const [a, b] = edgeVerts.get(key)!;
      triangles.push([a, b, i]);
    }
  }

  // Drop any triangle still touching the super-triangle.
  return triangles.filter((t) => t[0] < n && t[1] < n && t[2] < n);
}

/**
 * Builds a triangle mesh for a sprite from its alpha mask.
 *
 * Contour vertices come first so the UI can distinguish outline handles from
 * interior ones. Triangles whose centroid falls outside the silhouette are
 * discarded, which keeps concave shapes (limbs, gaps) from being bridged.
 */
export function buildMesh(
  mask: Uint8Array,
  width: number,
  height: number,
  options: MeshOptions = defaultMeshOptions
): Mesh {
  const raw = traceContour(mask, width, height);
  if (raw.length < 3)
    return {
      vertices: new Float32Array(),
      triangles: new Uint32Array(),
      contourCount: 0,
    };

  let contour = simplifyContour(raw, options.simplifyTolerance);
  contour = resampleClosed(contour, options.spacing);
  // Normalise winding to counter-clockwise for predictable normals.
  if (signedArea(contour) < 0) contour.reverse();

  const points: Point[] = contour.slice();
  const contourCount = points.length;

  // Interior sample grid, offset to avoid landing exactly on contour points.
  const step = options.spacing;
  const inset = step * 0.5;
  for (let y = inset; y < height; y += step) {
    for (let x = inset; x < width; x += step) {
      const p = { x, y };
      // The traced contour is the outer hull only, so a point inside it can
      // still land in a hole (a spiral curling back on itself). The mask is
      // the authority on what is actually drawn.
      if (!sampleMask(mask, width, height, x, y)) continue;
      if (!pointInPolygon(p, contour)) continue;
      // Skip samples hugging the contour: they create slivers.
      let tooClose = false;
      for (const c of contour) {
        if (Math.hypot(c.x - x, c.y - y) < step * 0.45) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) points.push(p);
    }
  }

  const tris = delaunay(points).filter((t) => {
    const a = points[t[0]];
    const b = points[t[1]];
    const c = points[t[2]];

    // Reject degenerate slivers.
    const area =
      Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
    if (area <= 0.01) return false;

    // Keep a triangle only if it mostly covers real pixels. Testing the
    // centroid against the outer contour is not enough: a sprite that curls
    // around (a spiral tentacle, a ring) encloses a hole that lies inside the
    // contour, and triangles bridging it would deform empty space.
    return maskCoverage(mask, width, height, a, b, c) >= options.minCoverage;
  });

  const vertices = new Float32Array(points.length * 2);
  for (let i = 0; i < points.length; i++) {
    vertices[i * 2] = points[i].x;
    vertices[i * 2 + 1] = points[i].y;
  }
  const triangles = new Uint32Array(tris.length * 3);
  for (let i = 0; i < tris.length; i++) {
    triangles[i * 3] = tris[i][0];
    triangles[i * 3 + 1] = tris[i][1];
    triangles[i * 3 + 2] = tris[i][2];
  }

  return { vertices, triangles, contourCount };
}
