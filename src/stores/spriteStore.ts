import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

export interface CellOffset {
  x: number;
  y: number;
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

export const useSpriteStore = defineStore('sprite', () => {
  const imageFile = ref<File | null>(null);
  const imageSrc = ref<string>('');
  const imageWidth = ref(0);
  const imageHeight = ref(0);
  const isApplying = ref(false);

  const cellWidth = ref(64);
  const cellHeight = ref(64);
  const offsetX = ref(0);
  const offsetY = ref(0);
  const gapX = ref(0);
  const gapY = ref(0);

  const gridColor = ref('#FFFFFF');
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

  const activeCells = computed<SpriteCell[]>(() => {
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
          col, row, x, y,
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

  function toggleCell(col: number, row: number) {
    const key = `${col}_${row}`;
    if (selectedCells.value.has(key)) selectedCells.value.delete(key);
    else selectedCells.value.add(key);
  }

  function selectAll() {
    activeCells.value.forEach((cell) => selectedCells.value.add(`${cell.col}_${cell.row}`));
  }

  function deselectAll() {
    selectedCells.value.clear();
  }

  function getCellOffset(col: number, row: number): CellOffset {
    return cellOffsets.value[`${col}_${row}`] ?? { x: 0, y: 0 };
  }

  function setCellOffset(col: number, row: number, offset: CellOffset) {
    cellOffsets.value[`${col}_${row}`] = offset;
  }

  function resetCellOffsets() {
    cellOffsets.value = {};
  }

  function reset() {
    imageFile.value = null;
    imageSrc.value = '';
    imageWidth.value = 0;
    imageHeight.value = 0;
    selectedCells.value.clear();
    cellOffsets.value = {};
  }

  return {
    imageFile, imageSrc, imageWidth, imageHeight, isApplying,
    cellWidth, cellHeight, offsetX, offsetY, gapX, gapY,
    gridColor, showOffsets, cellOffsets,
    exportGap, exportFormat, selectedCells,
    activeCells,
    loadImage,
    toggleCell, selectAll, deselectAll,
    getCellOffset, setCellOffset, resetCellOffsets,
    reset,
  };
});
