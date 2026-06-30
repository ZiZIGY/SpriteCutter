<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useSpriteStore } from '@/stores/spriteStore'

const store = useSpriteStore()

const viewportRef = ref<HTMLDivElement>()
const canvasRef = ref<HTMLCanvasElement>()

// ─── Camera ──────────────────────────────────────────────────────────────────
const zoom = ref(1)
const panX = ref(0)
const panY = ref(0)

// ─── Image cache ─────────────────────────────────────────────────────────────
let imgEl: HTMLImageElement | null = null

watch(() => store.imageSrc, src => {
  imgEl = null
  if (!src) return
  const img = new Image()
  img.onload = () => { imgEl = img; nextTick(fitToScreen) }
  img.src = src
}, { immediate: true })

// ─── Canvas resize ────────────────────────────────────────────────────────────
function resizeCanvas() {
  const viewport = viewportRef.value
  const canvas = canvasRef.value
  if (!viewport || !canvas) return
  canvas.width = viewport.clientWidth
  canvas.height = viewport.clientHeight
}

let resizeObserver: ResizeObserver
onMounted(() => {
  resizeObserver = new ResizeObserver(resizeCanvas)
  resizeObserver.observe(viewportRef.value!)
  resizeCanvas()
  requestAnimationFrame(loop)
})
onUnmounted(() => {
  resizeObserver?.disconnect()
  running = false
})

// ─── Render loop ──────────────────────────────────────────────────────────────
let running = true

function loop() {
  if (!running) return
  render()
  requestAnimationFrame(loop)
}

function hexToRgba(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

function render() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')!
  const canvasWidth = canvas.width
  const canvasHeight = canvas.height

  ctx.clearRect(0, 0, canvasWidth, canvasHeight)

  if (!imgEl?.complete || !store.imageSrc) return

  ctx.save()
  ctx.translate(panX.value, panY.value)
  ctx.scale(zoom.value, zoom.value)

  // Изображение
  ctx.imageSmoothingEnabled = zoom.value < 1
  ctx.drawImage(imgEl, 0, 0)

  const screenLineWidth = 1 / zoom.value
  const gridColorBase = hexToRgba(store.gridColor, store.gridOpacity)
  const gridColorSelected = hexToRgba(store.gridColor, Math.min(1, store.gridOpacity + 0.3))

  // Ячейки
  for (const cell of store.activeCells) {
    if (cell.selected) {
      ctx.fillStyle = hexToRgba(store.gridColor, 0.28)
      ctx.fillRect(cell.x, cell.y, cell.width, cell.height)
      ctx.strokeStyle = gridColorSelected
    } else {
      ctx.strokeStyle = gridColorBase
    }
    ctx.lineWidth = screenLineWidth
    ctx.strokeRect(
      cell.x + screenLineWidth / 2,
      cell.y + screenLineWidth / 2,
      cell.width - screenLineWidth,
      cell.height - screenLineWidth
    )
  }

  // Свободные линии
  if (store.gridMode === 'free') {
    ctx.strokeStyle = hexToRgba(store.gridColor, Math.min(1, store.gridOpacity + 0.25))
    ctx.lineWidth = 1.5 / zoom.value
    for (const line of store.freeLines) {
      ctx.beginPath()
      if (line.axis === 'x') {
        ctx.moveTo(line.position, 0)
        ctx.lineTo(line.position, store.imageHeight)
      } else {
        ctx.moveTo(0, line.position)
        ctx.lineTo(store.imageWidth, line.position)
      }
      ctx.stroke()
    }
  }

  // Режим смещений: рисуем смещённый контур и точку-якорь в каждой ячейке
  if (store.showOffsets) {
    const dotRadius = 5 / zoom.value
    const activeDotRadius = 7 / zoom.value

    for (const cell of store.activeCells) {
      const offset = store.getCellOffset(cell.col, cell.row)
      const hasOffset = offset.x !== 0 || offset.y !== 0

      // Смещённый контур ячейки
      if (hasOffset) {
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.45)'
        ctx.lineWidth = 1 / zoom.value
        ctx.setLineDash([4 / zoom.value, 3 / zoom.value])
        ctx.strokeRect(
          cell.x + offset.x,
          cell.y + offset.y,
          cell.width,
          cell.height
        )
        ctx.setLineDash([])

        // Стрелка от оригинала к смещению
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.3)'
        ctx.lineWidth = 0.5 / zoom.value
        ctx.beginPath()
        ctx.moveTo(cell.x + cell.width / 2, cell.y + cell.height / 2)
        ctx.lineTo(cell.x + offset.x + cell.width / 2, cell.y + offset.y + cell.height / 2)
        ctx.stroke()
      }

      // Точка-якорь (в центре смещённой ячейки)
      const dotX = cell.x + offset.x + cell.width / 2
      const dotY = cell.y + offset.y + cell.height / 2
      const isDraggingThis = (
        draggingDotCell !== null &&
        draggingDotCell.col === cell.col &&
        draggingDotCell.row === cell.row
      )

      ctx.fillStyle = isDraggingThis
        ? 'rgba(251, 191, 36, 1.0)'
        : hasOffset
          ? 'rgba(251, 191, 36, 0.85)'
          : 'rgba(251, 191, 36, 0.5)'

      ctx.beginPath()
      ctx.arc(dotX, dotY, isDraggingThis ? activeDotRadius : dotRadius, 0, Math.PI * 2)
      ctx.fill()

      // Обводка точки
      ctx.strokeStyle = 'rgba(20, 20, 36, 0.6)'
      ctx.lineWidth = 1 / zoom.value
      ctx.stroke()

      // Подпись смещения если есть
      if (hasOffset) {
        ctx.fillStyle = 'rgba(251, 191, 36, 0.85)'
        ctx.font = `${10 / zoom.value}px monospace`
        ctx.fillText(
          `${offset.x > 0 ? '+' : ''}${offset.x}, ${offset.y > 0 ? '+' : ''}${offset.y}`,
          cell.x + offset.x + 3 / zoom.value,
          cell.y + offset.y + 12 / zoom.value
        )
      }
    }
  }

  ctx.restore()
}

