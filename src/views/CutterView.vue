<script setup lang="ts">
  import { useSpriteStore } from '@/stores/spriteStore';
  import UploadZone from '@/components/UploadZone.vue';
  import SpriteCanvas from '@/components/SpriteCanvas.vue';
  import SpriteList from '@/components/SpriteList.vue';
  import SheetPreview from '@/components/SheetPreview.vue';

  const store = useSpriteStore();

  const steps = [
    {
      icon: 'mdi-auto-fix',
      title: 'Находит спрайты сам',
      text: 'Ряды разной длины, разные размеры, фон — белый, цветной или «шахматка».',
    },
    {
      icon: 'mdi-content-cut',
      title: 'Вырезает чисто',
      text: 'Убирает фон и куски соседних спрайтов, центрирует в едином кадре.',
    },
    {
      icon: 'mdi-text-box-search-outline',
      title: 'Имена из любого текста',
      text: 'Список, JSON, таблица, CSV — вставьте текст, имена лягут по порядку.',
    },
  ];
</script>

<template>
  <div
    v-if="!store.imageSrc"
    class="empty-view"
  >
    <div class="empty-inner">
      <UploadZone />
      <div class="steps">
        <div
          v-for="s in steps"
          :key="s.title"
          class="step"
        >
          <VIcon
            color="primary"
            size="22"
            >{{ s.icon }}</VIcon
          >
          <div>
            <div class="text-body-medium font-weight-medium">{{ s.title }}</div>
            <div class="text-body-small text-medium-emphasis">{{ s.text }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div
    v-else
    class="editor"
  >
    <div class="canvas-col">
      <VBtnToggle
        v-model="store.view"
        mandatory
        divided
        density="compact"
        variant="outlined"
        color="primary"
        class="view-tabs"
      >
        <VBtn
          value="source"
          prependIcon="mdi-vector-square"
          >Разметка</VBtn
        >
        <VBtn
          value="result"
          prependIcon="mdi-view-grid-outline"
          >Результат</VBtn
        >
      </VBtnToggle>

      <!-- v-show keeps the canvas camera (zoom, pan) across tab switches. -->
      <SpriteCanvas v-show="store.view === 'source'" />
      <SheetPreview v-if="store.view === 'result'" />
      <p
        v-if="store.view === 'source'"
        class="hint"
      >
        Колёсико — масштаб · Пробел/СКМ — перемещение · клик, Shift+клик, рамка —
        выделение · тяните рамку спрайта или её углы · Del — удалить · M —
        объединить · B — нарисовать рамку
      </p>
    </div>
    <aside class="side">
      <SpriteList />
    </aside>
  </div>
</template>

<style scoped>
  .empty-view {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px 16px;
  }
  .empty-inner {
    width: 100%;
    max-width: 640px;
  }
  .steps {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-top: 24px;
  }
  @media (max-width: 640px) {
    .steps {
      grid-template-columns: 1fr;
    }
  }
  .step {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }
  .editor {
    height: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 12px;
    padding: 12px;
    box-sizing: border-box;
  }
  @media (max-width: 900px) {
    .editor {
      grid-template-columns: 1fr;
      grid-template-rows: minmax(360px, 1fr) 320px;
    }
  }
  .canvas-col {
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .view-tabs {
    flex-shrink: 0;
    align-self: flex-start;
  }
  .view-tabs :deep(.v-btn) {
    text-transform: none;
    letter-spacing: normal;
  }
  .side {
    min-height: 0;
  }
  .hint {
    flex-shrink: 0;
    text-align: center;
    font-size: 12px;
    color: rgba(var(--v-theme-on-surface), 0.45);
  }
</style>
