<script setup lang="ts">
  import { useRigStore } from '@/stores/rigStore';

  const rig = useRigStore();
</script>

<template>
  <p class="text-caption text-disabled mb-3">
    Сетка строится по альфа-каналу спрайта: контур упрощается, внутри
    расставляются точки, затем всё триангулируется.
  </p>

  <VSlider
    v-model="rig.meshOptions.spacing"
    label="Шаг точек"
    :min="6"
    :max="80"
    :step="1"
    density="compact"
    thumbLabel
    hideDetails
    class="mb-1"
  />
  <p class="text-caption text-disabled mb-3">
    Меньше шаг — плотнее сетка и плавнее деформация, но больше вершин.
  </p>

  <VSlider
    v-model="rig.meshOptions.simplifyTolerance"
    label="Упрощение контура"
    :min="0.2"
    :max="8"
    :step="0.1"
    density="compact"
    thumbLabel
    hideDetails
    class="mb-1"
  />

  <VSlider
    v-model="rig.meshOptions.minCoverage"
    label="Заполненность треуг."
    :min="0"
    :max="0.9"
    :step="0.05"
    density="compact"
    thumbLabel
    hideDetails
    class="mb-1"
  />
  <p class="text-caption text-disabled mb-3">
    Насколько треугольник должен попадать на рисунок, чтобы остаться. Выше —
    сетка не перекрывает пустоту внутри завитков и между конечностями.
  </p>

  <VSlider
    v-model="rig.meshOptions.alphaThreshold"
    label="Порог альфы"
    :min="1"
    :max="200"
    :step="1"
    density="compact"
    thumbLabel
    hideDetails
    class="mb-3"
  />

  <VBtn
    color="primary"
    variant="flat"
    block
    :loading="rig.isGeneratingMesh"
    prependIcon="mdi-vector-triangle"
    class="mb-3"
    @click="rig.requestMesh()"
  >
    {{ rig.mesh ? 'Перестроить сетку' : 'Построить сетку' }}
  </VBtn>

  <VAlert
    v-if="!rig.mesh"
    type="info"
    variant="tonal"
    density="compact"
    class="text-caption"
  >
    Сетки пока нет — построй её, чтобы перейти к весам.
  </VAlert>

  <template v-else>
    <div class="d-flex gap-2 mb-3">
      <VChip
        size="small"
        variant="tonal"
        prependIcon="mdi-circle-small"
      >
        {{ rig.vertexCount }} вершин
      </VChip>
      <VChip
        size="small"
        variant="tonal"
        prependIcon="mdi-triangle-outline"
      >
        {{ rig.triangleCount }} треуг.
      </VChip>
    </div>

    <VBtn
      size="small"
      variant="tonal"
      color="error"
      block
      prependIcon="mdi-delete-outline"
      @click="rig.clearMesh()"
    >
      Удалить сетку
    </VBtn>
  </template>
</template>