// ─── Camera helpers ───────────────────────────────────────────────────────────
function fitToScreen() {
  const viewport = viewportRef.value
  if (!viewport || !store.imageWidth || !store.imageHeight) return
  const fitZoom = Math.min(viewport.clientWidth / store.imageWidth, viewport.clientHeight / store.imageHeight) * 0.92
  zoom.value = fitZoom
  panX.value = (viewport.clientWidth - store.imageWidth * fitZoom) / 2
  panY.value = (viewport.clientHeight - store.imageHeight * fitZoom) / 2
}

function adjustZoom(factor: number) {
  const viewport = viewportRef.value!
  const centerX = viewport.clientWidth / 2
  const centerY = viewport.clientHeight / 2
  const newZoom = Math.max(0.04, Math.min(32, zoom.value * factor))
  panX.value = centerX - (centerX - panX.value) * (newZoom / zoom.value)
  panY.value = centerY - (centerY - panY.value) * (newZoom / zoom.value)
  zoom.value = newZoom
}

function onWheel(e: WheelEvent) {
  const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
  const rect = canvasRef.value!.getBoundingClientRect()
  const mouseX = e.clientX - rect.left
  const mouseY = e.clientY - rect.top
  const newZoom = Math.max(0.04, Math.min(32, zoom.value * factor))
  panX.value = mouseX - (mouseX - panX.value) * (newZoom / zoom.value)
  panY.value = mouseY - (mouseY - panY.value) * (newZoom / zoom.value)
  zoom.value = newZoom
}

// ─── Coordinate helpers ───────────────────────────────────────────────────────
function screenToWorld(screenX: number, screenY: number) {
  const rect = canvasRef.value!.getBoundingClientRect()
  return {
    x: (screenX - rect.left - panX.value) / zoom.value,
    y: (screenY - rect.top - panY.value) / zoom.value,
  }
}

function getCellAt(worldX: number, worldY: number) {
  return store.activeCells.find(cell =>
    worldX >= cell.x && worldX < cell.x + cell.width &&
    worldY >= cell.y && worldY < cell.y + cell.height
  ) ?? null
}

function getLineNear(screenX: number, screenY: number) {
  const rect = canvasRef.value!.getBoundingClientRect()
  const mouseX = screenX - rect.left
  const mouseY = screenY - rect.top
  const threshold = 7
  for (const line of store.freeLines) {
    if (line.axis === 'x') {
      if (Math.abs(line.position * zoom.value + panX.value - mouseX) < threshold) return line
    } else {
      if (Math.abs(line.position * zoom.value + panY.value - mouseY) < threshold) return line
    }
  }
  return null
}

function getDotNear(worldX: number, worldY: number): { col: number; row: number } | null {
  if (!store.showOffsets) return null
  const threshold = 10 / zoom.value
  for (const cell of store.activeCells) {
    const offset = store.getCellOffset(cell.col, cell.row)
    const dotX = cell.x + offset.x + cell.width / 2
    const dotY = cell.y + offset.y + cell.height / 2
    if (Math.hypot(worldX - dotX, worldY - dotY) < threshold) {
      return { col: cell.col, row: cell.row }
    }
  }
  return null
}

