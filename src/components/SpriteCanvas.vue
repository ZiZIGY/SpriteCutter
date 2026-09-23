<script setup lang="ts">
  import { computed, useTemplateRef, watch } from 'vue';
  import { useTheme } from 'vuetify';
  import { useSpriteStore } from '@/stores/spriteStore';
  import { useCanvasCamera } from '@/composables/useCanvasCamera';
  import { useEditorPointer } from '@/composables/useEditorPointer';
  import { useEditorRenderer } from '@/composables/useEditorRenderer';
  import CanvasHud from './CanvasHud.vue';
  import CanvasToolbar from './CanvasToolbar.vue';

  const store = useSpriteStore();
  const vuetifyTheme = useTheme();
  const canvasBg = computed(() =>
    vuetifyTheme.current.value.dark ? '#080812' : '#e8ecf0'
  );

  const viewportRef = useTemplateRef<HTMLDivElement>('viewportRef');
  const canvasRef = useTemplateRef<HTMLCanvasElement>('canvasRef');

  const { zoom, panX, panY, fitToScreen, adjustZoom, reveal, onWheel } =
    useCanvasCamera(
      viewportRef,
      canvasRef,
      () => store.imageWidth,
      () => store.imageHeight
    );

  const {
    gesture,
    cursor,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerLeave,
  } = useEditorPointer(viewportRef, canvasRef, zoom, panX, panY, fitToScreen);

  useEditorRenderer(
    viewportRef,
    canvasRef,
    zoom,
    panX,
    panY,
    gesture,
    fitToScreen
  );

  watch(
    () => store.revealRequest,
    (req) => {
      const s = req && store.sprites.find((sp) => sp.id === req.id);
      if (s) reveal(s);
    }
  );
</script>

<template>
  <div
    ref="viewportRef"
    class="viewport"
    :style="{ background: canvasBg, cursor }"
    tabindex="0"
    @wheel.prevent="onWheel"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @pointerleave="onPointerLeave"
  >
    <canvas
      ref="canvasRef"
      class="size-full block"
    />

    <CanvasToolbar />

    <Transition name="fade">
      <div
        v-if="store.busy"
        class="canvas-overlay"
      >
        <VProgressCircular
          indeterminate
          color="primary"
          size="48"
          width="3"
        />
        <p class="text-body-small mt-3 overlay-text">Ищем спрайты…</p>
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
    touch-action: none;
  }

  .canvas-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: rgba(8, 8, 18, 0.6);
    backdrop-filter: blur(3px);
    z-index: 30;
    border-radius: 12px;
  }
  .overlay-text {
    color: rgba(255, 255, 255, 0.8);
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
