<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useSpriteStore } from '@/stores/spriteStore';
  import { useUiStore } from '@/stores/uiStore';
  import type { AlignMode } from '@/utils/render/align';
  import { paintFrame } from '@/utils/render/frames';
  import { canvasToBlob, downloadBlob } from '@/utils/download';
  import AnimPreview from '@/components/AnimPreview.vue';
  import AnimPlayer from './AnimPlayer.vue';
  import AnimTimeline from './AnimTimeline.vue';

  const store = useSpriteStore();
  const ui = useUiStore();

  const activeId = ref<number | null>(null);
  const frame = ref(0);
  const playing = ref(true);

  const active = computed(
    () => store.animations.find((a) => a.id === activeId.value) ?? null
  );

  // Keep a valid animation open as they come and go.
  watch(
    () => store.animations.map((a) => a.id),
    (ids) => {
      if (activeId.value === null || !ids.includes(activeId.value)) {
        activeId.value = ids[0] ?? null;
        frame.value = 0;
      }
    },
    { immediate: true }
  );

  const alignModes: { value: AlignMode; label: string; hint: string }[] = [
    {
      value: 'match',
      label: 'Авто',
      hint: 'Кадры совмещаются по форме: тело стоит на месте, хвосты и искры не дёргают кадр.',
    },
    {
      value: 'centroid',
      label: 'Центр масс',
      hint: 'У всех кадров совпадает центр масс.',
    },
    {
      value: 'bottom',
      label: 'По низу',
      hint: 'Нижний край на одной линии, по горизонтали — центр масс. Для персонажей на земле.',
    },
    {
      value: 'source',
      label: 'Как в исходнике',
      hint: 'Кадр стоит там же, где в своей ячейке исходника: прыжок или выпад сохраняются.',
    },
    {
      value: 'none',
      label: 'Нет',
      hint: 'Каждый кадр отдельно, как иконки: обрезан и отцентрован сам по себе.',
    },
  ];
  const alignHint = computed(
    () => alignModes.find((m) => m.value === active.value?.align)?.hint ?? ''
  );

  const loopModes = [
    { value: 'loop', icon: 'mdi-repeat', label: 'Цикл' },
    { value: 'pingpong', icon: 'mdi-swap-horizontal', label: 'Туда-обратно' },
    { value: 'once', icon: 'mdi-arrow-right', label: 'Один раз' },
  ] as const;

  const nudged = computed(() => Object.keys(active.value?.nudge ?? {}).length);
  const currentId = computed(() => {
    const a = active.value;
    const f = store.frames;
    if (!a || !f) return undefined;
    const ids = a.frames.filter((id) => f.byId.has(id));
    return ids[Math.min(frame.value, ids.length - 1)];
  });

  function createFromSelection() {
    const a = store.addAnimationFromSelection();
    if (a) activeId.value = a.id;
  }

  function createFromRows() {
    const made = store.addAnimationsFromRows();
    if (made.length) activeId.value = made[0].id;
    else ui.notify('Нет рядов из двух и более спрайтов вне анимаций');
  }

  function open(id: number) {
    activeId.value = id;
    frame.value = 0;
  }

  function remove(id: number) {
    store.removeAnimation(id);
  }

  /** The animation as a one-row strip, frames exactly as on the sheet. */
  async function downloadStrip() {
    const a = active.value;
    const f = store.frames;
    if (!a || !f) return;
    const ids = a.frames.filter((id) => f.byId.has(id));
    if (!ids.length) return;
    const canvas = document.createElement('canvas');
    canvas.width = f.width * ids.length;
    canvas.height = f.height;
    const ctx = canvas.getContext('2d')!;
    ids.forEach((id, i) => paintFrame(ctx, f, f.byId.get(id)!, i * f.width, 0));
    const fmt = store.exportOptions.format;
    const name = (a.name || 'animation').replace(/[\\/:*?"<>|]+/g, '_');
    downloadBlob(await canvasToBlob(canvas, fmt), `${name}.${fmt}`);
  }
</script>

<template>
  <div class="anim-view">
    <aside class="anim-list">
      <div class="list-actions">
        <VBtn
          block
          size="small"
          variant="tonal"
          color="primary"
          prependIcon="mdi-plus"
          :disabled="!store.selected.size"
          @click="createFromSelection"
        >
          Из выделенных ({{ store.selected.size }})
        </VBtn>
        <VBtn
          block
          size="small"
          variant="tonal"
          prependIcon="mdi-table-row"
          @click="createFromRows"
        >
          Из рядов
        </VBtn>
        <VSwitch
          v-model="store.animPrefs.autoRows"
          density="compact"
          hideDetails
          color="primary"
          class="auto-switch"
        >
          <template #label>
            <span class="text-body-small">Ряд = анимация (автоматически)</span>
          </template>
        </VSwitch>
      </div>

      <div class="list-body">
        <div
          v-for="a in store.animations"
          :key="a.id"
          class="anim-item"
          :class="{ active: a.id === activeId }"
          @click="open(a.id)"
        >
          <AnimPreview
            :frames="a.frames"
            :fps="a.fps"
            :size="44"
          />
          <div class="anim-meta">
            <div class="anim-name">{{ a.name || 'без имени' }}</div>
            <div class="anim-sub">{{ a.frames.length }} кадр. · {{ a.fps }} fps</div>
          </div>
          <VBtn
            icon="mdi-delete-outline"
            size="x-small"
            variant="text"
            color="error"
            @click.stop="remove(a.id)"
          />
        </div>
        <p
          v-if="!store.animations.length"
          class="list-empty"
        >
          Пока нет анимаций.
        </p>
      </div>
    </aside>

    <section
      v-if="active"
      class="anim-main"
    >
      <div class="head-row">
        <VTextField
          v-model="active.name"
          label="Название"
          density="compact"
          variant="outlined"
          hideDetails
          class="name-field"
        />
        <VNumberInput
          v-model="active.fps"
          label="Кадров/с"
          controlVariant="stacked"
          density="compact"
          variant="outlined"
          hideDetails
          :min="1"
          :max="60"
          class="fps-field"
        />
        <VBtnToggle
          v-model="active.loop"
          mandatory
          divided
          density="compact"
          variant="outlined"
          class="tight-toggle"
        >
          <VBtn
            v-for="m in loopModes"
            :key="m.value"
            :value="m.value"
            :prependIcon="m.icon"
            >{{ m.label }}</VBtn
          >
        </VBtnToggle>
        <VSpacer />
        <VBtn
          size="small"
          variant="tonal"
          prependIcon="mdi-download"
          @click="downloadStrip"
          >Лента {{ store.exportOptions.format.toUpperCase() }}</VBtn
        >
      </div>

      <div class="align-row">
        <span class="field-label">Выравнивание кадров</span>
        <VBtnToggle
          v-model="active.align"
          mandatory
          divided
          density="compact"
          variant="outlined"
          color="primary"
          class="tight-toggle"
        >
          <VBtn
            v-for="m in alignModes"
            :key="m.value"
            :value="m.value"
            >{{ m.label }}</VBtn
          >
        </VBtnToggle>
        <span class="hint">{{ alignHint }}</span>
      </div>

      <AnimPlayer
        v-model:frame="frame"
        v-model:playing="playing"
        :anim="active"
      />

      <div class="nudge-row">
        <span class="hint">
          Подгонка вручную: тяните кадр в окне просмотра или Shift+стрелки
          (Ctrl — по 5 px). ← → — кадры, пробел — пауза.
        </span>
        <VSpacer />
        <VBtn
          v-if="currentId !== undefined && active.nudge[currentId]"
          size="x-small"
          variant="text"
          prependIcon="mdi-restore"
          @click="store.resetNudge(active.id, currentId)"
          >Сдвиг кадра</VBtn
        >
        <VBtn
          v-if="nudged"
          size="x-small"
          variant="text"
          prependIcon="mdi-restore"
          @click="store.resetNudge(active.id)"
          >Все сдвиги ({{ nudged }})</VBtn
        >
      </div>

      <AnimTimeline
        v-model:frame="frame"
        :anim="active"
        @pick="playing = false"
      />
    </section>

    <section
      v-else
      class="anim-empty"
    >
      <VIcon
        size="56"
        color="primary"
        >mdi-filmstrip</VIcon
      >
      <p class="text-title-medium mt-3">Анимаций пока нет</p>
      <p class="hint empty-text">
        Лист-анимация обычно нарисован рядами: один ряд — одна анимация.
        Кадры анимации выравниваются вместе — общий масштаб и привязка, — чтобы
        при проигрывании ничего не прыгало.
      </p>
      <div class="d-flex ga-2 mt-2">
        <VBtn
          color="primary"
          prependIcon="mdi-table-row"
          @click="createFromRows"
          >Сделать из рядов</VBtn
        >
        <VBtn
          variant="tonal"
          prependIcon="mdi-plus"
          :disabled="!store.selected.size"
          @click="createFromSelection"
          >Из выделенных ({{ store.selected.size }})</VBtn
        >
      </div>
    </section>
  </div>
</template>

<style scoped>
  .anim-view {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 240px minmax(0, 1fr);
    gap: 12px;
  }
  .anim-list {
    min-height: 0;
    display: flex;
    flex-direction: column;
    border-radius: 12px;
    border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
    background: rgb(var(--v-theme-surface));
    overflow: hidden;
  }
  .list-actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
    border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  }
  .list-actions :deep(.v-btn) {
    text-transform: none;
    letter-spacing: normal;
  }
  .auto-switch :deep(.v-selection-control) {
    min-height: 32px;
  }
  .list-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 6px;
  }
  .list-empty {
    padding: 12px 6px;
    font-size: 12px;
    color: rgba(var(--v-theme-on-surface), 0.55);
  }
  .anim-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px;
    border-radius: 8px;
    border: 1px solid transparent;
    cursor: pointer;
  }
  .anim-item:hover {
    background: rgba(var(--v-theme-on-surface), 0.05);
  }
  .anim-item.active {
    border-color: rgb(var(--v-theme-primary));
    background: rgba(var(--v-theme-primary), 0.08);
  }
  .anim-meta {
    flex: 1;
    min-width: 0;
  }
  .anim-name {
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .anim-sub {
    font-size: 11px;
    color: rgba(var(--v-theme-on-surface), 0.6);
  }
  .anim-main {
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .head-row,
  .align-row,
  .nudge-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }
  .name-field {
    max-width: 240px;
  }
  .fps-field {
    width: 120px;
    flex: 0 0 auto;
  }
  .tight-toggle :deep(.v-btn) {
    text-transform: none;
    letter-spacing: normal;
  }
  .field-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgba(var(--v-theme-on-surface), 0.6);
  }
  .hint {
    font-size: 12px;
    color: rgba(var(--v-theme-on-surface), 0.6);
  }
  .anim-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    border-radius: 12px;
    background: rgba(var(--v-theme-on-surface), 0.04);
    padding: 24px;
  }
  .empty-text {
    max-width: 460px;
  }
  .anim-empty :deep(.v-btn) {
    text-transform: none;
    letter-spacing: normal;
  }
</style>
