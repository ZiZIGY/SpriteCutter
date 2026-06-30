<script setup lang="ts">
  import { useSpriteStore } from '@/stores/spriteStore';
  import { useExport } from '@/composables/useExport';

  const store = useSpriteStore();
  const {
    loading,
    exportAll,
    exportCount,
    availableCount,
    exportSingle,
    exportSheet,
    exportFullSheet,
    exportJSON,
    exportJSONAll,
  } = useExport();
</script>

<template>
  <p class="text-overline text-medium-emphasis mb-1">Формат и зазор</p>
  <div class="two-col mb-3">
    <VSelect
      v-model="store.exportFormat"
      :items="['png', 'webp']"
      density="compact"
      variant="outlined"
      hideDetails
    />
    <VNumberInput
      v-model="store.exportGap"
      controlVariant="stacked"
      density="compact"
      variant="outlined"
      hideDetails
      :min="0"
    />
  </div>

  <VDivider class="my-4" />

  <VCheckbox
    v-model="exportAll"
    density="compact"
    hideDetails
    color="primary"
    class="mb-1 ml-n1"
  >
    <template #label>
      <span class="text-body-2 ml-2">Экспортировать все ячейки</span>
    </template>
  </VCheckbox>

  <p class="text-caption text-disabled mb-3">
    {{ exportAll ? 'Все' : 'Выбранные' }}: {{ exportCount }} из
    {{ availableCount }}
  </p>

  <template v-if="!exportAll">
    <p class="text-overline text-medium-emphasis mb-1">Выделение</p>
    <div class="two-col mb-4">
      <VBtn
        size="small"
        variant="tonal"
        @click="store.selectAll()"
      >
        <VIcon
          start
          size="15"
          >mdi-checkbox-multiple-marked-outline</VIcon
        >
        Все
      </VBtn>
      <VBtn
        size="small"
        variant="tonal"
        :disabled="store.selectedCells.size === 0"
        @click="store.deselectAll()"
      >
        <VIcon
          start
          size="15"
          >mdi-checkbox-multiple-blank-outline</VIcon
        >
        Сброс
      </VBtn>
    </div>
  </template>

  <p class="text-overline text-medium-emphasis mb-1">Скачать</p>
  <div class="export-btns">
    <VBtn
      color="primary"
      size="small"
      block
      prependIcon="mdi-download-multiple"
      :disabled="exportCount === 0"
      :loading="loading === 'single'"
      @click="exportSingle"
    >
      По одному ({{ exportCount }})
    </VBtn>

    <VBtn
      color="secondary"
      size="small"
      block
      prependIcon="mdi-view-grid-plus"
      :disabled="exportCount === 0"
      :loading="loading === 'sheet'"
      @click="exportSheet"
    >
      Собрать в лист
    </VBtn>

    <VBtn
      variant="outlined"
      size="small"
      block
      prependIcon="mdi-image-edit-outline"
      :disabled="!store.imageSrc"
      :loading="loading === 'full'"
      @click="exportFullSheet"
    >
      Весь лист (без линий)
    </VBtn>
  </div>

  <VDivider class="my-3" />

  <p class="text-overline text-medium-emphasis mb-1">Атлас</p>
  <div class="export-btns">
    <VBtn
      variant="tonal"
      color="success"
      size="small"
      block
      prependIcon="mdi-code-json"
      :disabled="exportCount === 0"
      :loading="loading === 'json'"
      @click="exportJSON"
    >
      JSON выбранных ({{ exportCount }})
    </VBtn>

    <VBtn
      variant="outlined"
      color="success"
      size="small"
      block
      prependIcon="mdi-code-json"
      :disabled="!store.imageSrc"
      :loading="loading === 'jsonAll'"
      @click="exportJSONAll"
    >
      JSON весь лист ({{ availableCount }})
    </VBtn>
  </div>

  <VAlert
    type="info"
    variant="tonal"
    density="compact"
    rounded="lg"
    class="mt-3 text-caption"
  >
    Формат TexturePacker Hash — совместим с Phaser, PixiJS, Unity
  </VAlert>

  <VDivider class="my-3" />
  <p class="text-caption text-medium-emphasis">
    <VIcon
      size="13"
      class="mr-1"
      >mdi-information-outline</VIcon
    >
    Линии сетки не попадают в экспорт — только пиксели оригинала
  </p>
</template>

<style scoped>
  .two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .export-btns {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
</style>
