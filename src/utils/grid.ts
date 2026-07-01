// 1D clustering of box projections into grid columns / rows and
// derivation of uniform grid parameters per axis.

export const MIN_BBOX = 8;
export const MIN_GAP = 4;

export interface AxisItem {
  center: number;
  min: number;
  max: number;
}

export interface AxisCluster {
  center: number;
  min: number;
  max: number;
}

export function cluster1D(items: AxisItem[], threshold: number): AxisCluster[] {
  const sorted = [...items].sort((a, b) => a.center - b.center);
  const acc: { sum: number; count: number; min: number; max: number }[] = [];
  for (const it of sorted) {
    const last = acc[acc.length - 1];
    if (last && it.center - last.sum / last.count <= threshold) {
      last.sum += it.center;
      last.count++;
      last.min = Math.min(last.min, it.min);
      last.max = Math.max(last.max, it.max);
    } else {
      acc.push({ sum: it.center, count: 1, min: it.min, max: it.max });
    }
  }
  return acc.map((c) => ({
    center: c.sum / c.count,
    min: c.min,
    max: c.max,
  }));
}

// ── derive uniform grid parameters for one axis from clusters ─────────────────

export interface AxisGrid {
  period: number;
  cell: number;
  offset: number;
  gap: number;
  count: number;
}

export function solveAxis(clusters: AxisCluster[], imageSize: number): AxisGrid {
  let cell = 0;
  for (const c of clusters) cell = Math.max(cell, c.max - c.min + 1);
  const contentMin = Math.min(...clusters.map((c) => c.min));

  if (clusters.length === 1) {
    const offset = Math.max(0, Math.min(contentMin, imageSize - cell));
    return {
      period: imageSize,
      cell: Math.min(cell, imageSize - offset),
      offset,
      gap: 0,
      count: 1,
    };
  }

  // Median spacing between adjacent column/row centers = grid period.
  // Robust to a missing cell in the middle (its double-spacing lands at the
  // end of the sorted diffs and does not shift the median).
  const diffs: number[] = [];
  for (let i = 1; i < clusters.length; i++)
    diffs.push(clusters[i].center - clusters[i - 1].center);
  diffs.sort((a, b) => a - b);
  const period = Math.max(
    MIN_BBOX,
    Math.round(diffs[Math.floor(diffs.length / 2)])
  );

  let cellSize = Math.min(cell, period);
  let gap = period - cellSize;
  if (gap < MIN_GAP) {
    gap = 0;
    cellSize = period;
  }

  const first = clusters[0].center;
  const last = clusters[clusters.length - 1].center;
  const count = Math.max(1, Math.round((last - first) / period) + 1);

  // Anchor the grid so the first column/row of sprites is centered in its cell,
  // then make sure no content is cut off on the leading edge.
  let offset = Math.round(first - cellSize / 2);
  offset = Math.min(offset, contentMin);
  offset = Math.max(0, offset);

  // The canvas only renders cells that fit entirely inside the image
  // (spriteStore.activeCells), so the whole grid must not overhang the edge:
  // pull the offset back first, shrink the cell only as a last resort.
  const span = () => count * cellSize + (count - 1) * gap;
  if (offset + span() > imageSize) {
    offset = Math.max(0, imageSize - span());
    if (offset + span() > imageSize) {
      cellSize = Math.max(
        1,
        Math.floor((imageSize - offset - (count - 1) * gap) / count)
      );
    }
  }

  return { period: cellSize + gap, cell: cellSize, offset, gap, count };
}
