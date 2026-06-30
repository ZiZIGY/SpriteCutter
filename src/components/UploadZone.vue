<script setup lang="ts">
  import { ref, useTemplateRef, watch } from 'vue';
  import { useDropZone, useFileDialog } from '@vueuse/core';
  import { useSpriteStore } from '@/stores/spriteStore';

  const store = useSpriteStore();

  const dropZoneRef = useTemplateRef<HTMLElement>('dropZoneRef');

  const { isOverDropZone } = useDropZone(dropZoneRef, {
    onDrop(files) {
      const file = files?.[0];
      if (file && file.type.startsWith('image/')) store.loadImage(file);
    },
    dataTypes: (types) => types.some((type) => type.startsWith('image/')),
  });

  const { open: openFileDialog, files } = useFileDialog({
    accept: 'image/*',
    multiple: false,
  });

  watch(files, (fileList) => {
    const file = fileList?.[0];
    if (file) store.loadImage(file);
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
      class="d-flex flex-column align-center justify-center pa-16 text-center"
    >
      <VIcon
        size="72"
        :color="isOverDropZone ? 'primary' : 'medium-emphasis'"
        class="mb-5"
      >
        mdi-image-plus
      </VIcon>
      <p class="text-h6 mb-2">Перетащите спрайт-лист сюда</p>
      <p class="text-body-2 text-medium-emphasis mb-5"
        >или нажмите для выбора файла</p
      >
      <VChipGroup>
        <VChip
          size="small"
          variant="outlined"
          >PNG</VChip
        >
        <VChip
          size="small"
          variant="outlined"
          >JPEG</VChip
        >
        <VChip
          size="small"
          variant="outlined"
          >WebP</VChip
        >
        <VChip
          size="small"
          variant="outlined"
          >GIF</VChip
        >
      </VChipGroup>
    </VCardText>
  </VCard>
</template>
