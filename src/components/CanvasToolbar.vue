<script setup lang="ts">
  import { computed } from 'vue';
  import { useSpriteStore } from '@/stores/spriteStore';

  const store = useSpriteStore();

  const status = computed(() => {
    const n = store.sprites.length;
    if (store.selected.size) return `выделено ${store.selected.size} из ${n}`;
    return `${n} ${plural(n, 'спрайт', 'спрайта', 'спрайтов')} · ${store.rowCount} ${plural(store.rowCount, 'ряд', 'ряда', 'рядов')}`;
  });

  function plural(n: number, one: string, few: string, many: string) {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  const tools = [
    { value: 'select', icon: 'mdi-cursor-default-outline', tip: 'Выбор и перемещение (V)' },
    { value: 'draw', icon: 'mdi-vector-square-plus', tip: 'Нарисовать рамку вручную (B)' },
  ] as const;
</script>

<template>
  <div
    class="toolbar"
    @pointerdown.stop
  >
    <div class="tb-group">
      <VBtn
        v-for="t in tools"
        :key="t.value"
        icon
        size="small"
        density="comfortable"
        :variant="store.tool === t.value ? 'tonal' : 'text'"
        :color="store.tool === t.value ? 'primary' : undefined"
        :ripple="false"
        @click="store.tool = t.value"
      >
        <VIcon size="18">{{ t.icon }}</VIcon>
        <VTooltip
          activator="parent"
          location="bottom"
          >{{ t.tip }}</VTooltip
        >
      </VBtn>

      <div class="tb-sep" />

      <VBtn
        icon
        size="small"
        density="comfortable"
        variant="text"
        :ripple="false"
        :disabled="store.selected.size < 2"
        @click="store.mergeSelected()"
      >
        <VIcon size="18">mdi-vector-union</VIcon>
        <VTooltip
          activator="parent"
          location="bottom"
          >Объединить выделенные в один спрайт (M)</VTooltip
        >
      </VBtn>
      <VBtn
        icon
        size="small"
        density="comfortable"
        variant="text"
        :ripple="false"
        :disabled="!store.selected.size"
        @click="store.removeSelected()"
      >
        <VIcon size="18">mdi-delete-outline</VIcon>
        <VTooltip
          activator="parent"
          location="bottom"
          >Удалить выделенные (Del)</VTooltip
        >
      </VBtn>

      <div class="tb-sep" />

      <VBtn
        icon
        size="small"
        density="comfortable"
        variant="text"
        :ripple="false"
        :disabled="!store.canUndo"
        @click="store.undo()"
      >
        <VIcon size="18">mdi-undo</VIcon>
        <VTooltip
          activator="parent"
          location="bottom"
          >Отменить (Ctrl+Z)</VTooltip
        >
      </VBtn>
      <VBtn
        icon
        size="small"
        density="comfortable"
        variant="text"
        :ripple="false"
        :disabled="!store.canRedo"
        @click="store.redo()"
      >
        <VIcon size="18">mdi-redo</VIcon>
        <VTooltip
          activator="parent"
          location="bottom"
          >Повторить (Ctrl+Shift+Z)</VTooltip
        >
      </VBtn>

      <div class="tb-sep" />

      <VBtn
        icon
        size="small"
        density="comfortable"
        :variant="store.showNames ? 'tonal' : 'text'"
        :ripple="false"
        @click="store.showNames = !store.showNames"
      >
        <VIcon size="18">mdi-tag-outline</VIcon>
        <VTooltip
          activator="parent"
          location="bottom"
          >Имена на холсте (N)</VTooltip
        >
      </VBtn>
    </div>

    <div class="tb-status">{{ status }}</div>
  </div>
</template>

<style scoped>
  .toolbar {
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 8px;
    pointer-events: none;
  }
  .tb-group {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 2px;
    background: rgba(20, 20, 36, 0.92);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    padding: 3px;
    color: rgba(255, 255, 255, 0.85);
  }
  .tb-sep {
    width: 1px;
    height: 18px;
    background: rgba(255, 255, 255, 0.14);
    margin: 0 3px;
  }
  .tb-status {
    pointer-events: auto;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: rgba(255, 255, 255, 0.85);
    background: rgba(20, 20, 36, 0.8);
    border-radius: 8px;
    padding: 4px 10px;
  }
</style>
