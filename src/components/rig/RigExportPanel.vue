<script setup lang="ts">
  import { computed } from 'vue';
  import { useRigStore } from '@/stores/rigStore';
  import { downloadJSON } from '@/utils/download';
  import { buildRigDocument, buildSpineJson } from '@/utils/rig/exportRig';

  const rig = useRigStore();

  const ready = computed(() => !!rig.mesh && rig.bones.length > 0);

  function exportInput() {
    return {
      spriteName: rig.spriteName,
      region: { ...rig.region },
      bones: rig.bones,
      mesh: rig.mesh!,
      weights: rig.weights,
    };
  }

  function exportNative() {
    if (!ready.value) return;
    downloadJSON(buildRigDocument(exportInput()), `${rig.spriteName}_rig`);
  }

  function exportSpine() {
    if (!ready.value) return;
    downloadJSON(buildSpineJson(exportInput()), `${rig.spriteName}_spine`);
  }
</script>

<template>
  <VAlert
    v-if="!ready"
    type="info"
    variant="tonal"
    density="compact"
    class="text-caption"
  >
    Готовый риг (кости + сетка) можно выгрузить в JSON.
  </VAlert>

  <template v-else>
    <p class="text-caption text-disabled mb-3">
      Экспортируются кости с физикой, сетка с UV и веса скиннинга.
    </p>

    <VBtn
      color="primary"
      variant="flat"
      block
      prependIcon="mdi-code-json"
      class="mb-2"
      @click="exportNative"
    >
      Риг JSON
    </VBtn>

    <VBtn
      variant="tonal"
      block
      prependIcon="mdi-export"
      class="mb-3"
      @click="exportSpine"
    >
      Spine-совместимый JSON
    </VBtn>

    <p class="text-caption text-disabled">
      Spine-формат использует систему координат Y-вверх, поэтому вертикальные
      значения инвертируются при экспорте.
    </p>
  </template>
</template>
