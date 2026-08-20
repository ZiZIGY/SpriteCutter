<script setup lang="ts">
  import { ref } from 'vue';
  import GridSettings from '@/components/GridSettings.vue';
  import ExportPanel from '@/components/ExportPanel.vue';
  import SpriteNamesPanel from '@/components/SpriteNamesPanel.vue';
  import AnimationsPanel from '@/components/AnimationsPanel.vue';

  const openPanels = ref(['grid', 'export']);

  const sections = [
    { value: 'grid', icon: 'mdi-grid', title: 'Сетка' },
    { value: 'names', icon: 'mdi-tag-text-outline', title: 'Имена спрайтов' },
    { value: 'animations', icon: 'mdi-filmstrip', title: 'Анимации' },
    { value: 'export', icon: 'mdi-export-variant', title: 'Экспорт' },
  ] as const;
</script>

<template>
  <VExpansionPanels
    v-model="openPanels"
    variant="accordion"
    multiple
  >
    <VExpansionPanel
      v-for="section in sections"
      :key="section.value"
      :value="section.value"
    >
      <VExpansionPanelTitle>
        <VIcon
          size="18"
          class="mr-2"
          >{{ section.icon }}</VIcon
        >
        {{ section.title }}
      </VExpansionPanelTitle>
      <VExpansionPanelText>
        <GridSettings v-if="section.value === 'grid'" />
        <SpriteNamesPanel v-else-if="section.value === 'names'" />
        <AnimationsPanel v-else-if="section.value === 'animations'" />
        <ExportPanel v-else-if="section.value === 'export'" />
      </VExpansionPanelText>
    </VExpansionPanel>
  </VExpansionPanels>
</template>
