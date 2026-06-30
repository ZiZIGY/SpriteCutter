<script setup lang="ts">
  import { ref, computed } from 'vue';
  import { useSpriteStore } from '@/stores/spriteStore';
  import GridSettingsForm from './GridSettingsForm.vue';

  const store = useSpriteStore();
  const colorPickerOpen = ref(false);

  function onModeChange(mode: string | string[]) {
    if (mode === 'free' && store.freeLines.length === 0)
      store.initFreeGridFromUniform();
  }

  const sortedLines = computed(() =>
    [...store.freeLines].sort(
      (a, b) => a.axis.localeCompare(b.axis) || a.position - b.position
    )
  );

  const hasOffsets = computed(() => Object.keys(store.cellOffsets).length > 0);

  // VColorPicker возвращает #RRGGBBAA — обрезаем до #RRGGBB
  function onColorPick(value: string) {
    store.gridColor = value.slice(0, 7);
  }
</script>

<template>
  <VBtnToggle
    v-model="store.gridMode"
    mandatory
    density="compact"
    color="primary"
    rounded="lg"
    style="width: 100%"
    class="mb-4"
    @update:modelValue="onModeChange"
  >
    <VBtn
      value="uniform"
      size="small"
      style="flex: 1"
    >
      <VIcon
        start
        size="16"
        >mdi-grid</VIcon
      >Равномерная
    </VBtn>
    <VBtn
      value="free"
      size="small"
      style="flex: 1"
    >
      <VIcon
        start
        size="16"
        >mdi-gesture</VIcon
      >Свободная
    </VBtn>
  </VBtnToggle>

  <GridSettingsForm v-if="store.gridMode === 'uniform'" />

  <template v-else>
    <VAlert
      type="info"
      variant="tonal"
      density="compact"
      class="mb-3 text-caption"
      rounded="lg"
    >
      Тяните линии на холсте. Двойной клик — добавить линию.
    </VAlert>

    <div class="two-col mb-3">
      <VBtn
        block
        size="small"
        variant="tonal"
        color="warning"
        prependIcon="mdi-arrow-split-vertical"
        @click="store.addFreeLine('x', Math.round(store.imageWidth / 2))"
        >Верт.</VBtn
      >
      <VBtn
        block
        size="small"
        variant="tonal"
        color="warning"
        prependIcon="mdi-arrow-split-horizontal"
        @click="store.addFreeLine('y', Math.round(store.imageHeight / 2))"
        >Гор.</VBtn
      >
    </div>

    <VList
      density="compact"
      lines="one"
      rounded="lg"
      class="bg-surface-variant"
      maxHeight="180"
      style="overflow-y: auto"
    >
      <VListItem
        v-for="line in sortedLines"
        :key="line.id"
        :prependIcon="
          line.axis === 'x'
            ? 'mdi-arrow-split-vertical'
            : 'mdi-arrow-split-horizontal'
        "
        density="compact"
        rounded="lg"
      >
        <VListItemTitle class="text-caption">
          {{ line.axis === 'x' ? 'Верт.' : 'Гор.' }} · {{ line.position }}px
        </VListItemTitle>
        <template #append>
          <VBtn
            icon
            size="x-small"
            variant="text"
            color="error"
            @click="store.removeFreeLine(line.id)"
          >
            <VIcon size="14">mdi-close</VIcon>
          </VBtn>
        </template>
      </VListItem>
      <VListItem
        v-if="!store.freeLines.length"
        density="compact"
      >
        <VListItemTitle class="text-caption text-disabled"
          >Линий нет</VListItemTitle
        >
      </VListItem>
    </VList>
  </template>

  <!-- ─── Цвет линий сетки ─────────────────────────────────── -->
  <VDivider class="my-4" />

  <p class="field-label">Цвет линий</p>

  <div class="color-row mb-3">
    <VMenu
      v-model="colorPickerOpen"
      :close-on-content-click="false"
      location="right"
    >
      <template #activator="{ props: menuProps }">
        <button
          class="color-trigger"
          v-bind="menuProps"
        >
          <span
            class="color-dot"
            :style="{ background: store.gridColor }"
          />
          <span class="color-hex">{{ store.gridColor.toUpperCase() }}</span>
          <VIcon
            size="14"
            class="color-chevron"
            >mdi-chevron-down</VIcon
          >
        </button>
      </template>

      <VCard
        rounded="lg"
        elevation="8"
        style="overflow: hidden"
      >
        <VColorPicker
          :model-value="store.gridColor"
          mode="hex"
          :modes="['hex', 'hsl']"
          hide-canvas
          show-swatches
          :swatches="[
            ['#7C3AED', '#4F46E5', '#2563EB', '#0891B2'],
            ['#059669', '#D97706', '#DC2626', '#DB2777'],
            ['#FFFFFF', '#94A3B8', '#475569', '#1E293B'],
          ]"
          @update:modelValue="onColorPick"
        />
        <div class="color-picker-footer">
          <VBtn
            size="x-small"
            variant="text"
            color="primary"
            @click="
              store.gridColor = '#7C3AED';
              colorPickerOpen = false;
            "
          >
            <VIcon
              start
              size="13"
              >mdi-restore</VIcon
            >По умолчанию
          </VBtn>
          <VBtn
            size="x-small"
            variant="tonal"
            color="primary"
            @click="colorPickerOpen = false"
          >
            Готово
          </VBtn>
        </div>
      </VCard>
    </VMenu>
  </div>

  <p class="field-label">Прозрачность линий</p>
  <div class="opacity-row mb-1">
    <VSlider
      v-model="store.gridOpacity"
      :min="0.05"
      :max="1"
      :step="0.01"
      color="primary"
      density="compact"
      hideDetails
      class="flex-1"
    />
    <span class="opacity-value text-caption text-disabled"
      >{{ Math.round(store.gridOpacity * 100) }}%</span
    >
  </div>

  <!-- ─── Режим смещений ───────────────────────────────────── -->
  <VDivider class="my-4" />

  <p class="field-label">Смещение ячеек</p>

  <VCheckbox
    v-model="store.showOffsets"
    color="warning"
    density="compact"
    hideDetails
    class="mb-3 offset-check"
  >
    <template #label>
      <span class="text-body-2 ml-2">Режим смещений</span>
    </template>
  </VCheckbox>

  <Transition name="slide">
    <div
      v-if="store.showOffsets"
      class="mt-2"
    >
      <VAlert
        type="warning"
        variant="tonal"
        density="compact"
        class="mb-3 text-caption"
        rounded="lg"
      >
        Тяните жёлтые точки на холсте, чтобы сдвинуть каждый спрайт независимо.
      </VAlert>

      <VBtn
        block
        size="small"
        variant="tonal"
        color="error"
        class="mb-2"
        :disabled="!hasOffsets"
        prependIcon="mdi-restore"
        @click="store.resetCellOffsets()"
      >
        Сбросить смещения
        {{ hasOffsets ? `(${Object.keys(store.cellOffsets).length})` : '' }}
      </VBtn>
    </div>
  </Transition>
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

  /* Цвет линий */
  .color-row {
    display: flex;
    align-items: center;
  }

  .color-trigger {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    cursor: pointer;
    width: 100%;
    color: inherit;
    transition:
      background 0.15s,
      border-color 0.15s;
  }
  .color-trigger:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.22);
  }

  .color-dot {
    width: 18px;
    height: 18px;
    border-radius: 4px;
    flex-shrink: 0;
    border: 1px solid rgba(255, 255, 255, 0.18);
  }

  .color-hex {
    font-size: 12px;
    font-family: monospace;
    color: rgba(255, 255, 255, 0.75);
    flex: 1;
    text-align: left;
  }

  .color-chevron {
    color: rgba(255, 255, 255, 0.4);
    flex-shrink: 0;
  }

  .color-picker-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 12px 10px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  /* Прозрачность */
  .opacity-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .opacity-value {
    min-width: 36px;
    text-align: right;
    font-size: 11px;
    flex-shrink: 0;
  }

  /* Смещения */
  .offset-check {
    margin-left: -4px;
  }

  /* Анимация блока смещений */
  .slide-enter-active,
  .slide-leave-active {
    transition:
      opacity 0.2s ease,
      transform 0.2s ease;
  }
  .slide-enter-from,
  .slide-leave-to {
    opacity: 0;
    transform: translateY(-6px);
  }
</style>
