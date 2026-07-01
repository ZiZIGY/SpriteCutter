import { ref, computed, type Ref } from 'vue';
import { onKeyStroke } from '@vueuse/core';
import type { SpriteCell, CanvasMode } from '@/stores/spriteStore';

interface PointerStore {
  mode: CanvasMode;
  activeCells: SpriteCell[];
  getCellOffset(col: number, row: number): { x: number; y: number };
  setCellOffset(
    col: number,
    row: number,
    offset: { x: number; y: number }
  ): void;
  toggleCell(col: number, row: number): void;
  toggleExcluded(col: number, row: number): void;
}

export function useCanvasPointer(
  viewportRef: Ref<HTMLDivElement | null>,
  canvasRef: Ref<HTMLCanvasElement | null>,
  zoom: Ref<number>,
  panX: Ref<number>,
  panY: Ref<number>,
  store: PointerStore
) {
  const spaceHeld = ref(false);
  const isPanning = ref(false);
  const draggingDot = ref<{ col: number; row: number } | null>(null);
  let dragInitiatedOnCanvas = false;
  let lastPointerX = 0;
  let lastPointerY = 0;
  let pointerDownX = 0;
  let pointerDownY = 0;
  let movedSinceDown = false;
  let isPainting = false;
  let paintTargetState = true;
  const paintedKeys = new Set<string>();

  function screenToWorld(screenX: number, screenY: number) {
    const rect = canvasRef.value!.getBoundingClientRect();
    return {
      x: (screenX - rect.left - panX.value) / zoom.value,
      y: (screenY - rect.top - panY.value) / zoom.value,
    };
  }

  function getCellAt(worldX: number, worldY: number): SpriteCell | null {
    return (
      store.activeCells.find(
        (cell) =>
          worldX >= cell.x &&
          worldX < cell.x + cell.width &&
          worldY >= cell.y &&
          worldY < cell.y + cell.height
      ) ?? null
    );
  }

  function getOffsetBoxAt(worldX: number, worldY: number): SpriteCell | null {
    if (store.mode !== 'offset') return null;
    for (const cell of store.activeCells) {
      const offset = store.getCellOffset(cell.col, cell.row);
      const boxX = cell.x + offset.x;
      const boxY = cell.y + offset.y;
      if (
        worldX >= boxX &&
        worldX < boxX + cell.width &&
        worldY >= boxY &&
        worldY < boxY + cell.height
      ) {
        return cell;
      }
    }
    return null;
  }

  function paintField(cell: SpriteCell): boolean {
    return store.mode === 'exclude' ? cell.excluded : cell.selected;
  }

  function paintToggle(cell: SpriteCell) {
    if (store.mode === 'exclude') store.toggleExcluded(cell.col, cell.row);
    else store.toggleCell(cell.col, cell.row);
  }

  function onPointerDown(e: PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    viewportRef.value?.focus();
    dragInitiatedOnCanvas = true;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    pointerDownX = e.clientX;
    pointerDownY = e.clientY;
    movedSinceDown = false;
    paintedKeys.clear();

    if (e.button === 1 || (e.button === 0 && spaceHeld.value)) {
      isPanning.value = true;
      e.preventDefault();
      return;
    }

    if (e.button === 0) {
      if (store.mode === 'offset') {
        const { x: wx, y: wy } = screenToWorld(e.clientX, e.clientY);
        const hitCell = getOffsetBoxAt(wx, wy);
        if (hitCell) {
          draggingDot.value = { col: hitCell.col, row: hitCell.row };
          e.preventDefault();
          return;
        }
      }

      const { x: wx, y: wy } = screenToWorld(e.clientX, e.clientY);
      const cell = getCellAt(wx, wy);
      paintTargetState = cell ? !paintField(cell) : true;
      isPainting = true;
    }
  }

  function onPointerMove(e: PointerEvent) {
    const deltaX = e.clientX - lastPointerX;
    const deltaY = e.clientY - lastPointerY;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;

    if (!dragInitiatedOnCanvas) return;

    if (Math.hypot(e.clientX - pointerDownX, e.clientY - pointerDownY) > 4)
      movedSinceDown = true;

    if (draggingDot.value) {
      const current = store.getCellOffset(
        draggingDot.value.col,
        draggingDot.value.row
      );
      store.setCellOffset(draggingDot.value.col, draggingDot.value.row, {
        x: current.x + deltaX / zoom.value,
        y: current.y + deltaY / zoom.value,
      });
      return;
    }

    if (e.buttons === 4 && !isPanning.value) isPanning.value = true;
    if (e.buttons === 1 && spaceHeld.value && !isPanning.value)
      isPanning.value = true;

    if (isPanning.value) {
      panX.value += deltaX;
      panY.value += deltaY;
      return;
    }

    if (isPainting && movedSinceDown && e.buttons === 1) {
      const { x: wx, y: wy } = screenToWorld(e.clientX, e.clientY);
      const cell = getCellAt(wx, wy);
      if (cell) {
        const key = `${cell.col}_${cell.row}`;
        if (!paintedKeys.has(key)) {
          paintedKeys.add(key);
          if (paintField(cell) !== paintTargetState) paintToggle(cell);
        }
      }
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (draggingDot.value) {
      draggingDot.value = null;
      dragInitiatedOnCanvas = false;
      return;
    }

    if (
      dragInitiatedOnCanvas &&
      e.button === 0 &&
      !movedSinceDown &&
      !spaceHeld.value
    ) {
      const { x: wx, y: wy } = screenToWorld(e.clientX, e.clientY);
      const cell = getCellAt(wx, wy);
      if (cell) paintToggle(cell);
    }

    dragInitiatedOnCanvas = false;
    isPanning.value = false;
    isPainting = false;
  }

  onKeyStroke(
    ' ',
    (e) => {
      spaceHeld.value = true;
      e.preventDefault();
    },
    { target: viewportRef }
  );
  onKeyStroke(
    ' ',
    () => {
      spaceHeld.value = false;
      isPanning.value = false;
    },
    { target: viewportRef, eventName: 'keyup' }
  );

  const cursorClass = computed(() => ({
    'cursor-grab': spaceHeld.value && !isPanning.value,
    'cursor-grabbing': isPanning.value || !!draggingDot.value,
    'cursor-crosshair':
      !spaceHeld.value && !isPanning.value && !draggingDot.value,
  }));

  return {
    spaceHeld,
    isPanning,
    draggingDot,
    cursorClass,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  };
}
