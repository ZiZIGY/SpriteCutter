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
  excluded: boolean;
  name: string;
}

export interface SpriteAnimation {
  id: number;
  name: string;
  frames: string[]; // cell keys "col_row" in playback order
  fps: number;
}

// What clicking / dragging on the canvas does
export type CanvasMode = 'select' | 'offset' | 'exclude';

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
  const mode = ref<CanvasMode>('select');
  const cellOffsets = ref<Record<string, CellOffset>>({});

  const excludedCells = ref<Set<string>>(new Set());

  const cellNames = ref<Record<string, string>>({});
  const showNames = ref(false);
  const focusedCell = ref<string | null>(null);

  const exportGap = ref(2);
  const exportFormat = ref<'png' | 'webp'>('png');

  const selectedCells = ref<Set<string>>(new Set());

  const animations = ref<SpriteAnimation[]>([]);
  let animIdSeq = 1;

  function loadImage(file: File) {
    imageFile.value = file;
    const url = URL.createObjectURL(file);
    // Reset dimensions first: watchers keyed on [src, width, height] must not
    // fire with the new src but stale sizes from the previous image.
    imageWidth.value = 0;
    imageHeight.value = 0;
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
          col,
          row,
          x,
          y,
          width: cellWidth.value,
          height: cellHeight.value,
          selected: selectedCells.value.has(key),
          excluded: excludedCells.value.has(key),
          name: cellNames.value[key] ?? '',
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
    if (excludedCells.value.has(key)) return;
    if (selectedCells.value.has(key)) selectedCells.value.delete(key);
    else selectedCells.value.add(key);
  }

  function selectAll() {
    activeCells.value.forEach((cell) => {
      if (!cell.excluded) selectedCells.value.add(`${cell.col}_${cell.row}`);
    });
  }

  function deselectAll() {
    selectedCells.value.clear();
  }

  function toggleExcluded(col: number, row: number) {
    const key = `${col}_${row}`;
    if (excludedCells.value.has(key)) {
      excludedCells.value.delete(key);
    } else {
      excludedCells.value.add(key);
      selectedCells.value.delete(key);
    }
  }

  function resetExcludedCells() {
    excludedCells.value = new Set();
  }

  function setCellName(col: number, row: number, name: string) {
    const key = `${col}_${row}`;
    const trimmed = name.trim();
    if (trimmed) cellNames.value[key] = trimmed;
    else delete cellNames.value[key];
  }

  function resetCellNames() {
    cellNames.value = {};
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

  // Frames are taken from the current selection in reading order (row by row)
  function addAnimationFromSelection(): SpriteAnimation | null {
    const frames = activeCells.value
      .filter(
        (c) => !c.excluded && selectedCells.value.has(`${c.col}_${c.row}`)
      )
      .sort((a, b) => a.row - b.row || a.col - b.col)
      .map((c) => `${c.col}_${c.row}`);
    if (!frames.length) return null;
    const anim: SpriteAnimation = {
      id: animIdSeq++,
      name: `anim_${animations.value.length + 1}`,
      frames,
      fps: 10,
    };
    animations.value.push(anim);
    return anim;
  }

  function removeAnimation(id: number) {
    animations.value = animations.value.filter((a) => a.id !== id);
  }

  function selectAnimationFrames(id: number) {
    const anim = animations.value.find((a) => a.id === id);
    if (!anim) return;
    selectedCells.value.clear();
    anim.frames.forEach((key) => selectedCells.value.add(key));
  }

  function reset() {
    imageFile.value = null;
    imageSrc.value = '';
    imageWidth.value = 0;
    imageHeight.value = 0;
    selectedCells.value.clear();
    excludedCells.value = new Set();
    cellOffsets.value = {};
    cellNames.value = {};
    animations.value = [];
  }

  return {
    imageFile,
    imageSrc,
    imageWidth,
    imageHeight,
    isApplying,
    cellWidth,
    cellHeight,
    offsetX,
    offsetY,
    gapX,
    gapY,
    gridColor,
    mode,
    cellOffsets,
    excludedCells,
    cellNames,
    showNames,
    focusedCell,
    exportGap,
    exportFormat,
    selectedCells,
    animations,
    activeCells,
    loadImage,
    addAnimationFromSelection,
    removeAnimation,
    selectAnimationFrames,
    toggleCell,
    selectAll,
    deselectAll,
    toggleExcluded,
    resetExcludedCells,
    setCellName,
    resetCellNames,
    getCellOffset,
    setCellOffset,
    resetCellOffsets,
    reset,
  };
});
