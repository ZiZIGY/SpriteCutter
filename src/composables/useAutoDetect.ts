export interface AutoDetectResult {
  cellWidth: number
  cellHeight: number
  offsetX: number
  offsetY: number
  gapX: number
  gapY: number
  cols: number
  rows: number
  cellOffsets: Record<string, { x: number; y: number }>
}

// ── pixel loading ─────────────────────────────────────────────────────────────

async function loadPixels(
  imageSrc: string,
  width: number,
  height: number,
): Promise<Uint8ClampedArray> {
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('load failed'))
    img.src = imageSrc
  })
  if (typeof OffscreenCanvas !== 'undefined') {
    const oc = new OffscreenCanvas(width, height)
    const ctx = oc.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    return ctx.getImageData(0, 0, width, height).data
  }
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const ctx = c.getContext('2d')!
  ctx.drawImage(img, 0, 0)
  return ctx.getImageData(0, 0, width, height).data
}

// ── background sampling ───────────────────────────────────────────────────────

export async function sampleBgHex(imageSrc: string, w: number, h: number): Promise<string> {
  const pixels = await loadPixels(imageSrc, w, h)
  const px = [0, w - 1, 0, w - 1, (w / 2) | 0, (w / 2) | 0, 0, w - 1]
  const py = [0, 0, h - 1, h - 1, 0, h - 1, (h / 2) | 0, (h / 2) | 0]
  const rgb: [number, number, number][] = []
  let trans = 0
  for (let s = 0; s < px.length; s++) {
    const i = (py[s] * w + px[s]) * 4
    pixels[i + 3] < 16 ? trans++ : rgb.push([pixels[i], pixels[i + 1], pixels[i + 2]])
  }
  if (trans >= 5 || !rgb.length) return '#000000'
  const rs = rgb.map((c) => c[0]).sort((a, b) => a - b)
  const gs = rgb.map((c) => c[1]).sort((a, b) => a - b)
  const bs = rgb.map((c) => c[2]).sort((a, b) => a - b)
  const m = Math.floor(rgb.length / 2)
  return `#${rs[m].toString(16).padStart(2, '0')}${gs[m].toString(16).padStart(2, '0')}${bs[m].toString(16).padStart(2, '0')}`
}

// ── separable box dilation (O(W*H) via prefix sums) ──────────────────────────

function dilateMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const temp = new Uint8Array(width * height)
  const result = new Uint8Array(width * height)
  const buf = new Int32Array(Math.max(width, height) + 1)

  // horizontal pass
  for (let y = 0; y < height; y++) {
    const base = y * width
    buf[0] = 0
    for (let x = 0; x < width; x++) buf[x + 1] = buf[x] + mask[base + x]
    for (let x = 0; x < width; x++) {
      const lo = Math.max(0, x - radius)
      const hi = Math.min(width, x + radius + 1)
      if (buf[hi] - buf[lo] > 0) temp[base + x] = 1
    }
  }

  // vertical pass
  for (let x = 0; x < width; x++) {
    buf[0] = 0
    for (let y = 0; y < height; y++) buf[y + 1] = buf[y] + temp[y * width + x]
    for (let y = 0; y < height; y++) {
      const lo = Math.max(0, y - radius)
      const hi = Math.min(height, y + radius + 1)
      if (buf[hi] - buf[lo] > 0) result[y * width + x] = 1
    }
  }

  return result
}

// ── BFS connected components ──────────────────────────────────────────────────

function findComponents(
  mask: Uint8Array,
  width: number,
  height: number,
): { labels: Int32Array; numLabels: number } {
  const n = width * height
  const labels = new Int32Array(n).fill(-1)
  let numLabels = 0
  const dx8 = [-1, 0, 1, -1, 1, -1, 0, 1]
  const dy8 = [-1, -1, -1, 0, 0, 1, 1, 1]
  const queue: number[] = []

  for (let start = 0; start < n; start++) {
    if (mask[start] === 0 || labels[start] >= 0) continue
    labels[start] = numLabels
    queue.push(start)
    let head = 0
    while (head < queue.length) {
      const cur = queue[head++]
      const cy = (cur / width) | 0
      const cx = cur - cy * width
      for (let d = 0; d < 8; d++) {
        const nx = cx + dx8[d]
        const ny = cy + dy8[d]
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
        const ni = ny * width + nx
        if (mask[ni] === 0 || labels[ni] >= 0) continue
        labels[ni] = numLabels
        queue.push(ni)
      }
    }
    queue.length = 0
    numLabels++
  }

  return { labels, numLabels }
}

// ── bounding boxes (tight, from original mask using dilated-mask labels) ──────

interface BBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function getBoundingBoxes(
  origMask: Uint8Array,
  labels: Int32Array,
  width: number,
  height: number,
  numLabels: number,
): BBox[] {
  const bMinX = new Int32Array(numLabels).fill(width)
  const bMinY = new Int32Array(numLabels).fill(height)
  const bMaxX = new Int32Array(numLabels).fill(-1)
  const bMaxY = new Int32Array(numLabels).fill(-1)

  for (let i = 0, n = width * height; i < n; i++) {
    if (origMask[i] === 0) continue
    const lbl = labels[i]
    if (lbl < 0) continue
    const x = i % width
    const y = (i / width) | 0
    if (x < bMinX[lbl]) bMinX[lbl] = x
    if (x > bMaxX[lbl]) bMaxX[lbl] = x
    if (y < bMinY[lbl]) bMinY[lbl] = y
    if (y > bMaxY[lbl]) bMaxY[lbl] = y
  }

  const result: BBox[] = []
  for (let k = 0; k < numLabels; k++) {
    if (bMaxX[k] >= bMinX[k] && bMaxY[k] >= bMinY[k]) {
      result.push({ minX: bMinX[k], minY: bMinY[k], maxX: bMaxX[k], maxY: bMaxY[k] })
    }
  }
  return result
}

