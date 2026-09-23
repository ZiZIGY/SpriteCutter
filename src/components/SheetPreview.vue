<script setup lang="ts">
  import { computed, ref, useTemplateRef } from 'vue';
  import { useElementSize } from '@vueuse/core';
  import { useSpriteStore, type Sprite } from '@/stores/spriteStore';
  import { useUiStore } from '@/stores/uiStore';
  import { sheetGeometry, type SheetCell } from '@/utils/render/sheet';
  import FrameView from './FrameView.vue';

  /**
   * The output sheet exactly as export will write it, and the place to shape
   * it: skip sprites or whole rows, leave empty cells, start new rows.
   */
  const store = useSpriteStore();
  const ui = useUiStore();

  const GUTTER = 48;
  const bodyRef = useTemplateRef<HTMLDivElement>('bodyRef');
  const { width: bodyWidth } = useElementSize(bodyRef);

  const plan = computed(() => store.sheetPlan);
  const frame = computed(() => store.frames);
  const gap = computed(() => Math.max(0, Math.round(store.exportOptions.gap)));
  const geo = computed(() =>
    frame.value
      ? sheetGeometry(plan.value, frame.value.width, frame.value.height, gap.value)
      : null
  );

  const zoom = ref<'fit' | number>('fit');
  const fitScale = computed(() => {
    if (!geo.value?.width) return 1;
    const room = bodyWidth.value - GUTTER - 24;
    return Math.min(1, Math.max(0.05, room / geo.value.width));
  });
  const scale = computed(() => (zoom.value === 'fit' ? fitScale.value : zoom.value));
  function zoomBy(k: number) {
    zoom.value = Math.min(4, Math.max(0.05, scale.value * k));
  }

  const info = computed(() => {
    const m = new Map<number, { sprite: Sprite; index: number }>();
    store.sprites.forEach((sprite, index) => m.set(sprite.id, { sprite, index }));
    return m;
  });
  function label(id: number) {
    const it = info.value.get(id);
    if (!it) return '';
    return it.sprite.name || `sprite_${String(it.index + 1).padStart(2, '0')}`;
  }

  const outRows = computed(() => {
    const rows: { row: number; ids: number[] }[] = [];
    for (let r = 0; r < plan.value.rows; r++) rows.push({ row: r, ids: [] });
    for (const c of plan.value.cells) if (c.id !== null) rows[c.row].ids.push(c.id);
    return rows;
  });

  const skipped = computed(() => store.sprites.filter((s) => s.skip).length);
  const edited = computed(() =>
    store.sprites.some((s) => s.gapBefore || s.breakBefore)
  );

  function cellStyle(c: SheetCell) {
    const f = frame.value!;
    const p = geo.value!.at(c);
    const k = scale.value;
    return {
      left: `${p.x * k}px`,
      top: `${p.y * k}px`,
      width: `${f.width * k}px`,
      height: `${f.height * k}px`,
    };
  }

  function onCellClick(id: number, e: MouseEvent) {
    if (e.shiftKey || e.ctrlKey || e.metaKey) store.toggleSelect(id);
    else store.selectOnly(id);
  }

  const cellPx = computed(() => (frame.value ? frame.value.width * scale.value : 0));
</script>

