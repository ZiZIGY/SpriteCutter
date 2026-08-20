<script setup lang="ts">
  import { useRigStore, type RigStage } from '@/stores/rigStore';
  import RigSourcePicker from '@/components/rig/RigSourcePicker.vue';
  import BonesPanel from '@/components/rig/BonesPanel.vue';
  import MeshPanel from '@/components/rig/MeshPanel.vue';
  import WeightsPanel from '@/components/rig/WeightsPanel.vue';
  import PosePanel from '@/components/rig/PosePanel.vue';
  import RigExportPanel from '@/components/rig/RigExportPanel.vue';

  const rig = useRigStore();

  /**
   * Switching stage also resets which overlays are visible: editing stages need
   * bones and wireframe, the pose stage is a clean preview.
   */
  function onStageChange(value: unknown) {
    const next = value as RigStage;
    rig.stage = next;
    rig.applyStageDefaults(next);
  }

  const stages: { value: RigStage; icon: string; title: string }[] = [
    { value: 'bones', icon: 'mdi-bone', title: 'Кости' },
    { value: 'mesh', icon: 'mdi-vector-triangle', title: 'Сетка' },
    { value: 'weights', icon: 'mdi-format-color-fill', title: 'Веса' },
    { value: 'pose', icon: 'mdi-run', title: 'Поза и физика' },
  ];
</script>

<template>
  <div class="pa-3">
    <RigSourcePicker />
  </div>

  <VDivider />

  <VTabs
    :modelValue="rig.stage"
    @update:modelValue="onStageChange"
    density="compact"
    grow
    color="primary"
  >
    <VTab
      v-for="s in stages"
      :key="s.value"
      :value="s.value"
      class="stage-tab"
    >
      <VIcon size="18">{{ s.icon }}</VIcon>
      <VTooltip
        activator="parent"
        location="bottom"
        >{{ s.title }}</VTooltip
      >
    </VTab>
  </VTabs>

  <VDivider />

  <div class="pa-3">
    <p class="text-overline text-medium-emphasis mb-2">
      {{ stages.find((s) => s.value === rig.stage)?.title }}
    </p>

    <BonesPanel v-if="rig.stage === 'bones'" />
    <MeshPanel v-else-if="rig.stage === 'mesh'" />
    <WeightsPanel v-else-if="rig.stage === 'weights'" />
    <PosePanel v-else-if="rig.stage === 'pose'" />

    <VDivider class="my-4" />
    <p class="text-overline text-medium-emphasis mb-2">Экспорт рига</p>
    <RigExportPanel />
  </div>
</template>

<style scoped>
  .stage-tab {
    min-width: 0;
  }
</style>
