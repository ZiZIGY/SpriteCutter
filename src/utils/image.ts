// ── pixel loading ─────────────────────────────────────────────────────────────

export async function loadPixels(
  imageSrc: string,
  width: number,
  height: number
): Promise<Uint8ClampedArray> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('load failed'));
    img.src = imageSrc;
  });
  if (typeof OffscreenCanvas !== 'undefined') {
    const oc = new OffscreenCanvas(width, height);
    const ctx = oc.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, width, height).data;
  }
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, width, height).data;
}

// ── background color sampling ─────────────────────────────────────────────────
// Samples corners / edge midpoints and returns the median color as hex.
// Mostly-transparent edges mean a transparent background → '#000000'.

export async function sampleBgHex(
  imageSrc: string,
  w: number,
  h: number
): Promise<string> {
  const pixels = await loadPixels(imageSrc, w, h);
  const px = [0, w - 1, 0, w - 1, (w / 2) | 0, (w / 2) | 0, 0, w - 1];
  const py = [0, 0, h - 1, h - 1, 0, h - 1, (h / 2) | 0, (h / 2) | 0];
  const rgb: [number, number, number][] = [];
  let trans = 0;
  for (let s = 0; s < px.length; s++) {
    const i = (py[s] * w + px[s]) * 4;
    pixels[i + 3] < 16
      ? trans++
      : rgb.push([pixels[i], pixels[i + 1], pixels[i + 2]]);
  }
  if (trans >= 5 || !rgb.length) return '#000000';
  const rs = rgb.map((c) => c[0]).sort((a, b) => a - b);
  const gs = rgb.map((c) => c[1]).sort((a, b) => a - b);
  const bs = rgb.map((c) => c[2]).sort((a, b) => a - b);
  const m = Math.floor(rgb.length / 2);
  return `#${rs[m].toString(16).padStart(2, '0')}${gs[m].toString(16).padStart(2, '0')}${bs[m].toString(16).padStart(2, '0')}`;
}
