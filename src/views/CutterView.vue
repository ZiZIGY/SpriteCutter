<script setup lang="ts">
  import { useSpriteStore } from '@/stores/spriteStore';
  import UploadZone from '@/components/UploadZone.vue';
  import SpriteCanvas from '@/components/SpriteCanvas.vue';

  const store = useSpriteStore();
</script>

<template>
  <div
    v-if="!store.imageSrc"
    class="fill-viewport d-flex align-center justify-center pa-8"
  >
    <div style="max-width: 520px; width: 100%">
      <UploadZone />
    </div>
  </div>

  <div
    v-else
    class="fill-viewport d-flex flex-column pa-3"
    style="gap: 6px"
  >
    <div class="canvas-row">
      <SpriteCanvas />
    </div>
    <p
      class="text-caption text-disabled text-center"
      style="flex-shrink: 0"
    >
      Колёсико — zoom · СКМ/Пробел — перемещение · клик/тяни — выделение
      <template v-if="store.mode === 'offset'">
        · тяни бокс — сдвинуть</template
      >
    </p>
  </div>
</template>

<style scoped>
  .fill-viewport {
    height: 100%;
    box-sizing: border-box;
  }
  .canvas-row {
    flex: 1;
    min-height: 0;
    display: flex;
    gap: 12px;
  }
</style>
