<script setup lang="ts">
  import { computed, useTemplateRef } from 'vue';
  import { useTheme } from 'vuetify';
  import { onKeyStroke } from '@vueuse/core';
  import { useSpriteStore } from '@/stores/spriteStore';
  import { useCanvasCamera } from '@/composables/useCanvasCamera';
  import { useCanvasPointer } from '@/composables/useCanvasPointer';
  import { useCanvasRenderer } from '@/composables/useCanvasRenderer';
  import CanvasHud from './CanvasHud.vue';

  const store = useSpriteStore();
  const vuetifyTheme = useTheme();
  const canvasBg = computed(() =>
    vuetifyTheme.current.value.dark ? '#080812' : '#e8ecf0'
  );

  const viewportRef = useTemplateRef<HTMLDivElement>('viewportRef');
  const canvasRef = useTemplateRef<HTMLCanvasElement>('canvasRef');

  const { zoom, panX, panY, fitToScreen, adjustZoom, onWheel } =
    useCanvasCamera(
      viewportRef,
      canvasRef,
      () => store.imageWidth,
      () => store.imageHeight
    );

  const {
    draggingDot,
    cursorClass,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  } = useCanvasPointer(viewportRef, canvasRef, zoom, panX, panY, store);

  useCanvasRenderer(
    viewportRef,
    canvasRef,
    zoom,
    panX,
    panY,
    draggingDot,
    store,
    fitToScreen
  );

  onKeyStroke('0', () => fitToScreen(), { target: viewportRef });
</script>

<template>
  <div
    ref="viewportRef"
    class="viewport"
    :style="{ background: canvasBg }"
    :class="cursorClass"
    tabindex="0"
    @wheel.prevent="onWheel"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
  >
    <canvas
      ref="canvasRef"
      class="size-full block"
    />

    <Transition name="fade">
      <div
        v-if="store.isApplying"
        class="canvas-overlay"
      >
        <VProgressCircular
          indeterminate
          color="primary"
          size="48"
          width="3"
        />
        <p class="text-caption text-medium-emphasis mt-3">Применяем сетку…</p>
      </div>
    </Transition>

    <CanvasHud
      :zoom="zoom"
      @adjust-zoom="adjustZoom"
      @fit="fitToScreen"
    />
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
  .cursor-grab {
    cursor: grab;
  }
  .cursor-grabbing {
    cursor: grabbing;
  }
  .cursor-crosshair {
    cursor: crosshair;
  }
  .cursor-move {
    cursor: move;
  }

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
  .fade-enter-active,
  .fade-leave-active {
    transition: opacity 0.15s ease;
  }
  .fade-enter-from,
  .fade-leave-to {
    opacity: 0;
  }
</style>
