import { computed, ref } from 'vue';

import { defineStore } from 'pinia';

export interface GridLine {
  id: string;
  position: number;
  axis: 'x' | 'y';
}

export interface SpriteCell {
  col: number;
  row: number;
  x: number;
  y: number;
  width: number;
  height: number;
  selected: boolean;
}

export interface CellOffset {
  x: number;
  y: number;
}

export const useSpriteStore = defineStore('sprite', () => {
  const imageFile = ref<File | null>(null);
  const imageSrc = ref<string>('');
  const imageWidth = ref(0);
  const imageHeight = ref(0);
  const isApplying = ref(false);

  const gridMode = ref<'uniform' | 'free'>('uniform');
  const cellWidth = ref(64);
  const cellHeight = ref(64);
  const offsetX = ref(0);
  const offsetY = ref(0);
  const gapX = ref(0);
  const gapY = ref(0);

  const freeLines = ref<GridLine[]>([]);

  const gridColor = ref('#7C3AED');
  const gridOpacity = ref(0.65);

  const showOffsets = ref(false);
  const cellOffsets = ref<Record<string, CellOffset>>({});

  const exportGap = ref(2);
  const exportFormat = ref<'png' | 'webp'>('png');

  const selectedCells = ref<Set<string>>(new Set());

  function loadImage(file: File) {
    imageFile.value = file;
    const url = URL.createObjectURL(file);
    imageSrc.value = url;
    const img = new Image();
    img.onload = () => {
      imageWidth.value = img.naturalWidth;
      imageHeight.value = img.naturalHeight;
      autoDetectGrid();
    };
    img.src = url;
  }

  function autoDetectGrid() {
    const cols = Math.floor(imageWidth.value / cellWidth.value);
    const rows = Math.floor(imageHeight.value / cellHeight.value);
    if (cols > 0 && rows > 0) {
      cellWidth.value = Math.floor(imageWidth.value / cols);
      cellHeight.value = Math.floor(imageHeight.value / rows);
    }
  }

  const uniformCells = computed<SpriteCell[]>(() => {
    if (!imageSrc.value) return [];
    const cells: SpriteCell[] = [];
    let row = 0;
    let y = offsetY.value;
    while (y + cellHeight.value <= imageHeight.value) {
      let col = 0;
      let x = offsetX.value;
      while (x + cellWidth.value <= imageWidth.value) {
        const key = `${col}_${row}`;
        cells.push({
          col,
          row,
          x,
          y,
          width: cellWidth.value,
          height: cellHeight.value,
          selected: selectedCells.value.has(key),
        });
        x += cellWidth.value + gapX.value;
        col++;
      }
      y += cellHeight.value + gapY.value;
      row++;
    }
    return cells;
  });

  const freeCells = computed<SpriteCell[]>(() => {
    if (!imageSrc.value) return [];
    const xs = [
      0,
      ...freeLines.value
        .filter((l) => l.axis === 'x')
        .map((l) => l.position)
        .sort((a, b) => a - b),
      imageWidth.value,
    ];
    const ys = [
      0,
      ...freeLines.value
        .filter((l) => l.axis === 'y')
        .map((l) => l.position)
        .sort((a, b) => a - b),
      imageHeight.value,
    ];
    const cells: SpriteCell[] = [];
    for (let row = 0; row < ys.length - 1; row++) {
      for (let col = 0; col < xs.length - 1; col++) {
        const key = `${col}_${row}`;
        cells.push({
          col,
          row,
          x: xs[col],
          y: ys[row],
          width: xs[col + 1] - xs[col],
          height: ys[row + 1] - ys[row],
          selected: selectedCells.value.has(key),
        });
      }
    }
    return cells;
  });

  const activeCells = computed(() =>
    gridMode.value === 'uniform' ? uniformCells.value : freeCells.value
  );

  function getCellOffset(col: number, row: number): CellOffset {
    return cellOffsets.value[`${col}_${row}`] ?? { x: 0, y: 0 };
  }

  function setCellOffset(col: number, row: number, x: number, y: number) {
    cellOffsets.value[`${col}_${row}`] = { x: Math.round(x), y: Math.round(y) };
  }

  function resetCellOffsets() {
    cellOffsets.value = {};
  }

  function toggleCell(col: number, row: number) {
    const key = `${col}_${row}`;
    if (selectedCells.value.has(key)) selectedCells.value.delete(key);
    else selectedCells.value.add(key);
  }

  function selectAll() {
    activeCells.value.forEach((cell) =>
      selectedCells.value.add(`${cell.col}_${cell.row}`)
    );
  }

  function deselectAll() {
    selectedCells.value.clear();
  }

  function initFreeGridFromUniform() {
    freeLines.value = [];
    let id = 0;
    let x = offsetX.value + cellWidth.value;
    while (x < imageWidth.value) {
      freeLines.value.push({ id: String(id++), position: x, axis: 'x' });
      x += cellWidth.value + gapX.value;
    }
    let y = offsetY.value + cellHeight.value;
    while (y < imageHeight.value) {
      freeLines.value.push({ id: String(id++), position: y, axis: 'y' });
      y += cellHeight.value + gapY.value;
    }
  }

  function updateFreeLine(id: string, position: number) {
    const line = freeLines.value.find((l) => l.id === id);
    if (line) line.position = Math.max(0, position);
  }

  function addFreeLine(axis: 'x' | 'y', position: number) {
    freeLines.value.push({ id: String(Date.now()), position, axis });
  }

  function removeFreeLine(id: string) {
    freeLines.value = freeLines.value.filter((l) => l.id !== id);
  }

  function reset() {
    imageFile.value = null;
    imageSrc.value = '';
    imageWidth.value = 0;
    imageHeight.value = 0;
    selectedCells.value.clear();
    freeLines.value = [];
    cellOffsets.value = {};
    gridMode.value = 'uniform';
    showOffsets.value = false;
  }

  return {
    imageFile,
    imageSrc,
    imageWidth,
    imageHeight,
    isApplying,
    gridMode,
    cellWidth,
    cellHeight,
    offsetX,
    offsetY,
    gapX,
    gapY,
    freeLines,
    gridColor,
    gridOpacity,
    showOffsets,
    cellOffsets,
    exportGap,
    exportFormat,
    selectedCells,
    uniformCells,
    freeCells,
    activeCells,
    loadImage,
    getCellOffset,
    setCellOffset,
    resetCellOffsets,
    toggleCell,
    selectAll,
    deselectAll,
    initFreeGridFromUniform,
    updateFreeLine,
    addFreeLine,
    removeFreeLine,
    reset,
  };
});
