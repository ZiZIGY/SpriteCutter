<script setup lang="ts">
  import { ref, watch, useTemplateRef } from 'vue';
  import { useSpriteStore } from '@/stores/spriteStore';
  import { autoDetect, sampleBgHex } from '@/composables/useAutoDetect';

  const store = useSpriteStore();
  const formRef = useTemplateRef('formRef');

  // ── auto-detect settings ────────────────────────────────────────────────────
  const bgColor = ref('#000000');
  const bgTolerance = ref(30);
  const bgPickerOpen = ref(false);

  watch(
    () => store.imageSrc,
    async (src) => {
      if (!src) return;
      try {
        bgColor.value = await sampleBgHex(src, store.imageWidth, store.imageHeight);
      } catch {
        // keep default
      }
    },
    { immediate: true }
  );

  // ── grid form state ─────────────────────────────────────────────────────────
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
    (value) => {
      if (syncLock || !value || !store.imageWidth) return;
      syncLock = true;
      pending.value.cols = Math.floor(store.imageWidth / value);
      syncLock = false;
    }
  );
  watch(
    () => pending.value.cellHeight,
    (value) => {
      if (syncLock || !value || !store.imageHeight) return;
      syncLock = true;
      pending.value.rows = Math.floor(store.imageHeight / value);
      syncLock = false;
    }
  );
  watch(
    () => pending.value.cols,
    (value) => {
      if (syncLock || !value || !store.imageWidth) return;
      syncLock = true;
      pending.value.cellWidth = Math.floor(store.imageWidth / value);
      syncLock = false;
    }
  );
  watch(
    () => pending.value.rows,
    (value) => {
      if (syncLock || !value || !store.imageHeight) return;
      syncLock = true;
      pending.value.cellHeight = Math.floor(store.imageHeight / value);
      syncLock = false;
    }
  );

  const rules = {
    cellW: [
      (value: number) => value >= 1 || 'Минимум 1',
      (value: number) =>
        value <= store.imageWidth || `Макс. ${store.imageWidth}`,
    ],
    cellH: [
      (value: number) => value >= 1 || 'Минимум 1',
      (value: number) =>
        value <= store.imageHeight || `Макс. ${store.imageHeight}`,
    ],
    offset: [(value: number) => value >= 0 || 'Минимум 0'],
    gap: [(value: number) => value >= 0 || 'Минимум 0'],
    cols: [
      (value: number) => value >= 1 || 'Минимум 1',
      (value: number) =>
        value <= store.imageWidth || `Макс. ${store.imageWidth}`,
    ],
    rows: [
      (value: number) => value >= 1 || 'Минимум 1',
      (value: number) =>
        value <= store.imageHeight || `Макс. ${store.imageHeight}`,
    ],
  };

  const waitFrame = () =>
    new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  const detecting = ref(false);
  const detectFailed = ref(false);

  async function detect() {
    if (!store.imageSrc) return;
    detecting.value = true;
    detectFailed.value = false;
    try {
      const result = await autoDetect(
        store.imageSrc,
        store.imageWidth,
        store.imageHeight,
        bgColor.value,
        bgTolerance.value,
      );
      if (!result) {
        detectFailed.value = true;
        return;
      }
      syncLock = true;
      pending.value.cellWidth = result.cellWidth;
      pending.value.cellHeight = result.cellHeight;
      pending.value.offsetX = result.offsetX;
      pending.value.offsetY = result.offsetY;
      pending.value.gapX = result.gapX;
      pending.value.gapY = result.gapY;
      pending.value.cols = result.cols;
      pending.value.rows = result.rows;
      syncLock = false;
      await apply();
      store.resetCellOffsets();
      for (const [key, offset] of Object.entries(result.cellOffsets)) {
        const [col, row] = key.split('_').map(Number);
        store.setCellOffset(col, row, offset);
      }
    } finally {
      detecting.value = false;
    }
  }

  async function apply() {
    const { valid } = await formRef.value!.validate();
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
    <!-- ── auto-detect section ────────────────────────────────────────── -->
    <p class="text-overline text-medium-emphasis mb-2">Автоопределение</p>

    <div class="two-col mb-2">
      <!-- Background color picker -->
      <div>
        <p class="field-label">Цвет фона</p>
        <VMenu
          v-model="bgPickerOpen"
          :close-on-content-click="false"
          location="right"
        >
          <template #activator="{ props: mp }">
            <VBtn
              variant="outlined"
              size="small"
              block
              v-bind="mp"
              class="justify-start"
              style="text-transform: none; font-family: monospace; font-size: 11px"
            >
              <span
                class="color-swatch mr-2"
                :style="{ background: bgColor }"
              />
              {{ bgColor.toUpperCase() }}
              <VIcon
                end
                size="14"
              >mdi-menu-down</VIcon>
            </VBtn>
          </template>
          <VCard
            rounded="lg"
            elevation="8"
            style="overflow: hidden"
          >
            <VColorPicker
              :model-value="bgColor"
              mode="hex"
              :modes="['hex']"
              hide-canvas
              hide-inputs
              show-swatches
              :swatches="[
                ['#000000', '#0a0a0a', '#111111', '#1a1a1a'],
                ['#FFFFFF', '#f0f0f0', '#cccccc', '#999999'],
                ['#ff00ff', '#00ff00', '#0000ff', '#ff0000'],
              ]"
              @update:modelValue="(v: string) => (bgColor = v.slice(0, 7))"
            />
            <VCardActions class="pt-0">
              <VSpacer />
              <VBtn
                size="x-small"
                variant="tonal"
                @click="bgPickerOpen = false"
              >
                Готово
              </VBtn>
            </VCardActions>
          </VCard>
        </VMenu>
      </div>

      <!-- Tolerance -->
      <div>
        <p class="field-label">Допуск</p>
        <VNumberInput
          v-model="bgTolerance"
          controlVariant="stacked"
          density="compact"
          variant="outlined"
          hideDetails
          :min="1"
          :max="200"
        />
      </div>
    </div>

    <VBtn
      variant="tonal"
      color="secondary"
      block
      size="small"
      class="mb-3"
      :loading="detecting"
      prependIcon="mdi-auto-fix"
      @click="detect"
    >
      Найти спрайты
    </VBtn>

    <VAlert
      v-if="detectFailed"
      type="warning"
      variant="tonal"
      density="compact"
      rounded="lg"
      class="mb-3 text-caption"
      closable
      @click:close="detectFailed = false"
    >
      Не удалось найти спрайты — скорректируй цвет фона или допуск
    </VAlert>

    <VDivider class="mb-3" />

    <!-- ── manual grid params ────────────────────────────────────────── -->
    <p class="text-overline text-medium-emphasis mb-1">Размер ячейки</p>
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

    <p class="text-overline text-medium-emphasis mb-1">Отступ от края</p>
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

    <p class="text-overline text-medium-emphasis mb-1">Зазор между ячейками</p>
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

    <p class="text-overline text-medium-emphasis mb-1">По числу ячеек</p>
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
    margin-bottom: 4px;
  }
  .color-swatch {
    width: 14px;
    height: 14px;
    border-radius: 3px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    flex-shrink: 0;
    display: inline-block;
  }
</style>
