// Uniform grid estimate for classic sprite sheets (equal cells, often with
// drawn grid lines). Works on the content mask from `analyze`.

import { dilateMask, erodeMask, findComponents } from '@/utils/mask';
import { getBoundingBoxes, mergeBoxes, refineBox } from '@/utils/bbox';
import { cluster1D, solveAxis, MIN_BBOX } from '@/utils/grid';
import type { GridSpec } from './sprites';

// ERODE_R: opening radius — removes drawn grid/border lines up to ~2*R px thick.
// BRIDGE_R: dilation radius that merges fragments of one sprite.
const ERODE_R = 2;
const BRIDGE_R = 6;

export function estimateGrid(
  content: Uint8Array,
  width: number,
  height: number
): GridSpec | null {
  let contentCount = 0;
  for (let i = 0, n = width * height; i < n; i++) contentCount += content[i];
  if (!contentCount) return null;

  // Erode away thin drawn grid lines so they cannot glue sprites into one
  // component. Thin-stroke pixel art loses most of its pixels to erosion; skip
  // it then.
  const eroded = erodeMask(content, width, height, ERODE_R);
  let erodedCount = 0;
  for (let i = 0, n = width * height; i < n; i++) erodedCount += eroded[i];
  const useErosion = erodedCount >= contentCount * 0.5;
  const workMask = useErosion ? eroded : content;

  const bridged = dilateMask(workMask, width, height, BRIDGE_R);
  const { labels, numLabels } = findComponents(bridged, width, height);
  let boxes = getBoundingBoxes(workMask, labels, width, height, numLabels);

  if (useErosion) {
    for (const b of boxes) {
      b.minX = Math.max(0, b.minX - ERODE_R);
      b.minY = Math.max(0, b.minY - ERODE_R);
      b.maxX = Math.min(width - 1, b.maxX + ERODE_R);
      b.maxY = Math.min(height - 1, b.maxY + ERODE_R);
    }
  }

  boxes = boxes.filter(
    (b) => b.maxX - b.minX + 1 >= MIN_BBOX && b.maxY - b.minY + 1 >= MIN_BBOX
  );
  if (!boxes.length) return null;
  boxes = mergeBoxes(boxes, 2);

  // Drop a box that swallowed almost the whole sheet (a surviving border) as
  // long as real sprite boxes remain.
  if (boxes.length > 1) {
    const filtered = boxes.filter(
      (b) =>
        !(
          b.maxX - b.minX + 1 > width * 0.75 &&
          b.maxY - b.minY + 1 > height * 0.75
        )
    );
    if (filtered.length) boxes = filtered;
  }

  for (const b of boxes) refineBox(b, content, width, height);
  boxes = mergeBoxes(boxes, 2);

  const widths = boxes.map((b) => b.maxX - b.minX + 1).sort((a, b) => a - b);
  const heights = boxes.map((b) => b.maxY - b.minY + 1).sort((a, b) => a - b);
  const medW = widths[Math.floor(widths.length / 2)];
  const medH = heights[Math.floor(heights.length / 2)];

  const ax = solveAxis(
    cluster1D(
      boxes.map((b) => ({ center: (b.minX + b.maxX) / 2, min: b.minX, max: b.maxX })),
      Math.max(MIN_BBOX, medW * 0.6)
    ),
    width
  );
  const ay = solveAxis(
    cluster1D(
      boxes.map((b) => ({ center: (b.minY + b.maxY) / 2, min: b.minY, max: b.maxY })),
      Math.max(MIN_BBOX, medH * 0.6)
    ),
    height
  );

  return {
    cellW: Math.max(1, ax.cell),
    cellH: Math.max(1, ay.cell),
    offX: ax.offset,
    offY: ay.offset,
    gapX: ax.gap,
    gapY: ay.gap,
  };
}
