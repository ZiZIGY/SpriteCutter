<script setup lang="ts">
  import { computed, watch } from 'vue';
  import { useVirtualList, useActiveElement } from '@vueuse/core';
  import { useSpriteStore } from '@/stores/spriteStore';

  const ITEM_HEIGHT = 38;

  const store = useSpriteStore();

  const namedCells = computed(() =>
    store.activeCells
      .filter((cell) => cell.selected && !cell.excluded)
      .slice()
      .sort((a, b) => a.row - b.row || a.col - b.col)
  );

  const hasNames = computed(() => Object.keys(store.cellNames).length > 0);

  const { list, containerProps, wrapperProps } = useVirtualList(namedCells, {
    itemHeight: ITEM_HEIGHT,
    overscan: 5,
  });

  const activeElement = useActiveElement();

  watch(activeElement, (el) => {
    const row = el?.closest<HTMLElement>('[data-cell]')?.dataset.cell ?? null;
    store.focusedCell = row;
  });

  function defaultName(cell: { col: number; row: number }) {
    return `sprite_${String(cell.row).padStart(2, '0')}_${String(cell.col).padStart(2, '0')}`;
  }
</script>

<template>
  <VCheckbox
    v-model="store.showNames"
    density="compact"
    hideDetails
    color="primary"
    class="ml-n1 mb-3"
  >
    <template #label>
      <span class="text-body-2 ml-2">Имена на сетке</span>
    </template>
  </VCheckbox>

  <div
    v-if="namedCells.length === 0"
    class="text-caption text-disabled"
  >
    Выдели ячейки на холсте, чтобы задать им имена
  </div>

  <template v-else>
    <div
      v-bind="containerProps"
      class="names-container mb-3"
    >
      <div v-bind="wrapperProps">
        <div
          v-for="{ data: cell } in list"
          :key="`${cell.col}_${cell.row}`"
          class="name-row"
          :style="{ height: `${ITEM_HEIGHT}px` }"
          :data-cell="`${cell.col}_${cell.row}`"
        >
          <span class="coord-chip">{{ cell.col }},{{ cell.row }}</span>
          <VTextField
            :model-value="cell.name"
            density="compact"
            variant="outlined"
            hideDetails
            :placeholder="defaultName(cell)"
            @update:model-value="
              (v: string) => store.setCellName(cell.col, cell.row, v)
            "
          />
        </div>
      </div>
    </div>

    <VBtn
      v-if="hasNames"
      size="small"
      variant="tonal"
      color="error"
      block
      prependIcon="mdi-restore"
      @click="store.resetCellNames()"
    >
      Сбросить имена
    </VBtn>
  </template>
</template>

<style scoped>
  .names-container {
    max-height: 320px;
    overflow-y: auto;
  }
  .name-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 0;
    box-sizing: border-box;
  }
  .coord-chip {
    flex-shrink: 0;
    width: 44px;
    font-size: 10px;
    font-variant-numeric: tabular-nums;
    color: rgba(255, 255, 255, 0.45);
    text-align: center;
  }
</style>
