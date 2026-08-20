// Texture-mapped mesh rendering: draws a sprite warped onto deformed triangles.
//
// Canvas 2D has no UV mapping, so each triangle is drawn separately: clip to
// the triangle, then apply the affine transform that carries its rest position
// onto its posed position. Since an affine map is fully determined by three
// point correspondences, this reproduces the sprite exactly at rest and warps
// it correctly under deformation — the standard 2D skinning trick.

import type { Mesh } from './triangulate';

/**
 * Solves for the affine transform mapping rest triangle (s*) to posed (d*).
 * Returns null when the rest triangle is degenerate and has no unique map.
 */
function affineFromTriangle(
  sx0: number, sy0: number,
  sx1: number, sy1: number,
  sx2: number, sy2: number,
  dx0: number, dy0: number,
  dx1: number, dy1: number,
  dx2: number, dy2: number
): { a: number; b: number; c: number; d: number; e: number; f: number } | null {
  // Edge vectors of the rest triangle form the basis we invert.
  const e1x = sx1 - sx0;
  const e1y = sy1 - sy0;
  const e2x = sx2 - sx0;
  const e2y = sy2 - sy0;
  const det = e1x * e2y - e2x * e1y;
  if (Math.abs(det) < 1e-9) return null;

  const inv = 1 / det;
  const f1x = dx1 - dx0;
  const f1y = dy1 - dy0;
  const f2x = dx2 - dx0;
  const f2y = dy2 - dy0;

  // Linear part: maps rest edges onto posed edges.
  const a = (f1x * e2y - f2x * e1y) * inv;
  const c = (f2x * e1x - f1x * e2x) * inv;
  const b = (f1y * e2y - f2y * e1y) * inv;
  const d = (f2y * e1x - f1y * e2x) * inv;

  // Translation places the first vertex, anchoring the map.
  return {
    a,
    b,
    c,
    d,
    e: dx0 - (a * sx0 + c * sy0),
    f: dy0 - (b * sx0 + d * sy0),
  };
}

export interface WarpedDrawOptions {
  /**
   * Outset in px applied to each triangle's clip region. Adjacent triangles
   * are drawn independently, so antialiased clip edges leave hairline seams;
   * a sub-pixel overlap hides them.
   */
  expand?: number;
}

/**
 * Draws `image` warped so its rest-space mesh lands on `positions`.
 *
 * The image is assumed to be the full sheet; `regionX/Y` locate the sprite
 * inside it, and mesh coordinates are sprite-local. The caller sets up the
 * world transform (pan/zoom) beforehand.
 */
export function drawWarpedMesh(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  mesh: Mesh,
  positions: Float32Array,
  regionX: number,
  regionY: number,
  options: WarpedDrawOptions = {}
): void {
  const expand = options.expand ?? 0.5;
  const rest = mesh.vertices;
  const tris = mesh.triangles;

  for (let t = 0; t < tris.length; t += 3) {
    const i0 = tris[t];
    const i1 = tris[t + 1];
    const i2 = tris[t + 2];

    const sx0 = rest[i0 * 2];
    const sy0 = rest[i0 * 2 + 1];
    const sx1 = rest[i1 * 2];
    const sy1 = rest[i1 * 2 + 1];
    const sx2 = rest[i2 * 2];
    const sy2 = rest[i2 * 2 + 1];

    const dx0 = positions[i0 * 2];
    const dy0 = positions[i0 * 2 + 1];
    const dx1 = positions[i1 * 2];
    const dy1 = positions[i1 * 2 + 1];
    const dx2 = positions[i2 * 2];
    const dy2 = positions[i2 * 2 + 1];

    const m = affineFromTriangle(
      sx0, sy0, sx1, sy1, sx2, sy2,
      dx0, dy0, dx1, dy1, dx2, dy2
    );
    if (!m) continue;

    ctx.save();

    // Clip to the posed triangle, nudged outward around its centroid so
    // neighbouring triangles overlap instead of leaving seams.
    const cx = (dx0 + dx1 + dx2) / 3;
    const cy = (dy0 + dy1 + dy2) / 3;
    ctx.beginPath();
    if (expand > 0) {
      ctx.moveTo(...outset(dx0, dy0, cx, cy, expand));
      ctx.lineTo(...outset(dx1, dy1, cx, cy, expand));
      ctx.lineTo(...outset(dx2, dy2, cx, cy, expand));
    } else {
      ctx.moveTo(dx0, dy0);
      ctx.lineTo(dx1, dy1);
      ctx.lineTo(dx2, dy2);
    }
    ctx.closePath();
    ctx.clip();

    // Under this transform, sprite-local rest coords map to posed coords, so
    // the sheet is drawn with its region origin at the mesh origin.
    ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
    ctx.drawImage(image, -regionX, -regionY);

    ctx.restore();
  }
}

/** Pushes a vertex away from the centroid by `amount` px. */
function outset(
  x: number,
  y: number,
  cx: number,
  cy: number,
  amount: number
): [number, number] {
  const dx = x - cx;
  const dy = y - cy;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return [x, y];
  const scale = (len + amount) / len;
  return [cx + dx * scale, cy + dy * scale];
}