<template>
  <div class="preview">
    <div class="pv-bar">
      <VBtnToggle
        v-model="store.exportOptions.layout"
        mandatory
        divided
        density="compact"
        variant="outlined"
        class="pv-toggle"
      >
        <VBtn
          value="rows"
          prependIcon="mdi-table-row"
          >Ряды как в исходнике</VBtn
        >
        <VBtn
          value="grid"
          prependIcon="mdi-grid"
          >Заполнить сеткой</VBtn
        >
      </VBtnToggle>
      <VNumberInput
        v-if="store.exportOptions.layout === 'grid'"
        v-model="store.exportOptions.columns"
        label="Колонок"
        controlVariant="stacked"
        density="compact"
        variant="outlined"
        hideDetails
        :min="1"
        class="pv-num"
      />
      <VNumberInput
        v-model="store.exportOptions.gap"
        label="Зазор, px"
        controlVariant="stacked"
        density="compact"
        variant="outlined"
        hideDetails
        :min="0"
        class="pv-num"
      />
      <VBtn
        v-if="skipped"
        size="small"
        variant="tonal"
        prependIcon="mdi-eye-outline"
        @click="store.unskipAll()"
      >
        Вернуть пропущенные ({{ skipped }})
      </VBtn>
      <VBtn
        v-if="edited"
        size="small"
        variant="tonal"
        prependIcon="mdi-format-clear"
        @click="store.resetLayout()"
      >
        Сбросить переносы
      </VBtn>
      <VSpacer />
      <span
        v-if="geo"
        class="stat"
      >
        {{ store.exported.length }} кадров · лист {{ geo.width }}×{{ geo.height }}
      </span>
      <div class="zoom">
        <VBtn
          icon="mdi-minus"
          size="x-small"
          variant="text"
          @click="zoomBy(0.8)"
        />
        <span class="zoom-val">{{ Math.round(scale * 100) }}%</span>
        <VBtn
          icon="mdi-plus"
          size="x-small"
          variant="text"
          @click="zoomBy(1.25)"
        />
        <VBtn
          size="x-small"
          :variant="zoom === 'fit' ? 'tonal' : 'text'"
          @click="zoom = 'fit'"
          >По ширине</VBtn
        >
      </div>
      <VBtn
        color="primary"
        variant="flat"
        size="small"
        prependIcon="mdi-export-variant"
        :disabled="!store.exported.length"
        @click="ui.open('export')"
        >Экспорт</VBtn
      >
    </div>

    <div
      ref="bodyRef"
      class="pv-body"
    >
      <div
        v-if="!plan.cells.length || !geo || !frame"
        class="empty"
      >
        Нечего показать — все спрайты пропущены.
      </div>
      <div
        v-else
        class="sheet-wrap"
        :style="{
          width: `${geo.width * scale + GUTTER}px`,
          height: `${geo.height * scale}px`,
        }"
      >
        <div
          v-for="r in outRows"
          :key="r.row"
          class="gutter"
          :style="{
            top: `${r.row * (frame.height + gap) * scale}px`,
            height: `${frame.height * scale}px`,
          }"
        >
          <span class="gutter-num">{{ r.row + 1 }}</span>
          <VBtn
            icon
            size="x-small"
            variant="text"
            :disabled="!r.ids.length"
            @click="store.setSkip(r.ids, true)"
          >
            <VIcon size="15">mdi-eye-off-outline</VIcon>
            <VTooltip
              activator="parent"
              location="end"
              >Пропустить весь ряд</VTooltip
            >
          </VBtn>
        </div>

        <div
          class="sheet"
          :style="{
            left: `${GUTTER}px`,
            width: `${geo.width * scale}px`,
            height: `${geo.height * scale}px`,
          }"
        >
          <div
            v-for="(cell, i) in plan.cells"
            :key="cell.id ?? `gap-${cell.owner}-${i}`"
            class="cell"
            :class="{
              empty: cell.id === null,
              selected: cell.id !== null && store.selected.has(cell.id),
              tiny: cellPx < 64,
            }"
            :style="cellStyle(cell)"
            @click="cell.id !== null && onCellClick(cell.id, $event)"
          >
            <template v-if="cell.id !== null">
              <FrameView
                :id="cell.id"
                :scale="scale"
              />
              <span
                v-if="info.get(cell.id)?.sprite.breakBefore"
                class="break-mark"
                title="Начинает новую строку"
                >↵</span
              >
              <div
                v-if="store.showNames && cellPx >= 48"
                class="cell-name"
              >
                {{ label(cell.id) }}
              </div>
              <div
                class="cell-actions"
                @click.stop
              >
                <button
                  type="button"
                  title="Пропустить (не экспортировать)"
                  @click="store.toggleSkip(cell.id)"
                >
                  <VIcon size="14">mdi-eye-off-outline</VIcon>
                </button>
                <button
                  type="button"
                  title="Пустая ячейка перед этим кадром"
                  @click="store.shiftGap(cell.id, 1)"
                >
                  <VIcon size="14">mdi-keyboard-tab</VIcon>
                </button>
                <button
                  type="button"
                  :class="{ on: info.get(cell.id)?.sprite.breakBefore }"
                  title="Начать новую строку с этого кадра"
                  @click="store.toggleBreak(cell.id)"
                >
                  <VIcon size="14">mdi-keyboard-return</VIcon>
                </button>
              </div>
            </template>
            <button
              v-else
              type="button"
              class="gap-remove"
              title="Убрать пустую ячейку"
              @click.stop="store.shiftGap(cell.owner, -1)"
            >
              <VIcon size="14">mdi-close</VIcon>
            </button>
          </div>
        </div>
      </div>
    </div>

    <p class="hint">
      Так лист выглядит при экспорте. Наведите на кадр: пропустить ·
      пустая ячейка перед ним · начать новую строку. Номер слева — ряд листа.
    </p>
  </div>
