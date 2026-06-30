<script setup lang="ts">
  defineProps<{ zoom: number }>();

  const emit = defineEmits<{
    'adjust-zoom': [factor: number];
    fit: [];
  }>();
</script>

<template>
  <div class="hud">
    <div
      class="hud-group"
      @pointerdown.stop
    >
      <VBtn
        :icon="true"
        size="x-small"
        density="compact"
        variant="text"
        :ripple="false"
        @click="emit('adjust-zoom', 0.8)"
      >
        <VIcon size="14">mdi-minus</VIcon>
      </VBtn>
      <span
        class="zoom-value"
        title="По размеру (клавиша 0)"
        @click="emit('fit')"
      >
        {{ Math.round(zoom * 100) }}%
      </span>
      <VBtn
        :icon="true"
        size="x-small"
        density="compact"
        variant="text"
        :ripple="false"
        @click="emit('adjust-zoom', 1.25)"
      >
        <VIcon size="14">mdi-plus</VIcon>
      </VBtn>
      <div class="hud-sep" />
      <VBtn
        :icon="true"
        size="x-small"
        density="compact"
        variant="text"
        :ripple="false"
        title="По размеру (0)"
        @click="emit('fit')"
      >
        <VIcon size="14">mdi-fit-to-screen-outline</VIcon>
      </VBtn>
    </div>
  </div>
</template>

<style scoped>
  .hud {
    position: absolute;
    bottom: 12px;
    left: 12px;
    right: 12px;
    z-index: 20;
    display: flex;
    justify-content: flex-end;
    pointer-events: none;
  }
  .hud-group {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 1px;
    background: rgba(20, 20, 36, 0.92);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 2px;
  }
  .zoom-value {
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    color: rgba(255, 255, 255, 0.75);
    cursor: pointer;
    padding: 0 6px;
    height: 24px;
    min-width: 44px;
    text-align: center;
    line-height: 24px;
    border-radius: 4px;
    transition:
      background 0.12s,
      color 0.12s;
  }
  .zoom-value:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }
  .hud-sep {
    width: 1px;
    height: 14px;
    background: rgba(255, 255, 255, 0.12);
    margin: 0 2px;
    flex-shrink: 0;
  }
</style>
