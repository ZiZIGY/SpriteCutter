<script setup lang="ts">
import { ref } from 'vue'
import { useSpriteStore } from '@/stores/spriteStore'

const store = useSpriteStore()
const fileInput = ref<HTMLInputElement>()
const dragging = ref(false)

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) store.loadImage(file)
}

function onDrop(e: DragEvent) {
  dragging.value = false
  const file = e.dataTransfer?.files[0]
  if (file && file.type.startsWith('image/')) store.loadImage(file)
}
</script>

<template>
  <VCard
    :color="dragging ? 'primary' : undefined"
    :variant="dragging ? 'tonal' : 'outlined'"
    rounded="xl"
    style="border-style: dashed; cursor: pointer"
    @dragover.prevent="dragging = true"
    @dragleave="dragging = false"
    @drop.prevent="onDrop"
    @click="fileInput?.click()"
  >
    <VCardText class="d-flex flex-column align-center justify-center pa-16 text-center">
      <VIcon size="72" :color="dragging ? 'primary' : 'medium-emphasis'" class="mb-5">
        mdi-image-plus
      </VIcon>
      <p class="text-h6 mb-2">Перетащите спрайт-лист сюда</p>
      <p class="text-body-2 text-medium-emphasis mb-5">или нажмите для выбора файла</p>
      <VChipGroup>
        <VChip size="small" variant="outlined">PNG</VChip>
        <VChip size="small" variant="outlined">JPEG</VChip>
        <VChip size="small" variant="outlined">WebP</VChip>
        <VChip size="small" variant="outlined">GIF</VChip>
      </VChipGroup>
    </VCardText>
    <input ref="fileInput" type="file" accept="image/*" style="display: none" @change="onFileChange" />
  </VCard>
</template>
