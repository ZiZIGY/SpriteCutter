<script setup lang="ts">
  import { computed, watch } from 'vue';
  import { useSpriteStore } from '@/stores/spriteStore';
  import { useUiStore } from '@/stores/uiStore';
  import { useExport } from '@/composables/useExport';

  const store = useSpriteStore();
  const ui = useUiStore();
  const {
    busy,
    onlySelected,
    list,
    sheetSize,
    exportBundle,
    exportFiles,
    exportSheet,
    exportAtlas,
  } = useExport();

  const open = computed({
    get: () => ui.dialog === 'export',
    set: (v) => (ui.dialog = v ? 'export' : null),
  });

  watch(open, (v) => {
    if (v) onlySelected.value = store.selected.size > 1;
  });

  const cleanup = computed(() => {
    const o = store.output;
    const parts = [];
    if (o.removeBg) parts.push('фон удалён');
    if (o.isolate) parts.push('соседи вырезаны');
    if (o.scale === 'fit') parts.push('вписаны в кадр');
    if (o.scale === 'uniform') parts.push('общий масштаб');
    return parts.join(' · ');
  });

  const unnamed = computed(() => list.value.filter((s) => !s.name).length);
  const skipped = computed(() => store.sprites.length - store.exported.length);

  function showPreview() {
    store.view = 'result';
    open.value = false;
  }
</script>

<template>
  <VDialog
    v-model="open"
    max-width="520"
  >
    <VCard>
      <VCardTitle class="d-flex align-center pt-4 px-5">
        <VIcon
          class="mr-2"
          color="primary"
          >mdi-export-variant</VIcon
        >
        Экспорт
        <VSpacer />
        <VBtn
          icon="mdi-close"
          variant="text"
          size="small"
          @click="open = false"
        />
      </VCardTitle>

      <VCardText class="px-5">
        <div class="summary mb-4">
          <div>
            <b>{{ list.length }}</b> спрайтов · кадр
            <b v-if="store.frames"
              >{{ store.frames.width }}×{{ store.frames.height }}</b
            >
          </div>
          <div
            v-if="cleanup"
            class="hint"
          >
            {{ cleanup }}
          </div>
          <div
            v-if="skipped"
            class="hint mt-1"
          >
            Пропущено: {{ skipped }} — в экспорт не попадут.
          </div>
          <div
            v-if="unnamed"
            class="hint mt-1"
          >
            Без имени: {{ unnamed }} — получат имена sprite_01, sprite_02…
            <a
              href="#"
              @click.prevent="ui.openNames()"
              >Взять имена из текста</a
            >
          </div>
        </div>

        <VSwitch
          v-if="store.selected.size"
          v-model="onlySelected"
          density="compact"
          hideDetails
          color="primary"
          :label="`Только выделенные (${store.selected.size})`"
          class="mb-2"
        />

        <div class="field-label">Формат</div>
        <VBtnToggle
          v-model="store.exportOptions.format"
          mandatory
          divided
          density="compact"
          variant="outlined"
          class="wide-toggle mb-4"
        >
          <VBtn value="png">PNG</VBtn>
          <VBtn value="webp">WebP</VBtn>
        </VBtnToggle>

        <div class="field-label">Раскладка листа</div>
        <div class="d-flex ga-2 align-center mb-1">
          <VBtnToggle
            v-model="store.exportOptions.layout"
            mandatory
            divided
            density="compact"
            variant="outlined"
            class="wide-toggle"
          >
            <VBtn value="rows">Ряды как в исходнике</VBtn>
            <VBtn value="grid">Сетка</VBtn>
          </VBtnToggle>
        </div>
        <div class="two-col mt-2 mb-1">
          <VNumberInput
            v-if="store.exportOptions.layout === 'grid'"
            v-model="store.exportOptions.columns"
            label="Колонок"
            controlVariant="stacked"
            density="compact"
            variant="outlined"
            hideDetails
            :min="1"
          />
          <VNumberInput
            v-model="store.exportOptions.gap"
            label="Зазор, px"
            controlVariant="stacked"
            density="compact"
            variant="outlined"
            hideDetails
            :min="0"
          />
        </div>
        <p
          v-if="sheetSize"
          class="hint mb-4"
        >
          Лист {{ sheetSize.width }}×{{ sheetSize.height }} ·
          <a
            href="#"
            @click.prevent="showPreview"
            >посмотреть результат</a
          >
        </p>

        <div class="btns">
          <VBtn
            color="primary"
            variant="flat"
            size="large"
            block
            prependIcon="mdi-folder-zip-outline"
            :loading="busy === 'bundle'"
            :disabled="!list.length"
            @click="exportBundle"
          >
            Всё одним архивом
          </VBtn>
          <p class="hint text-center mt-n1">
            sprites/*.{{ store.exportOptions.format }} + лист + атлас JSON
          </p>
          <div class="three-col">
            <VBtn
              variant="tonal"
              prependIcon="mdi-image-multiple-outline"
              :loading="busy === 'files'"
              :disabled="!list.length"
              @click="exportFiles"
            >
              Файлы
            </VBtn>
            <VBtn
              variant="tonal"
              prependIcon="mdi-view-grid-outline"
              :loading="busy === 'sheet'"
              :disabled="!list.length"
              @click="exportSheet"
            >
              Лист
            </VBtn>
            <VBtn
              variant="tonal"
              prependIcon="mdi-code-json"
              :loading="busy === 'atlas'"
              :disabled="!list.length"
              @click="exportAtlas"
            >
              Атлас
            </VBtn>
          </div>
        </div>

        <p class="hint mt-4">
          Атлас — TexturePacker JSON Hash (Phaser, PixiJS, Unity) с
          анимациями и координатами каждого спрайта в исходной картинке.
        </p>
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style scoped>
  .summary {
    padding: 10px 12px;
    border-radius: 8px;
    background: rgba(var(--v-theme-on-surface), 0.05);
  }
  .field-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgba(var(--v-theme-on-surface), 0.6);
    margin-bottom: 4px;
  }
  .hint {
    font-size: 12px;
    color: rgba(var(--v-theme-on-surface), 0.6);
  }
  .wide-toggle {
    width: 100%;
  }
  .wide-toggle :deep(.v-btn) {
    flex: 1;
    text-transform: none;
    letter-spacing: normal;
  }
  .two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .three-col {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .three-col :deep(.v-btn) {
    text-transform: none;
    letter-spacing: normal;
  }
  .btns {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .btns > .v-btn {
    text-transform: none;
    letter-spacing: normal;
  }
</style>
