<script setup lang="ts">
  import { computed } from 'vue';
  import { useSpriteStore } from '@/stores/spriteStore';
  import { useUiStore } from '@/stores/uiStore';
  import AnimPreview from '@/components/AnimPreview.vue';

  const store = useSpriteStore();
  const ui = useUiStore();

  const open = computed({
    get: () => ui.dialog === 'animations',
    set: (v) => (ui.dialog = v ? 'animations' : null),
  });

  const multiRows = computed(() => {
    const counts = new Map<number, number>();
    for (const s of store.sprites) counts.set(s.row, (counts.get(s.row) ?? 0) + 1);
    return [...counts.values()].filter((n) => n >= 2).length;
  });
</script>

<template>
  <VDialog
    v-model="open"
    max-width="640"
    scrollable
  >
    <VCard>
      <VCardTitle class="d-flex align-center pt-4 px-5">
        <VIcon
          class="mr-2"
          color="primary"
          >mdi-filmstrip</VIcon
        >
        Анимации
        <VSpacer />
        <VBtn
          icon="mdi-close"
          variant="text"
          size="small"
          @click="open = false"
        />
      </VCardTitle>

      <VCardText class="px-5">
        <div class="d-flex ga-2 mb-4 flex-wrap">
          <VBtn
            variant="tonal"
            color="primary"
            prependIcon="mdi-plus"
            :disabled="store.selected.size < 1"
            @click="store.addAnimationFromSelection()"
          >
            Из выделенных ({{ store.selected.size }})
          </VBtn>
          <VBtn
            variant="tonal"
            prependIcon="mdi-table-row"
            :disabled="!multiRows"
            @click="store.addAnimationsFromRows()"
          >
            По рядам ({{ multiRows }})
          </VBtn>
        </div>

        <p
          v-if="!store.animations.length"
          class="text-body-medium text-medium-emphasis"
        >
          Выделите кадры на холсте (Shift — добавить к выделению) и нажмите «Из
          выделенных» — порядок кадров как в списке справа. «По рядам» делает
          одну анимацию на каждый ряд. Анимации попадут в JSON атласа.
        </p>

        <div
          v-for="anim in store.animations"
          :key="anim.id"
          class="anim-card mb-2"
        >
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
              label="Название"
            />
            <div class="d-flex align-center ga-2">
              <VNumberInput
                v-model="anim.fps"
                controlVariant="stacked"
                density="compact"
                variant="outlined"
                hideDetails
                :min="1"
                :max="60"
                suffix="fps"
                style="max-width: 130px"
              />
              <VChip
                size="small"
                variant="tonal"
                >{{ anim.frames.length }} кадр.</VChip
              >
              <VSpacer />
              <VBtn
                size="small"
                variant="text"
                icon="mdi-select-group"
                @click="store.selectAnimationFrames(anim.id)"
              />
              <VBtn
                size="small"
                variant="text"
                color="error"
                icon="mdi-delete-outline"
                @click="store.removeAnimation(anim.id)"
              />
            </div>
          </div>
        </div>
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style scoped>
  .anim-card {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
    border-radius: 10px;
    padding: 10px;
  }
  .anim-fields {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
</style>
