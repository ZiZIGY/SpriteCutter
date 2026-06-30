<script setup lang="ts">
  import { useSpriteStore } from '@/stores/spriteStore';
  import UploadZone from '@/components/UploadZone.vue';
  import SpriteCanvas from '@/components/SpriteCanvas.vue';
  import GridSettings from '@/components/GridSettings.vue';
  import ExportPanel from '@/components/ExportPanel.vue';

  const store = useSpriteStore();
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
          class="mr-4"
          @click="store.reset()"
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
      <VListItem
        title="Сетка"
        prependIcon="mdi-grid"
        density="compact"
        class="text-medium-emphasis pl-4"
        style="min-height: 44px"
      />
      <VDivider />
      <div class="px-4 py-4">
        <GridSettings />
      </div>

      <VDivider />
      <VListItem
        title="Экспорт"
        prependIcon="mdi-export-variant"
        density="compact"
        class="text-medium-emphasis pl-4"
        style="min-height: 44px"
      />
      <VDivider />
      <div class="px-4 py-4">
        <ExportPanel />
      </div>
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
        <SpriteCanvas />
        <p class="text-caption text-disabled text-center shrink-0">
          Колёсико — zoom · Space + ЛКМ — перемещение · клик — выделить
          <template v-if="store.gridMode === 'free'">
            · жёлтые линии — тянуть · двойной клик — добавить линию
          </template>
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
</style>
