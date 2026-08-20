// Silhouette extraction: alpha mask → simplified outer contour polygon.

export interface Point {
  x: number;
  y: number;
}

/**
 * Builds a binary mask from image data: 1 where alpha exceeds the threshold.
 * `region` restricts the scan to one sprite cell; coordinates in the returned
 * mask are relative to that region's top-left corner.
 */
export function alphaMask(
  data: Uint8ClampedArray,
  imageWidth: number,
  region: { x: number; y: number; width: number; height: number },
  alphaThreshold = 8
): Uint8Array {
  const { x: rx, y: ry, width, height } = region;
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const src = ((ry + y) * imageWidth + (rx + x)) * 4;
      mask[y * width + x] = data[src + 3] > alphaThreshold ? 1 : 0;
    }
  }
  return mask;
}

/**
 * Moore-neighbour boundary tracing of the largest blob in the mask.
 * Returns pixel-corner coordinates walking the outer silhouette clockwise.
 * Interior holes are ignored: a game sprite mesh only needs the outer hull.
 */
export function traceContour(
  mask: Uint8Array,
  width: number,
  height: number
): Point[] {
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= width || y >= height ? 0 : mask[y * width + x];

  // Find the topmost-leftmost filled pixel as the tracing seed.
  let startX = -1;
  let startY = -1;
  outer: for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x]) {
        startX = x;
        startY = y;
        break outer;
      }
    }
  }
  if (startX < 0) return [];

  // 8-neighbour offsets in clockwise order starting at east.
  const dirs = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
  ];

  const contour: Point[] = [];
  let cx = startX;
  let cy = startY;
  // The seed is the topmost-leftmost pixel, so its west neighbour is empty:
  // start the search there so the walk heads around the shape, not into it.
  let backtrack = 4;
  const maxSteps = width * height * 4;

  for (let step = 0; step < maxSteps; step++) {
    contour.push({ x: cx, y: cy });

    // Sweep clockwise from just after the direction we came from. Starting at
    // backtrack+1 is what keeps the walk hugging the boundary instead of
    // immediately stepping back onto the previous pixel.
    let found = false;
    for (let i = 1; i <= 8; i++) {
      const d = (backtrack + i) % 8;
      const nx = cx + dirs[d][0];
      const ny = cy + dirs[d][1];
      if (at(nx, ny)) {
        // The new backtrack points from the next pixel back to the current one.
        backtrack = (d + 4) % 8;
        cx = nx;
        cy = ny;
        found = true;
        break;
      }
    }
    if (!found) break; // isolated pixel

    if (cx === startX && cy === startY) break;
  }
  return contour;
}

/** Perpendicular distance from `p` to the segment `a`–`b`. */
function pointSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Ramer–Douglas–Peucker simplification. Iterative to avoid blowing the stack
 * on the long contours traced from high-resolution sprites.
 */
export function simplifyContour(points: Point[], tolerance: number): Point[] {
  if (points.length < 3) return points.slice();

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];

  while (stack.length) {
    const [first, last] = stack.pop()!;
    let maxDist = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const dist = pointSegmentDistance(points[i], points[first], points[last]);
      if (dist > maxDist) {
        maxDist = dist;
        index = i;
      }
    }
    if (index >= 0 && maxDist > tolerance) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  const result: Point[] = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) result.push(points[i]);
  return result;
}

/**
 * Resamples a closed polygon so no edge is longer than `maxEdge`, which keeps
 * triangles well-shaped where the silhouette has long straight runs.
 */
export function resampleClosed(points: Point[], maxEdge: number): Point[] {
  if (points.length < 2) return points.slice();
  const result: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    result.push(a);
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const splits = Math.floor(dist / maxEdge);
    for (let s = 1; s <= splits; s++) {
      const t = s / (splits + 1);
      result.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return result;
}

/** Signed area; positive when the polygon winds counter-clockwise. */
export function signedArea(polygon: Point[]): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

/** Even-odd ray casting point-in-polygon test. */
export function pointInPolygon(p: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i];
    const pj = polygon[j];
    if (
      pi.y > p.y !== pj.y > p.y &&
      p.x < ((pj.x - pi.x) * (p.y - pi.y)) / (pj.y - pi.y) + pi.x
    )
      inside = !inside;
  }
  return inside;
}
