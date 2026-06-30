<script setup lang="ts">
import { ref, computed, watch, nextTick, useTemplateRef } from 'vue'
import { useTheme } from 'vuetify'
import { useResizeObserver, useRafFn, onKeyStroke } from '@vueuse/core'
import { useSpriteStore } from '@/stores/spriteStore'

const store = useSpriteStore()
const vuetifyTheme = useTheme()
const canvasBg = computed(() => vuetifyTheme.current.value.dark ? '#080812' : '#e8ecf0')

const viewportRef = useTemplateRef<HTMLDivElement>('viewportRef')
const canvasRef = useTemplateRef<HTMLCanvasElement>('canvasRef')

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

useResizeObserver(viewportRef, resizeCanvas)

// ─── Render loop ──────────────────────────────────────────────────────────────
useRafFn(render)

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

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (!imgEl?.complete || !store.imageSrc) return

  ctx.save()
  ctx.translate(panX.value, panY.value)
  ctx.scale(zoom.value, zoom.value)

  ctx.imageSmoothingEnabled = zoom.value < 1
  ctx.drawImage(imgEl, 0, 0)

  const lw = 1 / zoom.value
  const colorBase = hexToRgba(store.gridColor, 0.65)
  const colorSelected = hexToRgba(store.gridColor, 0.95)

  for (const cell of store.activeCells) {
    if (cell.selected) {
      ctx.fillStyle = hexToRgba(store.gridColor, 0.28)
      ctx.fillRect(cell.x, cell.y, cell.width, cell.height)
      ctx.strokeStyle = colorSelected
    } else {
      ctx.strokeStyle = colorBase
    }
    ctx.lineWidth = lw
    ctx.strokeRect(cell.x + lw / 2, cell.y + lw / 2, cell.width - lw, cell.height - lw)
  }

  // Боксы смещения
  if (store.showOffsets) {
    for (const cell of store.activeCells) {
      const offset = store.getCellOffset(cell.col, cell.row)
      const boxX = cell.x + offset.x
      const boxY = cell.y + offset.y
      const isDragging = draggingDot.value?.col === cell.col && draggingDot.value?.row === cell.row

      ctx.fillStyle = hexToRgba(store.gridColor, isDragging ? 0.35 : 0.15)
      ctx.fillRect(boxX, boxY, cell.width, cell.height)

      ctx.strokeStyle = hexToRgba(store.gridColor, isDragging ? 1 : 0.75)
      ctx.lineWidth = 2 / zoom.value
      ctx.setLineDash([5 / zoom.value, 3 / zoom.value])
      ctx.strokeRect(boxX + 1 / zoom.value, boxY + 1 / zoom.value, cell.width - 2 / zoom.value, cell.height - 2 / zoom.value)
      ctx.setLineDash([])

      // Маленький центральный маркер
      const cx = boxX + cell.width / 2
      const cy = boxY + cell.height / 2
      ctx.beginPath()
      ctx.arc(cx, cy, 3 / zoom.value, 0, Math.PI * 2)
      ctx.fillStyle = hexToRgba(store.gridColor, 0.9)
      ctx.fill()
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
  const cx = viewport.clientWidth / 2
  const cy = viewport.clientHeight / 2
  const newZoom = Math.max(0.04, Math.min(32, zoom.value * factor))
  panX.value = cx - (cx - panX.value) * (newZoom / zoom.value)
  panY.value = cy - (cy - panY.value) * (newZoom / zoom.value)
  zoom.value = newZoom
}

function onWheel(e: WheelEvent) {
  const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
  const rect = canvasRef.value!.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  const newZoom = Math.max(0.04, Math.min(32, zoom.value * factor))
  panX.value = mx - (mx - panX.value) * (newZoom / zoom.value)
  panY.value = my - (my - panY.value) * (newZoom / zoom.value)
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

// ─── Input state ─────────────────────────────────────────────────────────────
const spaceHeld = ref(false)
const isPanning = ref(false)
const draggingDot = ref<{ col: number; row: number } | null>(null)
let dragInitiatedOnCanvas = false
let lastPointerX = 0
let lastPointerY = 0
let pointerDownX = 0
let pointerDownY = 0
let movedSinceDown = false

// ─── Offset box hit test ──────────────────────────────────────────────────────
function getOffsetBoxAt(worldX: number, worldY: number) {
  if (!store.showOffsets) return null
  for (const cell of store.activeCells) {
    const offset = store.getCellOffset(cell.col, cell.row)
    const boxX = cell.x + offset.x
    const boxY = cell.y + offset.y
    if (worldX >= boxX && worldX < boxX + cell.width && worldY >= boxY && worldY < boxY + cell.height) {
      return cell
    }
  }
  return null
}

// ─── Pointer events ───────────────────────────────────────────────────────────
function onPointerDown(e: PointerEvent) {
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  viewportRef.value?.focus()
  dragInitiatedOnCanvas = true
  lastPointerX = e.clientX
  lastPointerY = e.clientY
  pointerDownX = e.clientX
  pointerDownY = e.clientY
  movedSinceDown = false

  if (e.button === 0 && store.showOffsets && !spaceHeld.value) {
    const { x: worldX, y: worldY } = screenToWorld(e.clientX, e.clientY)
    const hitCell = getOffsetBoxAt(worldX, worldY)
    if (hitCell) {
      draggingDot.value = { col: hitCell.col, row: hitCell.row }
      e.preventDefault()
      return
    }
  }

  if (e.button === 1 || spaceHeld.value) {
    isPanning.value = true
    e.preventDefault()
  }
}

function onPointerMove(e: PointerEvent) {
  const deltaX = e.clientX - lastPointerX
  const deltaY = e.clientY - lastPointerY
  lastPointerX = e.clientX
  lastPointerY = e.clientY

  if (!dragInitiatedOnCanvas) return

  if (draggingDot.value) {
    const current = store.getCellOffset(draggingDot.value.col, draggingDot.value.row)
    store.setCellOffset(draggingDot.value.col, draggingDot.value.row, {
      x: current.x + deltaX / zoom.value,
      y: current.y + deltaY / zoom.value,
    })
    return
  }

  if (Math.hypot(e.clientX - pointerDownX, e.clientY - pointerDownY) > 4) movedSinceDown = true

  if (e.buttons === 1 && movedSinceDown && !isPanning.value && !spaceHeld.value) isPanning.value = true
  if (e.buttons === 4 && !isPanning.value) isPanning.value = true

  if (isPanning.value) {
    panX.value += deltaX
    panY.value += deltaY
  }
}

function onPointerUp(e: PointerEvent) {
  if (draggingDot.value) {
    draggingDot.value = null
    dragInitiatedOnCanvas = false
    return
  }
  if (dragInitiatedOnCanvas && e.button === 0 && !movedSinceDown && !spaceHeld.value) {
    const { x: worldX, y: worldY } = screenToWorld(e.clientX, e.clientY)
    const cell = getCellAt(worldX, worldY)
    if (cell) store.toggleCell(cell.col, cell.row)
  }
  dragInitiatedOnCanvas = false
  isPanning.value = false
}

// ─── Keyboard ─────────────────────────────────────────────────────────────────
onKeyStroke(' ', (e) => { spaceHeld.value = true; e.preventDefault() }, { target: viewportRef })
onKeyStroke(' ', () => { spaceHeld.value = false; isPanning.value = false }, { target: viewportRef, eventName: 'keyup' })
onKeyStroke('0', () => fitToScreen(), { target: viewportRef })
</script>

<template>
  <div
    ref="viewportRef"
    class="viewport"
    :style="{ background: canvasBg }"
    :class="{
      'cursor-grab': spaceHeld && !isPanning,
      'cursor-grabbing': isPanning || draggingDot,
      'cursor-move': store.showOffsets && !spaceHeld && !isPanning,
      'cursor-crosshair': !store.showOffsets && !spaceHeld && !isPanning,
    }"
    tabindex="0"
    @wheel.prevent="onWheel"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
  >
    <canvas ref="canvasRef" style="display: block; width: 100%; height: 100%" />

    <Transition name="fade">
      <div v-if="store.isApplying" class="canvas-overlay">
        <VProgressCircular indeterminate color="primary" size="48" width="3" />
        <p class="text-caption text-medium-emphasis mt-3">Применяем сетку…</p>
      </div>
    </Transition>

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
  border-radius: 12px;
  outline: none;
}
.cursor-grab      { cursor: grab; }
.cursor-grabbing  { cursor: grabbing; }
.cursor-crosshair { cursor: crosshair; }
.cursor-move      { cursor: move; }

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
