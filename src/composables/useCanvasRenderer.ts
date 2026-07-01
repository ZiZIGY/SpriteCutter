import { watch, nextTick, type Ref } from 'vue';
import { useResizeObserver, useRafFn } from '@vueuse/core';
import { hexToRgba } from '@/utils/color';
import type {
  SpriteCell,
  CellOffset,
  CanvasMode,
} from '@/stores/spriteStore';

interface RendererStore {
  imageSrc: string;
  gridColor: string;
  mode: CanvasMode;
  showNames: boolean;
  focusedCell: string | null;
  activeCells: SpriteCell[];
  getCellOffset(col: number, row: number): CellOffset;
}

export function useCanvasRenderer(
  viewportRef: Ref<HTMLDivElement | null>,
  canvasRef: Ref<HTMLCanvasElement | null>,
  zoom: Ref<number>,
  panX: Ref<number>,
  panY: Ref<number>,
  draggingDot: Ref<{ col: number; row: number } | null>,
  store: RendererStore,
  onImageLoaded: () => void
) {
  let imgEl: HTMLImageElement | null = null;

  watch(
    () => store.imageSrc,
    (src) => {
      imgEl = null;
      if (!src) return;
      const img = new Image();
      img.onload = () => {
        imgEl = img;
        nextTick(onImageLoaded);
      };
      img.src = src;
    },
    { immediate: true }
  );

  function resizeCanvas() {
    const viewport = viewportRef.value;
    const canvas = canvasRef.value;
    if (!viewport || !canvas) return;
    canvas.width = viewport.clientWidth;
    canvas.height = viewport.clientHeight;
  }
  useResizeObserver(viewportRef, resizeCanvas);

  function render() {
    const canvas = canvasRef.value;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!imgEl?.complete || !store.imageSrc) return;

    ctx.save();
    ctx.translate(panX.value, panY.value);
    ctx.scale(zoom.value, zoom.value);
    ctx.imageSmoothingEnabled = zoom.value < 1;
    ctx.drawImage(imgEl, 0, 0);

    const lw = 1 / zoom.value;
    const colorBase = hexToRgba(store.gridColor, 0.65);
    const colorSelected = hexToRgba(store.gridColor, 0.95);

    for (const cell of store.activeCells) {
      if (cell.excluded) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(cell.x, cell.y, cell.width, cell.height);

        ctx.save();
        ctx.beginPath();
        ctx.rect(cell.x, cell.y, cell.width, cell.height);
        ctx.clip();
        ctx.strokeStyle = 'rgba(255, 82, 82, 0.45)';
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(cell.x, cell.y + cell.height);
        ctx.lineTo(cell.x + cell.width, cell.y);
        ctx.moveTo(cell.x, cell.y);
        ctx.lineTo(cell.x + cell.width, cell.y + cell.height);
        ctx.stroke();
        ctx.restore();

        ctx.strokeStyle = 'rgba(255, 82, 82, 0.7)';
        ctx.lineWidth = lw;
        ctx.strokeRect(
          cell.x + lw / 2,
          cell.y + lw / 2,
          cell.width - lw,
          cell.height - lw
        );
        continue;
      }

      if (cell.selected) {
        ctx.fillStyle = hexToRgba(store.gridColor, 0.28);
        ctx.fillRect(cell.x, cell.y, cell.width, cell.height);
        ctx.strokeStyle = colorSelected;
      } else {
        ctx.strokeStyle = colorBase;
      }
      ctx.lineWidth = lw;
      ctx.strokeRect(
        cell.x + lw / 2,
        cell.y + lw / 2,
        cell.width - lw,
        cell.height - lw
      );
    }

    // names layer
    if (store.showNames) {
      const fontSize =
        Math.max(9, Math.min(13, cell_minDim(store.activeCells) * 0.18)) /
        zoom.value;
      ctx.font = `${fontSize}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';

      for (const cell of store.activeCells) {
        if (cell.excluded) continue;
        const label = cell.name || `${cell.col},${cell.row}`;

        ctx.save();
        ctx.beginPath();
        ctx.rect(cell.x, cell.y, cell.width, cell.height);
        ctx.clip();

        const pad = 3 / zoom.value;
        const tw = ctx.measureText(label).width;
        const th = fontSize;
        const bx = cell.x + pad;
        const by = cell.y + cell.height - pad - th;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(bx - pad * 0.5, by - pad * 0.5, tw + pad, th + pad * 0.5);

        ctx.fillStyle = cell.name
          ? 'rgba(255, 255, 255, 0.92)'
          : 'rgba(255, 255, 255, 0.42)';
        ctx.fillText(label, bx, by + th);

        ctx.restore();
      }
    }

    // focused cell animated ring
    if (store.focusedCell) {
      const [fc, fr] = store.focusedCell.split('_').map(Number);
      const cell = store.activeCells.find((c) => c.col === fc && c.row === fr);
      if (cell) {
        const t = performance.now() / 700;
        const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
        const ringAlpha = 0.7 + 0.3 * pulse;
        const ringWidth = (2 + pulse * 1.5) / zoom.value;

        ctx.fillStyle = `rgba(96, 196, 255, ${0.06 + 0.08 * pulse})`;
        ctx.fillRect(cell.x, cell.y, cell.width, cell.height);

        ctx.strokeStyle = `rgba(96, 196, 255, ${ringAlpha})`;
        ctx.lineWidth = ringWidth;
        ctx.strokeRect(
          cell.x + ringWidth / 2,
          cell.y + ringWidth / 2,
          cell.width - ringWidth,
          cell.height - ringWidth
        );
      }
    }

    if (store.mode === 'offset') {
      for (const cell of store.activeCells) {
        if (cell.excluded) continue;
        const offset = store.getCellOffset(cell.col, cell.row);
        const boxX = cell.x + offset.x;
        const boxY = cell.y + offset.y;
        const isDragging =
          draggingDot.value?.col === cell.col &&
          draggingDot.value?.row === cell.row;

        ctx.fillStyle = hexToRgba(store.gridColor, isDragging ? 0.35 : 0.15);
        ctx.fillRect(boxX, boxY, cell.width, cell.height);
        ctx.strokeStyle = hexToRgba(store.gridColor, isDragging ? 1 : 0.75);
        ctx.lineWidth = 2 / zoom.value;
        ctx.setLineDash([5 / zoom.value, 3 / zoom.value]);
        ctx.strokeRect(
          boxX + 1 / zoom.value,
          boxY + 1 / zoom.value,
          cell.width - 2 / zoom.value,
          cell.height - 2 / zoom.value
        );
        ctx.setLineDash([]);

        const cx = boxX + cell.width / 2;
        const cy = boxY + cell.height / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 3 / zoom.value, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(store.gridColor, 0.9);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  function cell_minDim(cells: SpriteCell[]): number {
    if (!cells.length) return 64;
    return Math.min(cells[0].width, cells[0].height);
  }

  useRafFn(render);
}
