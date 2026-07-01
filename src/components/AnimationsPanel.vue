<script setup lang="ts">
  import { computed } from 'vue';
  import { useSpriteStore } from '@/stores/spriteStore';
  import AnimPreview from '@/components/AnimPreview.vue';

  const store = useSpriteStore();

  const selectedCount = computed(
    () =>
      store.activeCells.filter(
        (c) => !c.excluded && store.selectedCells.has(`${c.col}_${c.row}`)
      ).length
  );
</script>

<template>
  <VBtn
    variant="tonal"
    color="primary"
    block
    size="small"
    class="mb-3"
    prependIcon="mdi-plus"
    :disabled="!selectedCount"
    @click="store.addAnimationFromSelection()"
  >
    Создать из выделения
    <template v-if="selectedCount"> ({{ selectedCount }})</template>
  </VBtn>

  <div
    v-if="!store.animations.length"
    class="text-caption text-disabled"
  >
    Выдели кадры на холсте и нажми «Создать из выделения» — кадры добавятся в
    порядке чтения (слева направо, сверху вниз)
  </div>

  <div
    v-for="anim in store.animations"
    :key="anim.id"
    class="anim-card mb-2"
  >
    <div class="anim-row">
      <AnimPreview
        :frames="anim.frames"
        :fps="anim.fps"
      />
      <div class="anim-fields">
        <VTextField
          v-model="anim.name"
          density="compact"
          variant="outlined"
          hideDetails
          placeholder="Название"
        />
        <VNumberInput
          v-model="anim.fps"
          controlVariant="stacked"
          density="compact"
          variant="outlined"
          hideDetails
          :min="1"
          :max="60"
          suffix="fps"
        />
      </div>
    </div>
    <div class="anim-actions">
      <VChip
        size="x-small"
        variant="tonal"
      >
        {{ anim.frames.length }} кадр.
      </VChip>
      <VBtn
        size="x-small"
        variant="text"
        prependIcon="mdi-select-group"
        @click="store.selectAnimationFrames(anim.id)"
      >
        Показать кадры
      </VBtn>
      <VSpacer />
      <VBtn
        size="x-small"
        variant="text"
        color="error"
        icon="mdi-delete-outline"
        @click="store.removeAnimation(anim.id)"
      />
    </div>
  </div>
</template>

<style scoped>
  .anim-card {
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    padding: 8px;
  }
  .anim-row {
    display: flex;
    gap: 8px;
    align-items: flex-start;
  }
  .anim-fields {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .anim-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 6px;
  }
</style>
