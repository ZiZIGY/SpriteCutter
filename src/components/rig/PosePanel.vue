<script setup lang="ts">
  import { computed } from 'vue';
  import { useRigStore } from '@/stores/rigStore';

  const rig = useRigStore();

  const physicsBones = computed(() =>
    rig.bones.filter((b) => b.physics?.enabled)
  );
  const ready = computed(() => !!rig.mesh && rig.bones.length > 0);

  /** Pose rotation is stored in radians; the slider works in degrees. */
  const selectedDegrees = computed({
    get: () =>
      rig.selectedBone
        ? Math.round((rig.selectedBone.poseRotation * 180) / Math.PI)
        : 0,
    set: (value: number) => {
      if (rig.selectedBone)
        rig.selectedBone.poseRotation = (value * Math.PI) / 180;
    },
  });
</script>

<template>
  <VAlert
    v-if="!ready"
    type="warning"
    variant="tonal"
    density="compact"
    class="text-caption"
  >
    Сначала кости, сетка и веса — потом позирование.
  </VAlert>

  <template v-else>
    <VAlert
      type="info"
      variant="tonal"
      density="compact"
      class="text-caption mb-3"
    >
      <strong>Тяни за любую кость</strong> — тело подстроится (IK).
      <br />Резко отпусти — останется инерция.
      <br /><strong>ПКМ</strong> по кости — толчок.
    </VAlert>

    <VBtn
      :color="rig.physicsRunning ? 'error' : 'primary'"
      variant="flat"
      block
      :prependIcon="rig.physicsRunning ? 'mdi-pause' : 'mdi-play'"
      class="mb-2"
      @click="rig.physicsRunning = !rig.physicsRunning"
    >
      {{ rig.physicsRunning ? 'Остановить физику' : 'Запустить физику' }}
    </VBtn>

    <VAlert
      v-if="rig.physicsRunning && !physicsBones.length"
      type="info"
      variant="tonal"
      density="compact"
      class="text-caption mb-2"
    >
      Ни у одной кости не включена физика — включи её в панели «Кости».
    </VAlert>

    <div class="d-flex gap-2 mb-3">
      <VBtn
        size="small"
        variant="tonal"
        class="flex-1-1"
        prependIcon="mdi-gesture-tap"
        :disabled="!physicsBones.length"
        @click="rig.pokePhysics()"
      >
        Толкнуть
      </VBtn>
      <VBtn
        size="small"
        variant="tonal"
        class="flex-1-1"
        prependIcon="mdi-restore"
        @click="rig.resetPose()"
      >
        Сброс позы
      </VBtn>
    </div>

    <VDivider class="my-3" />

    <p class="text-overline text-medium-emphasis mb-2">Жесты мышью</p>
    <VSlider
      v-model="rig.ikChainDepth"
      label="Глубина IK"
      :min="1"
      :max="6"
      :step="1"
      density="compact"
      thumbLabel
      hideDetails
      class="mb-1"
    />
    <p class="text-caption text-disabled mb-2">
      Сколько костей вверх по цепочке поворачивается при перетаскивании. 1 —
      только сама кость, больше — тянется всё тело.
    </p>
    <VSlider
      v-model="rig.flickStrength"
      label="Сила броска"
      :min="0"
      :max="3"
      :step="0.05"
      density="compact"
      thumbLabel
      hideDetails
      class="mb-1"
    />
    <p class="text-caption text-disabled mb-2">
      Насколько сильно инерция подхватывает кость после резкого отпускания
      (нужна включённая физика).
    </p>

    <VDivider class="my-3" />

    <p class="text-overline text-medium-emphasis mb-2">Что показывать</p>
    <VSwitch
      v-model="rig.showTexture"
      label="Картинка"
      color="primary"
      density="compact"
      hideDetails
    />
    <VSwitch
      v-model="rig.showMesh"
      label="Сетка"
      color="primary"
      density="compact"
      hideDetails
    />
    <VSwitch
      v-model="rig.showBones"
      label="Кости"
      color="primary"
      density="compact"
      hideDetails
      class="mb-2"
    />
    <p class="text-caption text-disabled mb-2">
      Картинка тянется за сеткой — выключи сетку и кости, чтобы увидеть чистый
      результат.
    </p>

    <VDivider class="my-3" />

    <template v-if="rig.selectedBone">
      <p class="text-overline text-medium-emphasis mb-2">
        {{ rig.selectedBone.name }}
      </p>
      <VSlider
        v-model="selectedDegrees"
        label="Поворот"
        :min="-180"
        :max="180"
        :step="1"
        density="compact"
        thumbLabel
        hideDetails
        class="mb-1"
      />
      <VSlider
        v-model="rig.selectedBone.poseScale"
        label="Масштаб"
        :min="0.2"
        :max="3"
        :step="0.01"
        density="compact"
        thumbLabel
        hideDetails
      />
    </template>
    <p
      v-else
      class="text-caption text-disabled"
    >
      Выбери кость на холсте или в списке, чтобы вращать её.
    </p>
  </template>
</template>

<style scoped>
  .flex-1-1 {
    flex: 1 1 0;
  }
</style>
