<script setup lang="ts">
  import { ref, watch } from 'vue';
  import { useSpriteStore } from '@/stores/spriteStore';
  import GridSettingsForm from './GridSettingsForm.vue';

  const store = useSpriteStore();
  const colorPickerOpen = ref(false);

  function onColorPick(value: string) {
    store.gridColor = value.slice(0, 7);
  }

  watch(
    () => store.excludeMode,
    (value) => {
      if (value) store.showOffsets = false;
    }
  );

  watch(
    () => store.showOffsets,
    (value) => {
      if (value) store.excludeMode = false;
    }
  );
</script>

<template>
  <GridSettingsForm />

  <VDivider class="my-4" />

  <p class="text-overline text-medium-emphasis mb-2">Цвет линий</p>
  <VMenu
    v-model="colorPickerOpen"
    :close-on-content-click="false"
    location="right"
  >
    <template #activator="{ props: menuProps }">
      <VBtn
        variant="outlined"
        size="small"
        block
        v-bind="menuProps"
        class="mb-3 justify-start"
        style="text-transform: none; font-family: monospace"
      >
        <span
          class="mr-2 rounded"
          :style="{
            background: store.gridColor,
            width: '16px',
            height: '16px',
            flexShrink: 0,
            border: '1px solid rgba(255,255,255,0.2)',
            display: 'inline-block',
          }"
        />
        {{ store.gridColor.toUpperCase() }}
        <VIcon end>mdi-menu-down</VIcon>
      </VBtn>
    </template>
    <VCard
      rounded="lg"
      elevation="8"
      style="overflow: hidden"
    >
      <VColorPicker
        :model-value="store.gridColor"
        mode="hex"
        :modes="['hex', 'hsl']"
        hide-canvas
        show-swatches
        :swatches="[
          ['#FFFFFF', '#94A3B8', '#64B5F6', '#4DD0E1'],
          ['#81C784', '#FFD54F', '#FF8A65', '#F06292'],
          ['#1867C0', '#00BCD4', '#43A047', '#E53935'],
        ]"
        @update:modelValue="onColorPick"
      />
      <VCardActions>
        <VBtn
          size="x-small"
          variant="text"
          @click="
            store.gridColor = '#FFFFFF';
            colorPickerOpen = false;
          "
        >
          <VIcon
            start
            size="13"
            >mdi-restore</VIcon
          >По умолчанию
        </VBtn>
        <VSpacer />
        <VBtn
          size="x-small"
          variant="tonal"
          @click="colorPickerOpen = false"
        >
          Готово
        </VBtn>
      </VCardActions>
    </VCard>
  </VMenu>

  <VDivider class="my-4" />

  <p class="text-overline text-medium-emphasis mb-1">Смещение точек</p>
  <VCheckbox
    v-model="store.showOffsets"
    density="compact"
    hideDetails
    color="primary"
    class="ml-n1 mb-2"
  >
    <template #label>
      <span class="text-body-2 ml-2">Режим смещения</span>
    </template>
  </VCheckbox>

  <Transition name="fade-section">
    <div v-if="store.showOffsets">
      <p class="text-caption text-disabled mb-2">
        Тяни точку внутри ячейки, чтобы сдвинуть центр спрайта
      </p>
      <VBtn
        size="small"
        variant="tonal"
        block
        prependIcon="mdi-restore"
        @click="store.resetCellOffsets()"
      >
        Сбросить смещения
      </VBtn>
    </div>
  </Transition>

  <VDivider class="my-4" />

  <p class="text-overline text-medium-emphasis mb-1">Исключение ячеек</p>
  <VCheckbox
    v-model="store.excludeMode"
    density="compact"
    hideDetails
    color="error"
    class="ml-n1 mb-2"
  >
    <template #label>
      <span class="text-body-2 ml-2">Режим исключения</span>
    </template>
  </VCheckbox>

  <Transition name="fade-section">
    <div v-if="store.excludeMode">
      <p class="text-caption text-disabled mb-2">
        Клик/протяни по ячейкам, чтобы исключить их из экспорта
      </p>
      <VBtn
        v-if="store.excludedCells.size > 0"
        size="small"
        variant="tonal"
        color="error"
        block
        prependIcon="mdi-restore"
        @click="store.resetExcludedCells()"
      >
        Сбросить исключения ({{ store.excludedCells.size }})
      </VBtn>
    </div>
  </Transition>
</template>

<style scoped>
  .fade-section-enter-active,
  .fade-section-leave-active {
    transition: opacity 0.15s ease;
  }
  .fade-section-enter-from,
  .fade-section-leave-to {
    opacity: 0;
  }
</style>