// ─── Input state ─────────────────────────────────────────────────────────────
const spaceHeld = ref(false)
type DragMode = 'pan' | 'line' | 'dot' | null
const activeDrag = ref<DragMode>(null)

// Только drags, начатые на канвасе, обрабатываем — защита от "зажал снаружи, въехал внутрь"
let dragInitiatedOnCanvas = false

let lastPointerX = 0
let lastPointerY = 0
let pointerDownX = 0
let pointerDownY = 0
let movedSinceDown = false

// Линия перетаскивания
let draggingLineId: string | null = null
let lineDragAxis: 'x' | 'y' = 'x'
let lineDragStartScreen = 0
let lineDragStartPos = 0

// Точка смещения перетаскивания
let draggingDotCell: { col: number; row: number } | null = null
let dotDragStartOffsetX = 0
let dotDragStartOffsetY = 0

// ─── Pointer events ───────────────────────────────────────────────────────────
function onPointerDown(e: PointerEvent) {
  // Захватываем указатель — все последующие события будут приходить сюда,
  // даже если курсор выйдет за пределы элемента
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  viewportRef.value?.focus()

  dragInitiatedOnCanvas = true
  lastPointerX = e.clientX
  lastPointerY = e.clientY
  pointerDownX = e.clientX
  pointerDownY = e.clientY
  movedSinceDown = false

  // Средняя кнопка или пробел — всегда пан
  if (e.button === 1 || spaceHeld.value) {
    activeDrag.value = 'pan'
    e.preventDefault()
    return
  }

  if (e.button === 0) {
    const { x: worldX, y: worldY } = screenToWorld(e.clientX, e.clientY)

    // Сначала проверяем точки смещений (приоритет выше линий)
    const dotCell = getDotNear(worldX, worldY)
    if (dotCell) {
      const currentOffset = store.getCellOffset(dotCell.col, dotCell.row)
      draggingDotCell = dotCell
      dotDragStartOffsetX = currentOffset.x
      dotDragStartOffsetY = currentOffset.y
      activeDrag.value = 'dot'
      e.preventDefault()
      return
    }

    // Затем свободные линии
    if (store.gridMode === 'free') {
      const line = getLineNear(e.clientX, e.clientY)
      if (line) {
        draggingLineId = line.id
        lineDragAxis = line.axis
        lineDragStartScreen = line.axis === 'x' ? e.clientX : e.clientY
        lineDragStartPos = line.position
        activeDrag.value = 'line'
        e.preventDefault()
        return
      }
    }
  }
}

function onPointerMove(e: PointerEvent) {
  const deltaX = e.clientX - lastPointerX
  const deltaY = e.clientY - lastPointerY
  lastPointerX = e.clientX
  lastPointerY = e.clientY

  // Если drag начался снаружи канваса — игнорируем всё кроме позиции
  if (!dragInitiatedOnCanvas) return

  if (Math.hypot(e.clientX - pointerDownX, e.clientY - pointerDownY) > 4) movedSinceDown = true

  // Перетаскивание точки смещения
  if (activeDrag.value === 'dot' && draggingDotCell) {
    const totalDeltaX = (e.clientX - pointerDownX) / zoom.value
    const totalDeltaY = (e.clientY - pointerDownY) / zoom.value
    store.setCellOffset(
      draggingDotCell.col,
      draggingDotCell.row,
      dotDragStartOffsetX + totalDeltaX,
      dotDragStartOffsetY + totalDeltaY
    )
    return
  }

  // Перетаскивание линии
  if (activeDrag.value === 'line' && draggingLineId) {
    const screenDelta = lineDragAxis === 'x'
      ? e.clientX - lineDragStartScreen
      : e.clientY - lineDragStartScreen
    const worldDelta = screenDelta / zoom.value
    const maxPosition = lineDragAxis === 'x' ? store.imageWidth : store.imageHeight
    store.updateFreeLine(
      draggingLineId,
      Math.max(1, Math.min(maxPosition - 1, Math.round(lineDragStartPos + worldDelta)))
    )
    return
  }

  // Пан: активируем если началось с нашего pointerdown
  if (e.buttons === 1 && movedSinceDown && activeDrag.value === null) activeDrag.value = 'pan'
  if (e.buttons === 4 && activeDrag.value === null) activeDrag.value = 'pan'

  if (activeDrag.value === 'pan') {
    panX.value += deltaX
    panY.value += deltaY
  }
}

