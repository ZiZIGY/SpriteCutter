<script setup lang="ts">
  import { ref } from 'vue';
  import { useSpriteStore } from '@/stores/spriteStore';
  import GridSettingsForm from './GridSettingsForm.vue';

  const store = useSpriteStore();
  const colorPickerOpen = ref(false);

  function onColorPick(value: string) {
    store.gridColor = value.slice(0, 7);
  }

  const modeHints: Record<string, string> = {
    select: 'Клик/протяни по ячейкам, чтобы выделить их для экспорта',
    offset: 'Тяни бокс внутри ячейки, чтобы сдвинуть центр спрайта',
    exclude: 'Клик/протяни по ячейкам, чтобы исключить их из экспорта',
  };
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

  <p class="text-overline text-medium-emphasis mb-1">Режим холста</p>
  <VBtnToggle
    v-model="store.mode"
    mandatory
    density="compact"
    variant="outlined"
    divided
    class="mode-toggle mb-2"
  >
    <VBtn
      value="select"
      size="small"
      prependIcon="mdi-cursor-default-click-outline"
    >
      Выбор
    </VBtn>
    <VBtn
      value="offset"
      size="small"
      prependIcon="mdi-arrow-all"
    >
      Сдвиг
    </VBtn>
    <VBtn
      value="exclude"
      size="small"
      prependIcon="mdi-cancel"
    >
      Исключ.
    </VBtn>
  </VBtnToggle>

  <p class="text-caption text-disabled mb-2">{{ modeHints[store.mode] }}</p>

  <VBtn
    v-if="store.mode === 'offset'"
    size="small"
    variant="tonal"
    block
    prependIcon="mdi-restore"
    @click="store.resetCellOffsets()"
  >
    Сбросить смещения
  </VBtn>
  <VBtn
    v-if="store.mode === 'exclude' && store.excludedCells.size > 0"
    size="small"
    variant="tonal"
    color="error"
    block
    prependIcon="mdi-restore"
    @click="store.resetExcludedCells()"
  >
    Сбросить исключения ({{ store.excludedCells.size }})
  </VBtn>
</template>

<style scoped>
  .mode-toggle {
    width: 100%;
  }
  .mode-toggle :deep(.v-btn) {
    flex: 1;
    text-transform: none;
    font-size: 11px;
  }
</style>
