import {
  canvasToBlob,
  downloadBlob,
  downloadCanvas,
  downloadJSON,
} from '@/utils/download';
import { computed, ref } from 'vue';

import JSZip from 'jszip';
import type { SpriteCell } from '@/stores/spriteStore';
import { useSpriteStore } from '@/stores/spriteStore';

interface PackedCell {
  cell: SpriteCell;
  outCol: number;
  outRow: number;
}

export function useExport() {
  const store = useSpriteStore();
  const loading = ref<'single' | 'sheet' | 'full' | 'json' | 'jsonAll' | null>(
    null
  );
  const exportAll = ref(false);

  const availableCount = computed(
    () => store.activeCells.filter((c) => !c.excluded).length
  );

  function packCells(cells: SpriteCell[]): PackedCell[] {
    const cols = Math.max(
      1,
      Math.max(...store.activeCells.map((c) => c.col)) + 1
    );
    return cells
      .slice()
      .sort((a, b) => a.row - b.row || a.col - b.col)
      .map((cell, i) => ({
        cell,
        outCol: i % cols,
        outRow: Math.floor(i / cols),
      }));
  }

  function sanitizeName(name: string): string {
    return name.replace(/[\\/:*?"<>|]+/g, '_').trim();
  }

  function resolveNames(packed: PackedCell[]): Map<PackedCell, string> {
    const used = new Set<string>();
    const names = new Map<PackedCell, string>();
    for (const p of packed) {
      const base = p.cell.name
        ? sanitizeName(p.cell.name)
        : `sprite_${String(p.outRow).padStart(2, '0')}_${String(p.outCol).padStart(2, '0')}`;
      let name = base;
      let suffix = 2;
      while (used.has(name)) name = `${base}_${suffix++}`;
      used.add(name);
      names.set(p, name);
    }
    return names;
  }

  const cellsToExport = computed<PackedCell[]>(() => {
    const cells = exportAll.value
      ? store.activeCells.filter((c) => !c.excluded)
      : store.activeCells.filter((cell) => store.selectedCells.has(`${cell.col}_${cell.row}`))
    return packCells(cells)
  });

  const exportCount = computed(() => cellsToExport.value.length);

  async function loadImg(): Promise<HTMLImageElement> {
    const img = new Image();
    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.src = store.imageSrc;
    });
    return img;
  }

  function buildAtlas(packed: PackedCell[]) {
    const imageName = store.imageFile?.name ?? 'spritesheet.png';
    const gap = store.exportGap;
    const maxOutCol = Math.max(...packed.map((p) => p.outCol));
    const maxOutRow = Math.max(...packed.map((p) => p.outRow));
    const cellW = Math.max(...packed.map((p) => p.cell.width));
    const cellH = Math.max(...packed.map((p) => p.cell.height));

    const names = resolveNames(packed);
    const frames: Record<string, object> = {};
    for (const p of packed) {
      const { cell, outCol, outRow } = p;
      const offset = store.getCellOffset(cell.col, cell.row);
      const key = names.get(p)!;
      frames[key] = {
        frame: {
          x: outCol * (cellW + gap),
          y: outRow * (cellH + gap),
          w: cell.width,
          h: cell.height,
        },
        sourceFrame: {
          x: cell.x + offset.x,
          y: cell.y + offset.y,
          w: cell.width,
          h: cell.height,
        },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: cell.width, h: cell.height },
        sourceSize: { w: cell.width, h: cell.height },
        pivot: { x: -offset.x / cell.width, y: -offset.y / cell.height },
        col: outCol,
        row: outRow,
      };
    }

    return {
      frames,
      meta: {
        app: 'SpriteCutter',
        image: imageName,
        sourceImage: { w: store.imageWidth, h: store.imageHeight },
        size: {
          w: (maxOutCol + 1) * cellW + maxOutCol * gap,
          h: (maxOutRow + 1) * cellH + maxOutRow * gap,
        },
        scale: 1,
        format: store.exportFormat.toUpperCase(),
        grid: { cellWidth: cellW, cellHeight: cellH, gap },
      },
    };
  }

  async function exportSingle() {
    loading.value = 'single';
    const packed = cellsToExport.value;
    if (!packed.length) {
      loading.value = null;
      return;
    }

    const img = await loadImg();
    const names = resolveNames(packed);
    const zip = new JSZip();
    for (const p of packed) {
      const { cell } = p;
      const offset = store.getCellOffset(cell.col, cell.row);
      const canvas = document.createElement('canvas');
      canvas.width = cell.width;
      canvas.height = cell.height;
      canvas
        .getContext('2d')!
        .drawImage(
          img,
          cell.x + offset.x,
          cell.y + offset.y,
          cell.width,
          cell.height,
          0,
          0,
          cell.width,
          cell.height
        );
      const blob = await canvasToBlob(canvas, store.exportFormat);
      zip.file(`${names.get(p)}.${store.exportFormat}`, blob);
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const baseName = (store.imageFile?.name ?? 'spritesheet').replace(
      /\.[^.]+$/,
      ''
    );
    downloadBlob(zipBlob, `${baseName}_sprites.zip`);
    loading.value = null;
  }

  async function exportSheet() {
    loading.value = 'sheet';
    const packed = cellsToExport.value;
    if (!packed.length) {
      loading.value = null;
      return;
    }

    const gap = store.exportGap;
    const img = await loadImg();
    const maxOutCol = Math.max(...packed.map((p) => p.outCol));
    const maxOutRow = Math.max(...packed.map((p) => p.outRow));
    const cellWidth = Math.max(...packed.map((p) => p.cell.width));
    const cellHeight = Math.max(...packed.map((p) => p.cell.height));

    const canvas = document.createElement('canvas');
    canvas.width = (maxOutCol + 1) * cellWidth + maxOutCol * gap;
    canvas.height = (maxOutRow + 1) * cellHeight + maxOutRow * gap;

    const ctx = canvas.getContext('2d')!;
    for (const { cell, outCol, outRow } of packed) {
      const offset = store.getCellOffset(cell.col, cell.row);
      ctx.drawImage(
        img,
        cell.x + offset.x,
        cell.y + offset.y,
        cell.width,
        cell.height,
        outCol * (cellWidth + gap),
        outRow * (cellHeight + gap),
        cell.width,
        cell.height
      );
    }
    downloadCanvas(canvas, 'spritesheet', store.exportFormat);
    loading.value = null;
  }

  async function exportFullSheet() {
    loading.value = 'full';
    const packed = packCells(store.activeCells.filter((c) => !c.excluded));
    if (!packed.length) {
      loading.value = null;
      return;
    }

    const gap = store.exportGap;
    const img = await loadImg();
    const maxOutCol = Math.max(...packed.map((p) => p.outCol));
    const maxOutRow = Math.max(...packed.map((p) => p.outRow));
    const cellWidth = Math.max(...packed.map((p) => p.cell.width));
    const cellHeight = Math.max(...packed.map((p) => p.cell.height));

    const canvas = document.createElement('canvas');
    canvas.width = (maxOutCol + 1) * cellWidth + maxOutCol * gap;
    canvas.height = (maxOutRow + 1) * cellHeight + maxOutRow * gap;

    const ctx = canvas.getContext('2d')!;
    for (const { cell, outCol, outRow } of packed) {
      const offset = store.getCellOffset(cell.col, cell.row);
      ctx.drawImage(
        img,
        cell.x + offset.x,
        cell.y + offset.y,
        cell.width,
        cell.height,
        outCol * (cellWidth + gap),
        outRow * (cellHeight + gap),
        cell.width,
        cell.height
      );
    }
    downloadCanvas(canvas, 'spritesheet_full', store.exportFormat);
    loading.value = null;
  }

  function exportJSON() {
    loading.value = 'json';
    const packed = cellsToExport.value;
    if (!packed.length) {
      loading.value = null;
      return;
    }
    const baseName = (store.imageFile?.name ?? 'spritesheet').replace(
      /\.[^.]+$/,
      ''
    );
    downloadJSON(buildAtlas(packed), `${baseName}_atlas`);
    loading.value = null;
  }

  function exportJSONAll() {
    loading.value = 'jsonAll';
    const packed = packCells(store.activeCells.filter((c) => !c.excluded));
    if (!packed.length) {
      loading.value = null;
      return;
    }
    const baseName = (store.imageFile?.name ?? 'spritesheet').replace(
      /\.[^.]+$/,
      ''
    );
    downloadJSON(buildAtlas(packed), `${baseName}_atlas_full`);
    loading.value = null;
  }

  return {
    loading,
    exportAll,
    exportCount,
    availableCount,
    exportSingle,
    exportSheet,
    exportFullSheet,
    exportJSON,
    exportJSONAll,
  };
}