function onPointerUp(e: PointerEvent) {
  // Клик без движения — переключаем ячейку
  if (
    dragInitiatedOnCanvas &&
    e.button === 0 &&
    !movedSinceDown &&
    activeDrag.value !== 'line' &&
    activeDrag.value !== 'dot'
  ) {
    const { x: worldX, y: worldY } = screenToWorld(e.clientX, e.clientY)
    const cell = getCellAt(worldX, worldY)
    if (cell) store.toggleCell(cell.col, cell.row)
  }

  dragInitiatedOnCanvas = false
  activeDrag.value = null
  draggingLineId = null
  draggingDotCell = null
}

// ─── Keyboard ─────────────────────────────────────────────────────────────────
function onKeyDown(e: KeyboardEvent) {
  if (e.code === 'Space') { spaceHeld.value = true; e.preventDefault() }
  if (e.code === 'Digit0' || e.code === 'Numpad0') fitToScreen()
}
function onKeyUp(e: KeyboardEvent) {
  if (e.code === 'Space') { spaceHeld.value = false; activeDrag.value = null }
}

// ─── Двойной клик: добавить свободную линию ───────────────────────────────────
function onDblClick(e: MouseEvent) {
  if (store.gridMode !== 'free') return
  const { x: worldX, y: worldY } = screenToWorld(e.clientX, e.clientY)
  if (worldX < 0 || worldX > store.imageWidth || worldY < 0 || worldY > store.imageHeight) return
  const nearVertical = Math.min(worldX, store.imageWidth - worldX)
  const nearHorizontal = Math.min(worldY, store.imageHeight - worldY)
  store.addFreeLine(
    nearVertical < nearHorizontal ? 'x' : 'y',
    Math.round(nearVertical < nearHorizontal ? worldX : worldY)
  )
}
</script>

<template>
  <div
    ref="viewportRef"
    class="viewport"
    :class="{
      'cursor-grab': spaceHeld && !activeDrag,
      'cursor-grabbing': activeDrag === 'pan',
      'cursor-crosshair': !spaceHeld && !activeDrag && !store.showOffsets,
      'cursor-move': !spaceHeld && !activeDrag && store.showOffsets,
    }"
    tabindex="0"
    @wheel.prevent="onWheel"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @keydown="onKeyDown"
    @keyup="onKeyUp"
    @dblclick="onDblClick"
  >
    <canvas ref="canvasRef" style="display: block; width: 100%; height: 100%" />

    <!-- Спиннер применения сетки -->
    <Transition name="fade">
      <div v-if="store.isApplying" class="canvas-overlay">
        <VProgressCircular indeterminate color="primary" size="48" width="3" />
        <p class="text-caption text-medium-emphasis mt-3">Применяем сетку…</p>
      </div>
    </Transition>

    <!-- HUD зума -->
    <div class="hud">
      <div class="zoom-control">
        <button class="zoom-btn" @click.stop="adjustZoom(0.8)">
          <VIcon size="14">mdi-minus</VIcon>
        </button>
        <span class="zoom-value" title="По размеру (клавиша 0)" @click.stop="fitToScreen">
          {{ Math.round(zoom * 100) }}%
        </span>
        <button class="zoom-btn" @click.stop="adjustZoom(1.25)">
          <VIcon size="14">mdi-plus</VIcon>
        </button>
        <div class="zoom-sep" />
        <button class="zoom-btn" @click.stop="fitToScreen">
          <VIcon size="14">mdi-fit-to-screen-outline</VIcon>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.viewport {
  flex: 1;
  min-height: 0;
  width: 100%;
  position: relative;
  overflow: hidden;
  background: #080812;
  border-radius: 12px;
  outline: none;
}
.cursor-grab      { cursor: grab; }
.cursor-grabbing  { cursor: grabbing; }
.cursor-crosshair { cursor: crosshair; }
.cursor-move      { cursor: default; }

.canvas-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(8, 8, 18, 0.72);
  backdrop-filter: blur(4px);
  z-index: 30;
  border-radius: 12px;
}
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.hud {
  position: absolute;
  bottom: 12px;
  right: 12px;
  z-index: 20;
}
.zoom-control {
  display: flex;
  align-items: center;
  gap: 1px;
  background: rgba(20, 20, 36, 0.92);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 2px;
}
.zoom-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.65);
  width: 26px;
  height: 26px;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.12s, color 0.12s;
}
.zoom-btn:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }
.zoom-value {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.75);
  cursor: pointer;
  padding: 0 6px;
  height: 26px;
  min-width: 46px;
  text-align: center;
  line-height: 26px;
  border-radius: 5px;
  transition: background 0.12s, color 0.12s;
}
.zoom-value:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }
.zoom-sep {
  width: 1px;
  height: 14px;
  background: rgba(255, 255, 255, 0.12);
  margin: 0 2px;
  flex-shrink: 0;
}
</style>
