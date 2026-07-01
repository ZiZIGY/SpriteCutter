// Bounding-box helpers for sprite detection.

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// ── bounding boxes: tight boxes over `contentMask` pixels, grouped by labels ──

export function getBoundingBoxes(
  contentMask: Uint8Array,
  labels: Int32Array,
  width: number,
  height: number,
  numLabels: number
): BBox[] {
  const bMinX = new Int32Array(numLabels).fill(width);
  const bMinY = new Int32Array(numLabels).fill(height);
  const bMaxX = new Int32Array(numLabels).fill(-1);
  const bMaxY = new Int32Array(numLabels).fill(-1);

  for (let i = 0, n = width * height; i < n; i++) {
    if (contentMask[i] === 0) continue;
    const lbl = labels[i];
    if (lbl < 0) continue;
    const x = i % width;
    const y = (i / width) | 0;
    if (x < bMinX[lbl]) bMinX[lbl] = x;
    if (x > bMaxX[lbl]) bMaxX[lbl] = x;
    if (y < bMinY[lbl]) bMinY[lbl] = y;
    if (y > bMaxY[lbl]) bMaxY[lbl] = y;
  }

  const result: BBox[] = [];
  for (let k = 0; k < numLabels; k++) {
    if (bMaxX[k] >= bMinX[k] && bMaxY[k] >= bMinY[k])
      result.push({
        minX: bMinX[k],
        minY: bMinY[k],
        maxX: bMaxX[k],
        maxY: bMaxY[k],
      });
  }
  return result;
}

// ── merge overlapping / nearly-touching boxes ─────────────────────────────────

export function mergeBoxes(boxes: BBox[], pad: number): BBox[] {
  const list = boxes.map((b) => ({ ...b }));
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (
          a.minX <= b.maxX + pad &&
          b.minX <= a.maxX + pad &&
          a.minY <= b.maxY + pad &&
          b.minY <= a.maxY + pad
        ) {
          a.minX = Math.min(a.minX, b.minX);
          a.minY = Math.min(a.minY, b.minY);
          a.maxX = Math.max(a.maxX, b.maxX);
          a.maxY = Math.max(a.maxY, b.maxY);
          list.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  return list;
}

// ── grow a box to recover thin features lost to erosion ───────────────────────
// Expands each edge outward while the adjacent 1px strip of the ORIGINAL mask
// contains some content but is less than half full: sprite tips and outlines
// are sparse strips (grow), drawn border lines are solid strips (stop).

export function refineBox(
  b: BBox,
  mask: Uint8Array,
  width: number,
  height: number
): void {
  const MAX_GROW = 24;
  for (let iter = 0; iter < MAX_GROW; iter++) {
    let grown = false;

    if (b.minY > 0) {
      const y = b.minY - 1;
      let cnt = 0;
      for (let x = b.minX; x <= b.maxX; x++) cnt += mask[y * width + x];
      if (cnt > 0 && cnt < (b.maxX - b.minX + 1) * 0.5) {
        b.minY--;
        grown = true;
      }
    }
    if (b.maxY < height - 1) {
      const y = b.maxY + 1;
      let cnt = 0;
      for (let x = b.minX; x <= b.maxX; x++) cnt += mask[y * width + x];
      if (cnt > 0 && cnt < (b.maxX - b.minX + 1) * 0.5) {
        b.maxY++;
        grown = true;
      }
    }
    if (b.minX > 0) {
      const x = b.minX - 1;
      let cnt = 0;
      for (let y = b.minY; y <= b.maxY; y++) cnt += mask[y * width + x];
      if (cnt > 0 && cnt < (b.maxY - b.minY + 1) * 0.5) {
        b.minX--;
        grown = true;
      }
    }
    if (b.maxX < width - 1) {
      const x = b.maxX + 1;
      let cnt = 0;
      for (let y = b.minY; y <= b.maxY; y++) cnt += mask[y * width + x];
      if (cnt > 0 && cnt < (b.maxY - b.minY + 1) * 0.5) {
        b.maxX++;
        grown = true;
      }
    }

    if (!grown) break;
  }
}
