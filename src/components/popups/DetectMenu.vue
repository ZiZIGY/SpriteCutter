<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useDebounceFn } from '@vueuse/core';
  import { useSpriteStore, type DetectMethod } from '@/stores/spriteStore';

  const store = useSpriteStore();
  const open = ref(false);
  const pickerOpen = ref(false);

  // Everything changed while the menu stays open is one undo step.
  let sessionRecorded = false;
  watch(open, (v) => {
    if (v) sessionRecorded = false;
  });

  function rerun(estimateGrid = false) {
    store.redetect({ history: sessionRecorded ? 'keep' : 'push', estimateGrid });
    sessionRecorded = true;
  }
  const rerunSoon = useDebounceFn(() => rerun(), 250);

  function setDetect<K extends keyof typeof store.detect>(
    key: K,
    value: (typeof store.detect)[K]
  ) {
    if (store.detect[key] === value) return;
    store.detect[key] = value;
    rerunSoon();
  }

  function setMethod(m: DetectMethod) {
    store.method = m;
    rerun(m === 'grid');
  }

  function setBackground(hex: string | null) {
    store.setBackground(hex);
    rerunSoon();
  }

  const hasEyeDropper = typeof window !== 'undefined' && 'EyeDropper' in window;

  async function pickFromScreen() {
    try {
      const Dropper = (window as unknown as { EyeDropper: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper;
      const { sRGBHex } = await new Dropper().open();
      setBackground(sRGBHex.slice(0, 7));
    } catch {
      /* cancelled */
    }
  }

  const transparent = computed(
    () => !store.bgOverride && store.analysis?.background.kind === 'transparent'
  );

  // cols/rows are a derived view of the cell size, the same formula the grid
  // generator walks, so editing either pair stays consistent.
  const cols = computed({
    get: () => {
      const g = store.grid;
      return Math.max(
        1,
        Math.floor((store.imageWidth - g.offX + g.gapX) / (g.cellW + g.gapX))
      );
    },
    set: (v: number) => {
      if (!v) return;
      const g = store.grid;
      g.cellW = Math.max(1, Math.floor((store.imageWidth - g.offX + g.gapX) / v) - g.gapX);
      rerunSoon();
    },
  });
  const rows = computed({
    get: () => {
      const g = store.grid;
      return Math.max(
        1,
        Math.floor((store.imageHeight - g.offY + g.gapY) / (g.cellH + g.gapY))
      );
    },
    set: (v: number) => {
      if (!v) return;
      const g = store.grid;
      g.cellH = Math.max(1, Math.floor((store.imageHeight - g.offY + g.gapY) / v) - g.gapY);
      rerunSoon();
    },
  });

  function setGrid(key: keyof typeof store.grid, v: number) {
    store.grid[key] = Math.max(key.startsWith('cell') ? 1 : 0, v || 0);
    rerunSoon();
  }

  const gridFields = [
    { key: 'cellW', label: 'Ширина ячейки' },
    { key: 'cellH', label: 'Высота ячейки' },
    { key: 'offX', label: 'Отступ X' },
    { key: 'offY', label: 'Отступ Y' },
    { key: 'gapX', label: 'Зазор X' },
    { key: 'gapY', label: 'Зазор Y' },
  ] as const;
</script>

<template>
  <VMenu
    v-model="open"
    :close-on-content-click="false"
    location="bottom start"
    offset="6"
  >
    <template #activator="{ props: mp }">
      <VBtn
        v-bind="mp"
        variant="text"
        prependIcon="mdi-auto-fix"
        class="bar-btn"
      >
        Поиск
      </VBtn>
    </template>

    <VCard
      width="360"
      class="menu-card"
    >
      <div class="menu-title">Поиск спрайтов</div>

      <VBtnToggle
        :modelValue="store.method"
        mandatory
        divided
        density="compact"
        variant="outlined"
        class="method-toggle mb-2"
        @update:modelValue="setMethod"
      >
        <VBtn
          value="auto"
          prependIcon="mdi-shape-outline"
          >Объекты</VBtn
        >
        <VBtn
          value="grid"
          prependIcon="mdi-grid"
          >Сетка</VBtn
        >
      </VBtnToggle>
      <p class="hint mb-4">
        <template v-if="store.method === 'auto'">
          Каждый объект на фоне — отдельный спрайт. Подходит для картинок от
          нейросети: ряды разной длины, спрайты разного размера.
        </template>
        <template v-else>
          Одинаковые ячейки — для классических спрайт-листов и анимаций. Пустые
          ячейки пропускаются.
        </template>
      </p>

      <div class="field-label">Фон</div>
      <div class="bg-row mb-3">
        <template v-if="store.bgOverride">
          <span
            class="swatch"
            :style="{ background: store.bgOverride }"
          />
          <code>{{ store.bgOverride.toUpperCase() }}</code>
        </template>
        <template v-else-if="transparent">
          <span class="swatch swatch-clear" />
          <span class="text-body-medium">Прозрачный</span>
        </template>
        <template v-else>
          <span
            v-for="c in store.backgroundColors"
            :key="c"
            class="swatch"
            :style="{ background: c }"
            :title="c"
          />
          <span class="text-body-small text-medium-emphasis">авто</span>
        </template>
        <VSpacer />
        <VBtn
          v-if="hasEyeDropper"
          icon
          size="small"
          variant="text"
          @click="pickFromScreen"
        >
          <VIcon size="18">mdi-eyedropper-variant</VIcon>
          <VTooltip
            activator="parent"
            location="top"
            >Взять цвет фона с экрана</VTooltip
          >
        </VBtn>
        <VMenu
          v-model="pickerOpen"
          :close-on-content-click="false"
          location="end"
        >
          <template #activator="{ props: pp }">
            <VBtn
              v-bind="pp"
              icon
              size="small"
              variant="text"
            >
              <VIcon size="18">mdi-palette-outline</VIcon>
            </VBtn>
          </template>
          <VCard>
            <VColorPicker
              :modelValue="store.bgOverride ?? store.backgroundColors[0] ?? '#FFFFFF'"
              mode="hex"
              :modes="['hex']"
              @update:modelValue="(v: string) => setBackground(v.slice(0, 7))"
            />
          </VCard>
        </VMenu>
        <VBtn
          v-if="store.bgOverride"
          icon
          size="small"
          variant="text"
          @click="setBackground(null)"
        >
          <VIcon size="18">mdi-restore</VIcon>
          <VTooltip
            activator="parent"
            location="top"
            >Определять автоматически</VTooltip
          >
        </VBtn>
      </div>

      <div class="field-label">
        Допуск фона <span class="val">{{ store.detect.tolerance }}</span>
      </div>
      <VSlider
        :modelValue="store.detect.tolerance"
        :min="1"
        :max="150"
        :step="1"
        density="compact"
        hideDetails
        color="primary"
        class="mb-2"
        :disabled="transparent"
        @update:modelValue="(v: number) => setDetect('tolerance', v)"
      />

      <template v-if="store.method === 'auto'">
        <div class="field-label">
          Мин. размер спрайта
          <span class="val">{{ store.detect.minSize }}%</span>
        </div>
        <VSlider
          :modelValue="store.detect.minSize"
          :min="0.5"
          :max="20"
          :step="0.5"
          density="compact"
          hideDetails
          color="primary"
          class="mb-2"
          @update:modelValue="(v: number) => setDetect('minSize', v)"
        />
        <p class="hint mb-3">
          Объекты меньше — искры, осколки, пыль — прилипают к ближайшему
          спрайту или отбрасываются.
        </p>
        <VSwitch
          :modelValue="store.detect.splitTouching"
          density="compact"
          hideDetails
          color="primary"
          label="Разделять слипшиеся спрайты"
          @update:modelValue="(v: boolean | null) => setDetect('splitTouching', !!v)"
        />
        <p class="hint mb-2 mt-n1">
          Соседи, сошедшиеся остриями или свечением, режутся по узкому месту.
          Если делится один спрайт — выключите или объедините части (M).
        </p>
      </template>

      <template v-else>
        <div class="two-col mb-2">
          <VNumberInput
            v-model="cols"
            label="Колонок"
            controlVariant="stacked"
            density="compact"
            variant="outlined"
            hideDetails
            :min="1"
          />
          <VNumberInput
            v-model="rows"
            label="Рядов"
            controlVariant="stacked"
            density="compact"
            variant="outlined"
            hideDetails
            :min="1"
          />
        </div>
        <VExpansionPanels
          variant="accordion"
          class="mb-3"
        >
          <VExpansionPanel elevation="0">
            <VExpansionPanelTitle class="text-body-medium">Точные параметры</VExpansionPanelTitle>
            <VExpansionPanelText>
              <div class="two-col">
                <VNumberInput
                  v-for="f in gridFields"
                  :key="f.key"
                  :modelValue="store.grid[f.key]"
                  :label="f.label"
                  controlVariant="stacked"
                  density="compact"
                  variant="outlined"
                  hideDetails
                  :min="0"
                  @update:modelValue="(v: number) => setGrid(f.key, v)"
                />
              </div>
            </VExpansionPanelText>
          </VExpansionPanel>
        </VExpansionPanels>
      </template>

      <VSwitch
        :modelValue="store.detect.fillHoles"
        density="compact"
        hideDetails
        color="primary"
        label="Удалять фон и внутри контуров"
        @update:modelValue="(v: boolean | null) => setDetect('fillHoles', !!v)"
      />
      <p class="hint mb-2 mt-n1">
        Просвет между луком и тетивой станет прозрачным — но и белки глаз тоже.
      </p>
      <VSwitch
        v-model="store.showMask"
        density="compact"
        hideDetails
        color="primary"
        label="Подсветить фон на холсте"
      />

      <VDivider class="my-3" />
      <div class="d-flex align-center">
        <span class="text-body-medium">
          Найдено: <b>{{ store.sprites.length }}</b> ·
          рядов: <b>{{ store.rowCount }}</b>
        </span>
        <VSpacer />
        <VBtn
          size="small"
          variant="tonal"
          color="primary"
          prependIcon="mdi-refresh"
          @click="rerun(store.method === 'grid')"
        >
          Найти заново
        </VBtn>
      </div>
      <p class="hint mt-2">
        Изменения здесь пересчитывают рамки; ручные правки сбрасываются, имена
        сохраняются. Отменить — Ctrl+Z.
      </p>
    </VCard>
  </VMenu>
</template>

<style scoped>
  .menu-card {
    padding: 16px;
    max-height: calc(100vh - 80px);
    overflow-y: auto;
  }
  .menu-title {
    font-weight: 600;
    margin-bottom: 12px;
  }
  .method-toggle {
    width: 100%;
  }
  .method-toggle :deep(.v-btn) {
    flex: 1;
    text-transform: none;
    letter-spacing: normal;
  }
  .hint {
    font-size: 12px;
    line-height: 1.4;
    color: rgba(var(--v-theme-on-surface), 0.6);
  }
  .field-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgba(var(--v-theme-on-surface), 0.6);
    margin-bottom: 4px;
  }
  .val {
    float: right;
    text-transform: none;
    font-variant-numeric: tabular-nums;
    color: rgb(var(--v-theme-on-surface));
  }
  .bg-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 36px;
  }
  .swatch {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.25);
    display: inline-block;
  }
  .swatch-clear {
    background: repeating-conic-gradient(#bbb 0% 25%, #fff 0% 50%) 0 0 / 8px 8px;
  }
  .two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .bar-btn {
    text-transform: none;
    letter-spacing: normal;
  }
</style>
