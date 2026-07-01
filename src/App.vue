<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useTheme } from 'vuetify';
  import { useLocalStorage } from '@vueuse/core';
  import { useSpriteStore } from '@/stores/spriteStore';
  import UploadZone from '@/components/UploadZone.vue';
  import SpriteCanvas from '@/components/SpriteCanvas.vue';
  import GridSettings from '@/components/GridSettings.vue';
  import ExportPanel from '@/components/ExportPanel.vue';
  import SpriteNamesPanel from '@/components/SpriteNamesPanel.vue';
  import AnimationsPanel from '@/components/AnimationsPanel.vue';

  const store = useSpriteStore();
  const theme = useTheme();
  const isDark = computed(() => theme.current.value.dark);

  const savedTheme = useLocalStorage<'light' | 'dark'>(
    'sprite-cutter-theme',
    'dark'
  );
  theme.global.name.value = savedTheme.value;

  const openPanels = ref(['grid', 'export']);

  function toggleTheme() {
    savedTheme.value = isDark.value ? 'light' : 'dark';
    theme.global.name.value = savedTheme.value;
  }
</script>

<template>
  <VApp>
    <VAppBar
      flat
      border="b"
      color="surface"
    >
      <VAppBarTitle class="pl-2">
        <span class="text-primary font-weight-bold">Sprite</span
        ><span class="text-on-surface">Cutter</span>
      </VAppBarTitle>
      <template #append>
        <VChip
          v-if="store.imageSrc"
          size="small"
          variant="tonal"
          class="mr-3"
        >
          {{ store.imageWidth }}×{{ store.imageHeight }}
        </VChip>
        <VBtn
          v-if="store.imageSrc"
          prependIcon="mdi-image-plus"
          text="Новое"
          variant="tonal"
          size="small"
          class="mr-2"
          @click="store.reset()"
        />
        <VBtn
          :icon="isDark ? 'mdi-weather-sunny' : 'mdi-weather-night'"
          variant="text"
          size="small"
          class="mr-2"
          @click="toggleTheme"
        />
      </template>
    </VAppBar>

    <VNavigationDrawer
      v-if="store.imageSrc"
      permanent
      width="282"
      color="surface"
      style="overflow-y: auto"
    >
      <VExpansionPanels
        v-model="openPanels"
        variant="accordion"
        multiple
      >
        <VExpansionPanel value="grid">
          <VExpansionPanelTitle>
            <VIcon
              size="18"
              class="mr-2"
              >mdi-grid</VIcon
            >
            Сетка
          </VExpansionPanelTitle>
          <VExpansionPanelText>
            <GridSettings />
          </VExpansionPanelText>
        </VExpansionPanel>

        <VExpansionPanel value="names">
          <VExpansionPanelTitle>
            <VIcon
              size="18"
              class="mr-2"
              >mdi-tag-text-outline</VIcon
            >
            Имена спрайтов
          </VExpansionPanelTitle>
          <VExpansionPanelText>
            <SpriteNamesPanel />
          </VExpansionPanelText>
        </VExpansionPanel>

        <VExpansionPanel value="animations">
          <VExpansionPanelTitle>
            <VIcon
              size="18"
              class="mr-2"
              >mdi-filmstrip</VIcon
            >
            Анимации
          </VExpansionPanelTitle>
          <VExpansionPanelText>
            <AnimationsPanel />
          </VExpansionPanelText>
        </VExpansionPanel>

        <VExpansionPanel value="export">
          <VExpansionPanelTitle>
            <VIcon
              size="18"
              class="mr-2"
              >mdi-export-variant</VIcon
            >
            Экспорт
          </VExpansionPanelTitle>
          <VExpansionPanelText>
            <ExportPanel />
          </VExpansionPanelText>
        </VExpansionPanel>
      </VExpansionPanels>
    </VNavigationDrawer>

    <VMain>
      <div
        v-if="!store.imageSrc"
        class="fill-viewport d-flex align-center justify-center pa-8"
      >
        <div style="max-width: 520px; width: 100%">
          <UploadZone />
        </div>
      </div>

      <div
        v-else
        class="fill-viewport d-flex flex-column pa-3"
        style="gap: 6px"
      >
        <div class="canvas-row">
          <SpriteCanvas />
        </div>
        <p
          class="text-caption text-disabled text-center"
          style="flex-shrink: 0"
        >
          Колёсико — zoom · СКМ/Пробел — перемещение · клик/тяни — выделение
          <template v-if="store.mode === 'offset'"> · тяни бокс — сдвинуть</template>
        </p>
      </div>
    </VMain>
  </VApp>
</template>

<style scoped>
  .fill-viewport {
    height: 100%;
    box-sizing: border-box;
  }
  .canvas-row {
    flex: 1;
    min-height: 0;
    display: flex;
    gap: 12px;
  }
</style>
