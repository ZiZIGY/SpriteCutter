<script setup lang="ts">
  import { ref, watch } from 'vue';
  import { useSpriteStore } from '@/stores/spriteStore';

  const store = useSpriteStore();
  const formRef = ref();

  const pending = ref({
    cellWidth: store.cellWidth,
    cellHeight: store.cellHeight,
    offsetX: store.offsetX,
    offsetY: store.offsetY,
    gapX: store.gapX,
    gapY: store.gapY,
    cols: Math.floor(store.imageWidth / store.cellWidth) || 1,
    rows: Math.floor(store.imageHeight / store.cellHeight) || 1,
  });

  let syncLock = false;
  watch(
    () => pending.value.cellWidth,
    (v) => {
      if (syncLock || !v || !store.imageWidth) return;
      syncLock = true;
      pending.value.cols = Math.floor(store.imageWidth / v);
      syncLock = false;
    }
  );
  watch(
    () => pending.value.cellHeight,
    (v) => {
      if (syncLock || !v || !store.imageHeight) return;
      syncLock = true;
      pending.value.rows = Math.floor(store.imageHeight / v);
      syncLock = false;
    }
  );
  watch(
    () => pending.value.cols,
    (v) => {
      if (syncLock || !v || !store.imageWidth) return;
      syncLock = true;
      pending.value.cellWidth = Math.floor(store.imageWidth / v);
      syncLock = false;
    }
  );
  watch(
    () => pending.value.rows,
    (v) => {
      if (syncLock || !v || !store.imageHeight) return;
      syncLock = true;
      pending.value.cellHeight = Math.floor(store.imageHeight / v);
      syncLock = false;
    }
  );

  const rules = {
    cellW: [
      (v: number) => v >= 1 || 'Минимум 1',
      (v: number) => v <= store.imageWidth || `Макс. ${store.imageWidth}`,
    ],
    cellH: [
      (v: number) => v >= 1 || 'Минимум 1',
      (v: number) => v <= store.imageHeight || `Макс. ${store.imageHeight}`,
    ],
    offset: [(v: number) => v >= 0 || 'Минимум 0'],
    gap: [(v: number) => v >= 0 || 'Минимум 0'],
    cols: [
      (v: number) => v >= 1 || 'Минимум 1',
      (v: number) => v <= store.imageWidth || `Макс. ${store.imageWidth}`,
    ],
    rows: [
      (v: number) => v >= 1 || 'Минимум 1',
      (v: number) => v <= store.imageHeight || `Макс. ${store.imageHeight}`,
    ],
  };

  const waitFrame = () =>
    new Promise<void>((r) => requestAnimationFrame(() => r()));

  async function apply() {
    const { valid } = await formRef.value.validate();
    if (!valid) return;

    store.isApplying = true;
    await waitFrame();

    store.cellWidth = pending.value.cellWidth;
    store.cellHeight = pending.value.cellHeight;
    store.offsetX = pending.value.offsetX;
    store.offsetY = pending.value.offsetY;
    store.gapX = pending.value.gapX;
    store.gapY = pending.value.gapY;
    store.selectedCells.clear();

    await waitFrame();
    store.isApplying = false;
  }
</script>

<template>
  <VForm
    ref="formRef"
    @submit.prevent="apply"
  >
    <p class="field-label">Размер ячейки</p>
    <div class="two-col mb-3">
      <VNumberInput
        v-model="pending.cellWidth"
        controlVariant="stacked"
        density="compact"
        variant="outlined"
        hideDetails="auto"
        :min="1"
        :rules="rules.cellW"
      />
      <VNumberInput
        v-model="pending.cellHeight"
        controlVariant="stacked"
        density="compact"
        variant="outlined"
        hideDetails="auto"
        :min="1"
        :rules="rules.cellH"
      />
    </div>

    <p class="field-label">Отступ от края</p>
    <div class="two-col mb-3">
      <VNumberInput
        v-model="pending.offsetX"
        controlVariant="stacked"
        density="compact"
        variant="outlined"
        hideDetails="auto"
        :min="0"
        :rules="rules.offset"
      />
      <VNumberInput
        v-model="pending.offsetY"
        controlVariant="stacked"
        density="compact"
        variant="outlined"
        hideDetails="auto"
        :min="0"
        :rules="rules.offset"
      />
    </div>

    <p class="field-label">Зазор между ячейками</p>
    <div class="two-col mb-4">
      <VNumberInput
        v-model="pending.gapX"
        controlVariant="stacked"
        density="compact"
        variant="outlined"
        hideDetails="auto"
        :min="0"
        :rules="rules.gap"
      />
      <VNumberInput
        v-model="pending.gapY"
        controlVariant="stacked"
        density="compact"
        variant="outlined"
        hideDetails="auto"
        :min="0"
        :rules="rules.gap"
      />
    </div>

    <VDivider class="mb-3" />

    <p class="field-label">По числу ячеек</p>
    <div class="two-col mb-4">
      <VNumberInput
        v-model="pending.cols"
        controlVariant="stacked"
        density="compact"
        variant="outlined"
        hideDetails="auto"
        :min="1"
        :rules="rules.cols"
      />
      <VNumberInput
        v-model="pending.rows"
        controlVariant="stacked"
        density="compact"
        variant="outlined"
        hideDetails="auto"
        :min="1"
        :rules="rules.rows"
      />
    </div>

    <VBtn
      type="submit"
      color="primary"
      block
      size="small"
      :loading="store.isApplying"
      prependIcon="mdi-check"
    >
      Применить
    </VBtn>
  </VForm>
</template>

<style scoped>
  .two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .field-label {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.45);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 6px;
    margin-top: 0;
  }
</style>
