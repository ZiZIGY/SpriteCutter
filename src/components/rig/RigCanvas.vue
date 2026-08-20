<script setup lang="ts">
  import { computed, nextTick, useTemplateRef, watch } from 'vue';
  import { useTheme } from 'vuetify';
  import { onKeyStroke } from '@vueuse/core';

  import { useSpriteStore } from '@/stores/spriteStore';
  import { useRigStore } from '@/stores/rigStore';
  import { useCanvasCamera } from '@/composables/useCanvasCamera';
  import { useRigPointer } from '@/composables/rig/useRigPointer';
  import {
    useRigRenderer,
    type RigRendererHandles,
  } from '@/composables/rig/useRigRenderer';
  import CanvasHud from '@/components/CanvasHud.vue';

  const store = useSpriteStore();
  const rig = useRigStore();
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
      () => rig.region.width,
      () => rig.region.height
    );

  const {
    pendingBone,
    brushPosition,
    snapTarget,
    hoverBoneId,
    isGrabbing,
    cursorClass,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerLeave,
  } = useRigPointer(viewportRef, canvasRef, zoom, panX, panY);

  const handles: RigRendererHandles = {
    getImageData: () => null,
    pendingBone,
    brushPosition,
    snapTarget,
    hoverBoneId,
    isGrabbing,
  };

  useRigRenderer(
    viewportRef,
    canvasRef,
    zoom,
    panX,
    panY,
    computed(() => store.imageSrc),
    handles,
    fitToScreen
  );

  /** Mesh generation needs the decoded sheet pixels the renderer holds. */
  function generateMesh() {
    const source = handles.getImageData();
    if (!source) return;
    rig.generateMesh(source.data, source.width);
    rig.computeAutoWeights();
  }

  // The sidebar bumps a counter rather than calling in directly, since only
  // this component holds the decoded pixels.
  watch(
    () => rig.meshRequestId,
    () => generateMesh()
  );

  // Picking a different sprite changes the whole coordinate space, so re-frame
  // the view; otherwise a small cell shows up tiny in the corner at old zoom.
  watch(
    () => [rig.region.x, rig.region.y, rig.region.width, rig.region.height],
    async () => {
      if (!rig.region.width) return;
      await nextTick();
      fitToScreen();
    },
    { immediate: true }
  );

  onKeyStroke('0', () => fitToScreen(), { target: viewportRef });

  const stageHints: Record<string, string> = {
    bones: 'Тяни по холсту — новая кость. Выбрана кость → тянешь дочернюю. Del — удалить',
    mesh: 'Настрой параметры слева и построй сетку',
    weights: 'ЛКМ — добавить вес выбранной кости, ПКМ — убрать',
    pose: 'Тяни за любую кость — сработает IK · резко отпусти — инерция · ПКМ — толчок',
  };
</script>

<template>
  <div class="d-flex flex-column" style="flex: 1; min-height: 0; gap: 6px">
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
      @pointerleave="onPointerLeave"
      @contextmenu.prevent
    >
      <canvas
        ref="canvasRef"
        class="size-full block"
      />

      <div
        v-if="!rig.region.width"
        class="canvas-overlay"
      >
        <VIcon
          size="40"
          class="mb-2"
          color="primary"
          >mdi-image-frame</VIcon
        >
        <p class="text-body-2 text-medium-emphasis">
          Выбери спрайт для риггинга слева
        </p>
      </div>

      <CanvasHud
        :zoom="zoom"
        @adjust-zoom="adjustZoom"
        @fit="fitToScreen"
      />
    </div>

    <p
      class="text-caption text-disabled text-center"
      style="flex-shrink: 0"
    >
      {{ stageHints[rig.stage] }} · Колёсико — zoom · СКМ/Пробел — перемещение
    </p>
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
  .canvas-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }
</style>
