<script setup lang="ts">
  import { computed } from 'vue';
  import { useRigStore } from '@/stores/rigStore';

  const rig = useRigStore();

  const ready = computed(() => !!rig.mesh && rig.bones.length > 0);
  const boundPercent = computed(() => Math.round(rig.boundVertexRatio * 100));

  /** Names of bones holding no weight, surfaced as a rig-health warning. */
  const inertNames = computed(() =>
    rig.bones.filter((b) => rig.inertBoneIds.has(b.id)).map((b) => b.name)
  );
</script>

<template>
  <VAlert
    v-if="!ready"
    type="warning"
    variant="tonal"
    density="compact"
    class="text-caption"
  >
    Нужны и кости, и сетка — тогда можно назначить веса.
  </VAlert>

  <template v-else>
    <p class="text-caption text-disabled mb-3">
      Вес определяет, насколько кость тянет вершину. Начни с авто-весов, потом
      правь кистью.
    </p>

    <VSlider
      v-model="rig.autoWeightOptions.falloff"
      label="Спад влияния"
      :min="0.5"
      :max="6"
      :step="0.1"
      density="compact"
      thumbLabel
      hideDetails
      class="mb-1"
    />
    <p class="text-caption text-disabled mb-3">
      Больше значение — влияние кости локальнее.
    </p>

    <VSlider
      v-model="rig.autoWeightOptions.maxInfluences"
      label="Костей на вершину"
      :min="1"
      :max="4"
      :step="1"
      density="compact"
      thumbLabel
      hideDetails
      class="mb-3"
    />

    <VSwitch
      v-model="rig.respectSilhouette"
      label="Не пересекать пустоту"
      color="primary"
      density="compact"
      hideDetails
      class="mb-1"
    />
    <p class="text-caption text-disabled mb-3">
      Кость влияет только на то, что видит «через тело». Без этого кость внутри
      завитка тянет вершины через пустоту на другой стороне.
    </p>

    <VBtn
      color="primary"
      variant="flat"
      block
      prependIcon="mdi-auto-fix"
      class="mb-2"
      @click="rig.computeAutoWeights()"
    >
      Рассчитать авто-веса
    </VBtn>

    <VAlert
      v-if="inertNames.length"
      type="warning"
      variant="tonal"
      density="compact"
      class="text-caption mb-2"
    >
      Ни на что не влияют: <strong>{{ inertNames.join(', ') }}</strong>.
      Эти кости стоят вне меша — при позировании они ничего не сдвинут.
    </VAlert>

    <VProgressLinear
      :modelValue="boundPercent"
      color="primary"
      height="6"
      rounded
      class="mb-1"
    />
    <p class="text-caption text-disabled mb-3">
      Привязано вершин: {{ boundPercent }}%
      <template v-if="boundPercent < 100">
        — непривязанные останутся неподвижными.
      </template>
    </p>

    <VDivider class="my-3" />

    <p class="text-overline text-medium-emphasis mb-2">Кисть весов</p>
    <VAlert
      v-if="rig.selectedBoneId === null"
      type="info"
      variant="tonal"
      density="compact"
      class="text-caption mb-3"
    >
      Выбери кость на вкладке «Кости», чтобы рисовать её вес.
    </VAlert>
    <p
      v-else
      class="text-caption text-disabled mb-2"
    >
      Рисуем для <strong>{{ rig.selectedBone?.name }}</strong
      >. ЛКМ — добавить вес, ПКМ — убрать.
    </p>

    <VSlider
      v-model="rig.brushRadius"
      label="Радиус"
      :min="4"
      :max="160"
      :step="1"
      density="compact"
      thumbLabel
      hideDetails
    />
    <VSlider
      v-model="rig.brushStrength"
      label="Сила"
      :min="0.02"
      :max="1"
      :step="0.01"
      density="compact"
      thumbLabel
      hideDetails
      class="mb-2"
    />

    <VSwitch
      v-model="rig.showWeightHeatmap"
      label="Тепловая карта веса"
      color="primary"
      density="compact"
      hideDetails
      class="mb-2"
    />

    <VBtn
      size="small"
      variant="tonal"
      block
      prependIcon="mdi-scale-balance"
      @click="rig.normalizeAllWeights()"
    >
      Нормализовать веса
    </VBtn>
  </template>
</template>
