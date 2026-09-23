<script setup lang="ts">
  import { computed } from 'vue';
  import { useSpriteStore } from '@/stores/spriteStore';

  const store = useSpriteStore();
  const o = computed(() => store.output);

  const PRESETS = [32, 64, 128, 256, 512];

  /** 'auto' or a square preset, as one toggle; anything else is custom. */
  const sizeChoice = computed({
    get: () => {
      if (o.value.size === 'auto') return 'auto';
      if (o.value.square && PRESETS.includes(o.value.width)) return o.value.width;
      return 'custom';
    },
    set: (v: 'auto' | 'custom' | number) => {
      if (v === 'auto') {
        o.value.size = 'auto';
      } else if (v === 'custom') {
        o.value.size = 'custom';
        o.value.square = false;
        if (store.frames) {
          o.value.width = store.frames.width;
          o.value.height = store.frames.height;
        }
      } else {
        o.value.size = 'custom';
        o.value.square = true;
        o.value.width = o.value.height = v;
      }
    },
  });

  const cleanups = [
    { key: 'removeBg', label: 'Удалить фон', hint: 'Фон становится прозрачным' },
    { key: 'isolate', label: 'Вырезать куски соседей', hint: 'Всё, что залезло в рамку от других спрайтов, убирается' },
    { key: 'soften', label: 'Убрать ореол по краю', hint: 'Светлая кайма от белого фона' },
    { key: 'trim', label: 'Обрезать по содержимому', hint: 'Затем спрайт центрируется в кадре' },
  ] as const;
</script>

<template>
  <VMenu
    :close-on-content-click="false"
    location="bottom start"
    offset="6"
  >
    <template #activator="{ props: mp }">
      <VBtn
        v-bind="mp"
        variant="text"
        prependIcon="mdi-crop-free"
        class="bar-btn"
      >
        Кадр
      </VBtn>
    </template>

    <VCard
      width="380"
      class="menu-card"
    >
      <div class="menu-title">
        Кадр и очистка
        <VChip
          v-if="store.frames"
          size="small"
          variant="tonal"
          color="primary"
          class="ml-2"
          >{{ store.frames.width }}×{{ store.frames.height }}</VChip
        >
      </div>
      <p class="hint mb-3">Результат сразу видно в миниатюрах справа.</p>

      <div class="field-label">Очистка</div>
      <div
        v-for="c in cleanups"
        :key="c.key"
        class="switch-row"
      >
        <VSwitch
          v-model="o[c.key]"
          density="compact"
          hideDetails
          color="primary"
          :disabled="c.key === 'soften' && !o.removeBg"
        >
          <template #label>
            <div>
              <div class="text-body-medium">{{ c.label }}</div>
              <div class="hint">{{ c.hint }}</div>
            </div>
          </template>
        </VSwitch>
      </div>

      <VDivider class="my-3" />

      <div class="field-label">Размер кадра</div>
      <VBtnToggle
        v-model="sizeChoice"
        mandatory
        divided
        density="compact"
        variant="outlined"
        class="wide-toggle mb-2"
      >
        <VBtn value="auto">Авто</VBtn>
        <VBtn
          v-for="p in PRESETS"
          :key="p"
          :value="p"
          >{{ p }}</VBtn
        >
        <VBtn value="custom">Свой</VBtn>
      </VBtnToggle>
      <p
        v-if="o.size === 'auto'"
        class="hint mb-2"
      >
        {{
          o.scale === 'fit'
            ? 'По типичному (медианному) размеру спрайта.'
            : 'По самому большому спрайту.'
        }}
      </p>
      <div
        v-if="sizeChoice === 'custom'"
        class="two-col mb-2"
      >
        <VNumberInput
          v-model="o.width"
          label="Ширина"
          controlVariant="stacked"
          density="compact"
          variant="outlined"
          hideDetails
          :min="1"
        />
        <VNumberInput
          v-model="o.height"
          label="Высота"
          controlVariant="stacked"
          density="compact"
          variant="outlined"
          hideDetails
          :min="1"
          :disabled="o.square"
        />
      </div>
      <VSwitch
        v-if="o.size === 'auto' || sizeChoice === 'custom'"
        v-model="o.square"
        density="compact"
        hideDetails
        color="primary"
        label="Квадратный кадр"
      />

      <div class="field-label mt-2">
        Отступ внутри кадра <span class="val">{{ o.padding }} px</span>
      </div>
      <VSlider
        v-model="o.padding"
        :min="0"
        :max="64"
        :step="1"
        density="compact"
        hideDetails
        color="primary"
        class="mb-3"
      />

      <div class="field-label">Масштаб</div>
      <VBtnToggle
        v-model="o.scale"
        mandatory
        divided
        density="compact"
        variant="outlined"
        class="wide-toggle mb-1"
      >
        <VBtn value="none">Оригинал</VBtn>
        <VBtn value="fit">Вписать</VBtn>
        <VBtn value="uniform">Общий</VBtn>
      </VBtnToggle>
      <p class="hint mb-3">
        <template v-if="o.scale === 'none'">Пиксели как в исходнике.</template>
        <template v-else-if="o.scale === 'fit'"
          >Каждый спрайт растягивается до кадра — все одного размера.</template
        >
        <template v-else
          >Один множитель для всех: самый большой влезает в кадр, пропорции
          между спрайтами сохраняются.</template
        >
      </p>

      <div class="field-label">Выравнивание</div>
      <VBtnToggle
        v-model="o.anchor"
        mandatory
        divided
        density="compact"
        variant="outlined"
        class="wide-toggle mb-3"
      >
        <VBtn
          value="center"
          prependIcon="mdi-format-vertical-align-center"
          >По центру</VBtn
        >
        <VBtn
          value="bottom"
          prependIcon="mdi-format-vertical-align-bottom"
          >По низу</VBtn
        >
      </VBtnToggle>

      <VSwitch
        v-model="o.smooth"
        density="compact"
        hideDetails
        color="primary"
        label="Сглаживание при масштабе (выкл. для пиксель-арта)"
      />
    </VCard>
  </VMenu>
</template>

<style scoped>
  .menu-card {
    padding: 16px;
    max-height: calc(100vh - 80px);
    overflow-y: auto;
  }
  .menu-title {
    font-weight: 600;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
  }
  .hint {
    font-size: 12px;
    line-height: 1.35;
    color: rgba(var(--v-theme-on-surface), 0.6);
  }
  .field-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgba(var(--v-theme-on-surface), 0.6);
    margin-bottom: 4px;
  }
  .val {
    float: right;
    text-transform: none;
    font-variant-numeric: tabular-nums;
    color: rgb(var(--v-theme-on-surface));
  }
  .switch-row :deep(.v-selection-control) {
    align-items: flex-start;
    padding: 4px 0;
  }
  .wide-toggle {
    width: 100%;
  }
  .wide-toggle :deep(.v-btn) {
    flex: 1;
    min-width: 0;
    padding: 0 6px;
    text-transform: none;
    letter-spacing: normal;
  }
  .two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .bar-btn {
    text-transform: none;
    letter-spacing: normal;
  }
</style>
