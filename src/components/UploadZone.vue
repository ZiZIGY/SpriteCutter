<script setup lang="ts">
  import { useTemplateRef } from 'vue';
  import { useDropZone, useFileDialog } from '@vueuse/core';
  import { useFileIntake } from '@/composables/useFileIntake';

  const { takeFiles } = useFileIntake();
  const dropZoneRef = useTemplateRef<HTMLElement>('dropZoneRef');

  // Only for the highlight: the drop itself is handled once, window-wide, in
  // App.vue (events bubble, a second handler here would load twice).
  const { isOverDropZone } = useDropZone(dropZoneRef);

  const { open: openFileDialog, onChange } = useFileDialog({
    accept: 'image/*',
    multiple: false,
    reset: true,
  });
  onChange((files) => {
    if (files) takeFiles(files);
  });
</script>

<template>
  <VCard
    ref="dropZoneRef"
    :color="isOverDropZone ? 'primary' : undefined"
    :variant="isOverDropZone ? 'tonal' : 'outlined'"
    rounded="xl"
    style="border-style: dashed; cursor: pointer"
    @click="openFileDialog()"
  >
    <VCardText
      class="d-flex flex-column align-center justify-center pa-12 text-center"
    >
      <VIcon
        size="72"
        :color="isOverDropZone ? 'primary' : 'medium-emphasis'"
        class="mb-5"
      >
        mdi-image-plus
      </VIcon>
      <p class="text-title-large mb-2">Перетащите картинку со спрайтами</p>
      <p class="text-body-medium text-medium-emphasis mb-5">
        или нажмите для выбора файла · или вставьте из буфера — Ctrl+V
      </p>
      <VChipGroup>
        <VChip
          v-for="f in ['PNG', 'JPEG', 'WebP', 'GIF']"
          :key="f"
          size="small"
          variant="outlined"
          >{{ f }}</VChip
        >
      </VChipGroup>
    </VCardText>
  </VCard>
</template>
