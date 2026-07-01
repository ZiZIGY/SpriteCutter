// Binary mask morphology and connected-component labeling.
// A mask is a Uint8Array of width*height where 1 = content pixel.

// ── separable box dilation via prefix sums  O(W*H) ───────────────────────────

export function dilateMask(
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number
): Uint8Array {
  const temp = new Uint8Array(width * height);
  const result = new Uint8Array(width * height);
  const buf = new Int32Array(Math.max(width, height) + 1);

  for (let y = 0; y < height; y++) {
    const base = y * width;
    buf[0] = 0;
    for (let x = 0; x < width; x++) buf[x + 1] = buf[x] + mask[base + x];
    for (let x = 0; x < width; x++) {
      const lo = Math.max(0, x - radius);
      const hi = Math.min(width, x + radius + 1);
      if (buf[hi] - buf[lo] > 0) temp[base + x] = 1;
    }
  }
  for (let x = 0; x < width; x++) {
    buf[0] = 0;
    for (let y = 0; y < height; y++) buf[y + 1] = buf[y] + temp[y * width + x];
    for (let y = 0; y < height; y++) {
      const lo = Math.max(0, y - radius);
      const hi = Math.min(height, y + radius + 1);
      if (buf[hi] - buf[lo] > 0) result[y * width + x] = 1;
    }
  }
  return result;
}

// ── separable box erosion via prefix sums  O(W*H) ────────────────────────────
// A pixel survives only if the entire (2r+1) window around it is filled.
// Thin structures (drawn grid/border lines 1-4 px thick) are removed entirely,
// while solid sprite bodies only shrink by r px per side.

export function erodeMask(
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number
): Uint8Array {
  const temp = new Uint8Array(width * height);
  const result = new Uint8Array(width * height);
  const buf = new Int32Array(Math.max(width, height) + 1);

  for (let y = 0; y < height; y++) {
    const base = y * width;
    buf[0] = 0;
    for (let x = 0; x < width; x++) buf[x + 1] = buf[x] + mask[base + x];
    for (let x = 0; x < width; x++) {
      const lo = Math.max(0, x - radius);
      const hi = Math.min(width, x + radius + 1);
      if (buf[hi] - buf[lo] === hi - lo) temp[base + x] = 1;
    }
  }
  for (let x = 0; x < width; x++) {
    buf[0] = 0;
    for (let y = 0; y < height; y++) buf[y + 1] = buf[y] + temp[y * width + x];
    for (let y = 0; y < height; y++) {
      const lo = Math.max(0, y - radius);
      const hi = Math.min(height, y + radius + 1);
      if (buf[hi] - buf[lo] === hi - lo) result[y * width + x] = 1;
    }
  }
  return result;
}

// ── BFS connected components (8-connectivity) ─────────────────────────────────

export function findComponents(
  mask: Uint8Array,
  width: number,
  height: number
): { labels: Int32Array; numLabels: number } {
  const n = width * height;
  const labels = new Int32Array(n).fill(-1);
  let numLabels = 0;
  const dx8 = [-1, 0, 1, -1, 1, -1, 0, 1];
  const dy8 = [-1, -1, -1, 0, 0, 1, 1, 1];
  const queue: number[] = [];

  for (let start = 0; start < n; start++) {
    if (mask[start] === 0 || labels[start] >= 0) continue;
    labels[start] = numLabels;
    queue.push(start);
    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      const cy = (cur / width) | 0;
      const cx = cur - cy * width;
      for (let d = 0; d < 8; d++) {
        const nx = cx + dx8[d];
        const ny = cy + dy8[d];
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const ni = ny * width + nx;
        if (mask[ni] === 0 || labels[ni] >= 0) continue;
        labels[ni] = numLabels;
        queue.push(ni);
      }
    }
    queue.length = 0;
    numLabels++;
  }
  return { labels, numLabels };
}