// ── helpers ───────────────────────────────────────────────────────────────────

function median(arr: number[]): number {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m]
}

function clusterPositions(positions: number[], threshold: number): number[][] {
  if (!positions.length) return []
  const sorted = [...positions].sort((a, b) => a - b)
  const clusters: number[][] = [[sorted[0]]]
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] > threshold) clusters.push([])
    clusters[clusters.length - 1].push(sorted[i])
  }
  return clusters
}

// ── main export ───────────────────────────────────────────────────────────────

const GAP_RADIUS = 5   // pixels of dilation to bridge sprite-internal holes
const MIN_BBOX = 8     // smallest dimension considered a real sprite

export async function autoDetect(
  imageSrc: string,
  imageWidth: number,
  imageHeight: number,
  bgHex: string,
  tolerance: number,
): Promise<AutoDetectResult | null> {
  const pixels = await loadPixels(imageSrc, imageWidth, imageHeight)

  const bgR = parseInt(bgHex.slice(1, 3), 16)
  const bgG = parseInt(bgHex.slice(3, 5), 16)
  const bgB = parseInt(bgHex.slice(5, 7), 16)
  const tolSq = tolerance * tolerance

  // 1. Binary mask: 1 = sprite, 0 = background
  const origMask = new Uint8Array(imageWidth * imageHeight)
  for (let i = 0, n = imageWidth * imageHeight; i < n; i++) {
    const pi = i * 4
    if (pixels[pi + 3] < 16) continue          // transparent → background
    const dr = pixels[pi] - bgR
    const dg = pixels[pi + 1] - bgG
    const db = pixels[pi + 2] - bgB
    if (dr * dr + dg * dg + db * db > tolSq) origMask[i] = 1
  }

  // 2. Dilate to fill internal holes (small gaps within a sprite)
  const dilMask = dilateMask(origMask, imageWidth, imageHeight, GAP_RADIUS)

  // 3. Connected components on dilated mask
  const { labels, numLabels } = findComponents(dilMask, imageWidth, imageHeight)

  // 4. Tight bounding boxes measured on original mask
  const allBoxes = getBoundingBoxes(origMask, labels, imageWidth, imageHeight, numLabels)
  const boxes = allBoxes.filter(
    (b) => b.maxX - b.minX + 1 >= MIN_BBOX && b.maxY - b.minY + 1 >= MIN_BBOX,
  )
  if (!boxes.length) return null

  // 5. Cell dimensions = max bbox extent across all sprites
  let cellWidth = 0
  let cellHeight = 0
  for (const b of boxes) {
    cellWidth = Math.max(cellWidth, b.maxX - b.minX + 1)
    cellHeight = Math.max(cellHeight, b.maxY - b.minY + 1)
  }

  // 6. Cluster bbox centers → cols / rows
  const cxs = boxes.map((b) => (b.minX + b.maxX) / 2)
  const cys = boxes.map((b) => (b.minY + b.maxY) / 2)

  // threshold: 40% of cell size — within-column scatter is much less than inter-column gap
  const colClusters = clusterPositions(cxs, cellWidth * 0.4)
  const rowClusters = clusterPositions(cys, cellHeight * 0.4)
  if (!colClusters.length || !rowClusters.length) return null

  const colCenters = colClusters.map((c) => median(c)).sort((a, b) => a - b)
  const rowCenters = rowClusters.map((c) => median(c)).sort((a, b) => a - b)
  const cols = colCenters.length
  const rows = rowCenters.length

  // 7. Grid parameters from cluster centers
  const offsetX = Math.max(0, Math.round(colCenters[0] - cellWidth / 2))
  const offsetY = Math.max(0, Math.round(rowCenters[0] - cellHeight / 2))

  let gapX = 0
  if (colCenters.length > 1) {
    const gaps = colCenters.slice(1).map((c, i) => c - colCenters[i] - cellWidth)
    gapX = Math.max(0, Math.round(median(gaps)))
  }
  let gapY = 0
  if (rowCenters.length > 1) {
    const gaps = rowCenters.slice(1).map((c, i) => c - rowCenters[i] - cellHeight)
    gapY = Math.max(0, Math.round(median(gaps)))
  }

  // 8. Per-cell centroid offsets: center each sprite within its detected cell
  const cellOffsets: Record<string, { x: number; y: number }> = {}
  for (const b of boxes) {
    const cx = (b.minX + b.maxX) / 2
    const cy = (b.minY + b.maxY) / 2

    // Nearest column / row
    let col = 0
    let minDX = Infinity
    for (let i = 0; i < colCenters.length; i++) {
      const d = Math.abs(colCenters[i] - cx)
      if (d < minDX) { minDX = d; col = i }
    }
    let row = 0
    let minDY = Infinity
    for (let i = 0; i < rowCenters.length; i++) {
      const d = Math.abs(rowCenters[i] - cy)
      if (d < minDY) { minDY = d; row = i }
    }

    // Expected cell center based on derived grid
    const ccx = offsetX + col * (cellWidth + gapX) + cellWidth / 2
    const ccy = offsetY + row * (cellHeight + gapY) + cellHeight / 2

    const dx = Math.round(cx - ccx)
    const dy = Math.round(cy - ccy)
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      cellOffsets[`${col}_${row}`] = { x: dx, y: dy }
    }
  }

  return {
    cellWidth: Math.max(1, cellWidth),
    cellHeight: Math.max(1, cellHeight),
    offsetX,
    offsetY,
    gapX,
    gapY,
    cols,
    rows,
    cellOffsets,
  }
}
