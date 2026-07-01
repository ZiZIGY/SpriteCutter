import { loadPixels } from '@/utils/image';
import { dilateMask, erodeMask, findComponents } from '@/utils/mask';
import { getBoundingBoxes, mergeBoxes, refineBox, type BBox } from '@/utils/bbox';
import { cluster1D, solveAxis, MIN_BBOX } from '@/utils/grid';

export interface AutoDetectResult {
  cellWidth: number;
  cellHeight: number;
  offsetX: number;
  offsetY: number;
  gapX: number;
  gapY: number;
  cols: number;
  rows: number;
  cellOffsets: Record<string, { x: number; y: number }>;
}

// ERODE_R: opening radius — removes drawn grid/border lines up to ~2*R px thick.
// BRIDGE_R: dilation radius for flood-fill grouping — merges sprite fragments
// separated by small gaps (the "margin" of the sprite-locator algorithm).
const ERODE_R = 2;
const BRIDGE_R = 6;

export async function autoDetect(
  imageSrc: string,
  imageWidth: number,
  imageHeight: number,
  bgHex: string,
  tolerance: number
): Promise<AutoDetectResult | null> {
  const pixels = await loadPixels(imageSrc, imageWidth, imageHeight);

  const bgR = parseInt(bgHex.slice(1, 3), 16);
  const bgG = parseInt(bgHex.slice(3, 5), 16);
  const bgB = parseInt(bgHex.slice(5, 7), 16);
  const tolSq = tolerance * tolerance;

  // 1. Binary mask: 1 = content pixel, 0 = background
  const origMask = new Uint8Array(imageWidth * imageHeight);
  let origCount = 0;
  for (let i = 0, n = imageWidth * imageHeight; i < n; i++) {
    const pi = i * 4;
    if (pixels[pi + 3] < 16) continue;
    const dr = pixels[pi] - bgR;
    const dg = pixels[pi + 1] - bgG;
    const db = pixels[pi + 2] - bgB;
    if (dr * dr + dg * dg + db * db > tolSq) {
      origMask[i] = 1;
      origCount++;
    }
  }
  if (origCount === 0) return null;

  // 2. Morphological opening: erode away thin drawn grid/border lines so they
  //    cannot glue sprites together into one giant flood-fill component.
  //    If erosion destroys most of the content (thin-stroke pixel art), skip it.
  const eroded = erodeMask(origMask, imageWidth, imageHeight, ERODE_R);
  let erodedCount = 0;
  for (let i = 0, n = imageWidth * imageHeight; i < n; i++)
    erodedCount += eroded[i];
  const useErosion = erodedCount >= origCount * 0.5;
  const workMask = useErosion ? eroded : origMask;

  // 3. Flood-fill grouping with margin: dilate, then connected components.
  //    Pixels within 2*BRIDGE_R of each other end up in the same component.
  const bridged = dilateMask(workMask, imageWidth, imageHeight, BRIDGE_R);
  const { labels, numLabels } = findComponents(bridged, imageWidth, imageHeight);

  // 4. Tight bounding boxes (min/max of content pixels per component)
  let boxes = getBoundingBoxes(workMask, labels, imageWidth, imageHeight, numLabels);

  // Compensate for erosion shrinkage so boxes hug the original sprite edges
  if (useErosion) {
    for (const b of boxes) {
      b.minX = Math.max(0, b.minX - ERODE_R);
      b.minY = Math.max(0, b.minY - ERODE_R);
      b.maxX = Math.min(imageWidth - 1, b.maxX + ERODE_R);
      b.maxY = Math.min(imageHeight - 1, b.maxY + ERODE_R);
    }
  }

  boxes = boxes.filter(
    (b) => b.maxX - b.minX + 1 >= MIN_BBOX && b.maxY - b.minY + 1 >= MIN_BBOX
  );
  if (!boxes.length) return null;

  // 5. Merge boxes that overlap after expansion (fragments of one sprite)
  boxes = mergeBoxes(boxes, 2);

  // 6. Safety: drop a box that swallowed almost the whole sheet (e.g. surviving
  //    border grid) as long as real sprite boxes remain.
  if (boxes.length > 1) {
    const filtered = boxes.filter(
      (b) =>
        !(
          b.maxX - b.minX + 1 > imageWidth * 0.75 &&
          b.maxY - b.minY + 1 > imageHeight * 0.75
        )
    );
    if (filtered.length) boxes = filtered;
  }

  // 7. Recover thin features (sprite tips, outlines) eaten by erosion:
  //    grow each box against the original mask, then re-merge overlaps.
  for (const b of boxes) refineBox(b, origMask, imageWidth, imageHeight);
  boxes = mergeBoxes(boxes, 2);

  // 8. Cluster box projections into grid columns and rows
  const widths = boxes.map((b) => b.maxX - b.minX + 1).sort((a, b) => a - b);
  const heights = boxes.map((b) => b.maxY - b.minY + 1).sort((a, b) => a - b);
  const medW = widths[Math.floor(widths.length / 2)];
  const medH = heights[Math.floor(heights.length / 2)];

  const colClusters = cluster1D(
    boxes.map((b) => ({
      center: (b.minX + b.maxX) / 2,
      min: b.minX,
      max: b.maxX,
    })),
    Math.max(MIN_BBOX, medW * 0.6)
  );
  const rowClusters = cluster1D(
    boxes.map((b) => ({
      center: (b.minY + b.maxY) / 2,
      min: b.minY,
      max: b.maxY,
    })),
    Math.max(MIN_BBOX, medH * 0.6)
  );

  // 9. Uniform grid per axis: period from median center spacing,
  //    cell size from the widest cluster extent, offset from the first cluster
  const ax = solveAxis(colClusters, imageWidth);
  const ay = solveAxis(rowClusters, imageHeight);

  // 10. Per-cell centroid offsets: where a sprite sits off-center in its cell
  const perCell = new Map<string, BBox>();
  for (const b of boxes) {
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const col = Math.round((cx - ax.offset - ax.cell / 2) / ax.period);
    const row = Math.round((cy - ay.offset - ay.cell / 2) / ay.period);
    if (col < 0 || col >= ax.count || row < 0 || row >= ay.count) continue;
    const key = `${col}_${row}`;
    const cur = perCell.get(key);
    if (cur) {
      cur.minX = Math.min(cur.minX, b.minX);
      cur.minY = Math.min(cur.minY, b.minY);
      cur.maxX = Math.max(cur.maxX, b.maxX);
      cur.maxY = Math.max(cur.maxY, b.maxY);
    } else {
      perCell.set(key, { ...b });
    }
  }

  const cellOffsets: Record<string, { x: number; y: number }> = {};
  for (const [key, b] of perCell) {
    const [col, row] = key.split('_').map(Number);
    const dx = Math.round(
      (b.minX + b.maxX) / 2 - (ax.offset + col * ax.period + ax.cell / 2)
    );
    const dy = Math.round(
      (b.minY + b.maxY) / 2 - (ay.offset + row * ay.period + ay.cell / 2)
    );
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      cellOffsets[key] = { x: dx, y: dy };
    }
  }

  return {
    cellWidth: Math.max(1, ax.cell),
    cellHeight: Math.max(1, ay.cell),
    offsetX: ax.offset,
    offsetY: ay.offset,
    gapX: ax.gap,
    gapY: ay.gap,
    cols: ax.count,
    rows: ay.count,
    cellOffsets,
  };
}
