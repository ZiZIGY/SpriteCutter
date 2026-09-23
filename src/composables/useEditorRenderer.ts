import { nextTick, watch, type Ref } from 'vue';
import { useRafFn } from '@vueuse/core';
import { useSpriteStore } from '@/stores/spriteStore';
import type { Analysis } from '@/utils/detect/analyze';
import { handlePoints, normRect, type Gesture } from './useEditorPointer';

const BASE = '#4FC3F7';
const HOVER = '#B3E5FC';
const SELECTED = '#FFB300';
const SKIPPED = '#9E9E9E';
const HALO = 'rgba(0, 0, 0, 0.55)';

export function useEditorRenderer(
  viewportRef: Ref<HTMLDivElement | null>,
  canvasRef: Ref<HTMLCanvasElement | null>,
  zoom: Ref<number>,
  panX: Ref<number>,
  panY: Ref<number>,
  gesture: Ref<Gesture | null>,
  onImageReady: () => void
) {
  const store = useSpriteStore();
  let img: HTMLImageElement | null = null;
  let checker: CanvasPattern | null = null;
  let mask: { version: number; canvas: HTMLCanvasElement } | null = null;

  watch(
    () => store.imageSrc,
    (src) => {
      img = null;
      if (!src) return;
      const el = new Image();
      el.onload = () => {
        img = el;
        nextTick(onImageReady);
      };
      el.src = src;
    },
    { immediate: true }
  );

  /** Background pixels tinted, for tuning the tolerance by eye. */
  function maskCanvas(an: Analysis): HTMLCanvasElement {
    if (mask?.version === an.version) return mask.canvas;
    const canvas = document.createElement('canvas');
    canvas.width = an.width;
    canvas.height = an.height;
    const data = new ImageData(an.width, an.height);
    for (let i = 0, n = an.width * an.height; i < n; i++) {
      if (an.content[i]) continue;
      data.data[i * 4] = 255;
      data.data[i * 4 + 1] = 0;
      data.data[i * 4 + 2] = 170;
      data.data[i * 4 + 3] = 120;
    }
    canvas.getContext('2d')!.putImageData(data, 0, 0);
    mask = { version: an.version, canvas };
    return canvas;
  }

  function checkerPattern(ctx: CanvasRenderingContext2D) {
    if (checker) return checker;
    const tile = document.createElement('canvas');
    tile.width = tile.height = 16;
    const t = tile.getContext('2d')!;
    t.fillStyle = '#9aa0a6';
    t.fillRect(0, 0, 16, 16);
    t.fillStyle = '#c4c8cc';
    t.fillRect(0, 0, 8, 8);
    t.fillRect(8, 8, 8, 8);
    checker = ctx.createPattern(tile, 'repeat');
    return checker;
  }

  function render() {
    const canvas = canvasRef.value;
    const viewport = viewportRef.value;
    if (!canvas || !viewport) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.round(viewport.clientWidth * dpr);
    const ch = Math.round(viewport.clientHeight * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    if (!img || !store.imageSrc) return;

    const z = zoom.value;
    const k = 1 / z;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Checkerboard in screen space so transparency reads at any zoom.
    ctx.fillStyle = checkerPattern(ctx)!;
    ctx.fillRect(panX.value, panY.value, img.naturalWidth * z, img.naturalHeight * z);

    ctx.translate(panX.value, panY.value);
    ctx.scale(z, z);
    ctx.imageSmoothingEnabled = z < 1;
    ctx.drawImage(img, 0, 0);
    if (store.showMask && store.analysis) ctx.drawImage(maskCanvas(store.analysis), 0, 0);

    const font = `600 ${11 * k}px system-ui, sans-serif`;
    ctx.font = font;
    ctx.textBaseline = 'middle';

    store.sprites.forEach((s, i) => {
      const sel = store.selected.has(s.id);
      const hov = store.hovered === s.id;
      const color = sel ? SELECTED : hov ? HOVER : s.skip ? SKIPPED : BASE;
      // Skipped sprites stay visible but read as "not going out".
      ctx.setLineDash(s.skip ? [6 * k, 4 * k] : []);

      if (sel) {
        ctx.fillStyle = 'rgba(255, 179, 0, 0.12)';
        ctx.fillRect(s.x, s.y, s.w, s.h);
      }
      // Dark halo under a light line: boxes stay visible on white and black.
      ctx.lineWidth = 3 * k;
      ctx.strokeStyle = HALO;
      ctx.strokeRect(s.x, s.y, s.w, s.h);
      ctx.lineWidth = (sel ? 2 : 1.25) * k;
      ctx.strokeStyle = color;
      ctx.strokeRect(s.x, s.y, s.w, s.h);

      // Order badge sits on the top-left corner, above the box when there is room.
      const label = String(i + 1);
      const bh = 16 * k;
      const bw = ctx.measureText(label).width + 8 * k;
      const by = s.y - bh >= 0 ? s.y - bh : s.y;
      ctx.fillStyle = sel ? SELECTED : 'rgba(16, 20, 32, 0.88)';
      ctx.fillRect(s.x, by, bw, bh);
      ctx.fillStyle = sel ? '#1a1300' : '#fff';
      ctx.fillText(label, s.x + 4 * k, by + bh / 2 + 0.5 * k);

      if (store.showNames && s.name) {
        const nw = ctx.measureText(s.name).width + 8 * k;
        const ny = s.y + s.h;
        ctx.fillStyle = 'rgba(16, 20, 32, 0.88)';
        ctx.fillRect(s.x, ny, nw, bh);
        ctx.fillStyle = sel ? SELECTED : '#fff';
        ctx.fillText(s.name, s.x + 4 * k, ny + bh / 2 + 0.5 * k);
      }
    });
    ctx.setLineDash([]);

    // Resize handles for a single selected box.
    if (store.selected.size === 1 && store.tool === 'select') {
      const [id] = store.selected;
      const s = store.sprites.find((sp) => sp.id === id);
      if (s) {
        const hs = 7 * k;
        ctx.lineWidth = 1 * k;
        for (const [, hx, hy] of handlePoints(s)) {
          ctx.fillStyle = '#fff';
          ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
          ctx.strokeStyle = '#1a1300';
          ctx.strokeRect(hx - hs / 2, hy - hs / 2, hs, hs);
        }
      }
    }

    const g = gesture.value;
    if (g && (g.kind === 'marquee' || g.kind === 'draw')) {
      const r = normRect(g);
      const accent = g.kind === 'draw' ? SELECTED : BASE;
      ctx.fillStyle = g.kind === 'draw' ? 'rgba(255, 179, 0, 0.1)' : 'rgba(79, 195, 247, 0.1)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.setLineDash([5 * k, 4 * k]);
      ctx.lineWidth = 1.5 * k;
      ctx.strokeStyle = accent;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.setLineDash([]);
    }
  }

  useRafFn(render);
}
