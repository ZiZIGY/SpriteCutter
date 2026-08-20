<script setup lang="ts">
  import { computed, watch } from 'vue';
  import { useSpriteStore } from '@/stores/spriteStore';
  import { useRigStore } from '@/stores/rigStore';

  const store = useSpriteStore();
  const rig = useRigStore();

  /** Cells worth rigging: everything not excluded from the sheet. */
  const options = computed(() => [
    {
      title: 'Всё изображение',
      value: null as string | null,
    },
    ...store.activeCells
      .filter((c) => !c.excluded)
      .map((c) => ({
        title: c.name || `Ячейка ${c.col},${c.row}`,
        value: `${c.col}_${c.row}` as string | null,
      })),
  ]);

  // The select shows "Всё изображение" for a null key, but nothing calls
  // setSource on arrival, so the region would stay 0x0 and every action that
  // needs a region stays disabled. Seed it from the current selection.
  watch(
    () => [store.imageWidth, store.imageHeight] as const,
    ([w, h]) => {
      if (w && h && !rig.region.width) selectSource(rig.sourceCellKey);
    },
    { immediate: true }
  );

  function selectSource(key: string | null) {
    if (key === null) {
      rig.setSource(
        null,
        { x: 0, y: 0, width: store.imageWidth, height: store.imageHeight },
        'sheet'
      );
      return;
    }
    const [col, row] = key.split('_').map(Number);
    const cell = store.activeCells.find((c) => c.col === col && c.row === row);
    if (!cell) return;
    const offset = store.getCellOffset(col, row);
    rig.setSource(
      key,
      {
        x: Math.round(cell.x + offset.x),
        y: Math.round(cell.y + offset.y),
        width: cell.width,
        height: cell.height,
      },
      cell.name || `cell_${col}_${row}`
    );
  }
</script>

<template>
  <p class="text-overline text-medium-emphasis mb-2">Что риггуем</p>
  <VSelect
    :modelValue="rig.sourceCellKey"
    :items="options"
    density="compact"
    variant="outlined"
    hideDetails
    prependInnerIcon="mdi-image-frame"
    @update:modelValue="selectSource"
  />
  <p
    v-if="rig.region.width"
    class="text-caption text-disabled mt-2"
  >
    {{ rig.region.width }}×{{ rig.region.height }} px
  </p>
</template>