</template>

<style scoped>
  .preview {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .pv-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 12px;
    border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
    background: rgb(var(--v-theme-surface));
  }
  .pv-toggle :deep(.v-btn) {
    text-transform: none;
    letter-spacing: normal;
  }
  .pv-num {
    width: 120px;
    flex: 0 0 auto;
  }
  .stat {
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: rgba(var(--v-theme-on-surface), 0.7);
  }
  .zoom {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .zoom-val {
    min-width: 42px;
    text-align: center;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .pv-body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    border-radius: 12px;
    padding: 16px 12px;
    background: rgba(var(--v-theme-on-surface), 0.04);
  }
  .empty {
    padding: 24px;
    text-align: center;
    color: rgba(var(--v-theme-on-surface), 0.6);
  }
  .sheet-wrap {
    position: relative;
    margin: 0 auto;
  }
  .gutter {
    position: absolute;
    left: 0;
    width: 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    border-radius: 8px;
    background: rgba(var(--v-theme-on-surface), 0.05);
  }
  .gutter-num {
    font-size: 12px;
    font-weight: 600;
    color: rgba(var(--v-theme-on-surface), 0.7);
  }
  .sheet {
    position: absolute;
    top: 0;
  }
  .cell {
    position: absolute;
    cursor: pointer;
    background:
      repeating-conic-gradient(rgba(128, 128, 128, 0.22) 0% 25%, transparent 0% 50%)
      0 0 / 12px 12px;
    outline: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  }
  .cell:hover {
    outline-color: rgb(var(--v-theme-primary));
  }
  .cell.selected {
    outline: 2px solid #ffb300;
  }
  .cell.empty {
    background: none;
    outline: 1px dashed rgba(var(--v-theme-on-surface), 0.35);
    cursor: default;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .gap-remove {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(var(--v-theme-on-surface), 0.7);
    background: rgba(var(--v-theme-on-surface), 0.08);
  }
  .gap-remove:hover {
    color: rgb(var(--v-theme-error));
  }
  .break-mark {
    position: absolute;
    left: -14px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 13px;
    color: rgb(var(--v-theme-primary));
  }
  .cell-name {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 1px 4px;
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: #fff;
    background: rgba(16, 20, 32, 0.7);
  }
  .cell-actions {
    position: absolute;
    top: 2px;
    right: 2px;
    display: none;
    gap: 2px;
  }
  .cell:hover .cell-actions {
    display: flex;
  }
  .cell.tiny .cell-actions {
    top: -24px;
    right: auto;
    left: 0;
    z-index: 2;
  }
  .cell-actions button {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    background: rgba(16, 20, 32, 0.85);
  }
  .cell-actions button:hover,
  .cell-actions button.on {
    background: rgb(var(--v-theme-primary));
  }
  .hint {
    flex-shrink: 0;
    text-align: center;
    font-size: 12px;
    color: rgba(var(--v-theme-on-surface), 0.45);
  }
</style>
