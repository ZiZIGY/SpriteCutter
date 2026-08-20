<script setup lang="ts">
  import { ref } from 'vue';
  import { useRigStore } from '@/stores/rigStore';
  import type { SkeletonPreset } from '@/utils/rig/presets';

  const rig = useRigStore();

  /** Applying a preset discards the current skeleton, so confirm first. */
  function applyPreset(preset: SkeletonPreset) {
    if (
      rig.bones.length &&
      !confirm(
        `Заменить текущий скелет (${rig.bones.length} костей) на «${preset.label}»?`
      )
    )
      return;
    rig.applyPreset(preset);
  }
  const renamingId = ref<number | null>(null);
  const renameDraft = ref('');

  function startRename(id: number, current: string) {
    renamingId.value = id;
    renameDraft.value = current;
  }

  function commitRename() {
    if (renamingId.value !== null) rig.renameBone(renamingId.value, renameDraft.value);
    renamingId.value = null;
  }

  /** Parent options exclude the bone itself; the store rejects cycles too. */
  function parentOptions(boneId: number) {
    return [
      { title: '— корень —', value: null as number | null },
      ...rig.bones
        .filter((b) => b.id !== boneId)
        .map((b) => ({ title: b.name, value: b.id as number | null })),
    ];
  }
</script>

<template>
  <p class="text-overline text-medium-emphasis mb-2">Готовый скелет</p>
  <div class="preset-grid mb-2">
    <VBtn
      v-for="preset in rig.skeletonPresets"
      :key="preset.id"
      size="small"
      variant="tonal"
      :prependIcon="preset.icon"
      class="preset-btn"
      :disabled="!rig.region.width"
      @click="applyPreset(preset)"
    >
      {{ preset.label }}
      <VTooltip
        activator="parent"
        location="bottom"
        >{{ preset.description }}</VTooltip
      >
    </VBtn>
  </div>
  <p class="text-caption text-disabled mb-3">
    Скелет подгоняется под размер спрайта — потом подвинь суставы под свою
    картинку.
  </p>

  <VDivider class="my-3" />

  <p class="text-caption text-disabled mb-3">
    Тяни по холсту, чтобы создать кость. Начни рядом с кончиком другой кости —
    сустав прилипнет к нему, и цепочка пойдёт без разрыва.
  </p>

  <VAlert
    v-if="!rig.bones.length"
    type="info"
    variant="tonal"
    density="compact"
    class="mb-3 text-caption"
  >
    Костей пока нет. Начни с корневой — например, бедро или туловище.
  </VAlert>

  <VList
    v-else
    density="compact"
    class="bone-list mb-2"
    :selected="rig.selectedBoneId !== null ? [rig.selectedBoneId] : []"
  >
    <VListItem
      v-for="row in rig.boneTree"
      :key="row.bone.id"
      :value="row.bone.id"
      :active="rig.selectedBoneId === row.bone.id"
      class="bone-row"
      :style="{ paddingLeft: `${8 + row.depth * 14}px` }"
      @click="rig.selectedBoneId = row.bone.id"
    >
      <template #prepend>
        <VIcon
          size="15"
          :color="row.bone.physics?.enabled ? 'primary' : undefined"
          class="mr-1"
        >
          {{ row.bone.physics?.enabled ? 'mdi-waves' : 'mdi-bone' }}
        </VIcon>
      </template>

      <VTextField
        v-if="renamingId === row.bone.id"
        v-model="renameDraft"
        density="compact"
        variant="plain"
        hide-details
        autofocus
        class="rename-field"
        @blur="commitRename"
        @keydown.enter="commitRename"
        @keydown.esc="renamingId = null"
        @click.stop
      />
      <VListItemTitle
        v-else
        class="text-caption"
        @dblclick.stop="startRename(row.bone.id, row.bone.name)"
      >
        {{ row.bone.name }}
      </VListItemTitle>

      <template #append>
        <VBtn
          icon="mdi-close"
          size="x-small"
          variant="text"
          density="compact"
          @click.stop="rig.removeBone(row.bone.id)"
        />
      </template>
    </VListItem>
  </VList>

  <template v-if="rig.selectedBone">
    <VDivider class="my-3" />
    <p class="text-overline text-medium-emphasis mb-2">
      {{ rig.selectedBone.name }}
    </p>

    <VBtn
      size="small"
      variant="tonal"
      color="primary"
      block
      prependIcon="mdi-ray-start-arrow"
      class="mb-3"
      @click="rig.extendBone(rig.selectedBone.id)"
    >
      Продолжить кость
      <VTooltip
        activator="parent"
        location="bottom"
      >
        Добавит дочернюю кость от кончика этой, без разрыва
      </VTooltip>
    </VBtn>

    <VSelect
      :modelValue="rig.selectedBone.parentId"
      :items="parentOptions(rig.selectedBone.id)"
      label="Родитель"
      density="compact"
      variant="outlined"
      hideDetails
      class="mb-3"
      @update:modelValue="
        (value: number | null) =>
          rig.setBoneParent(rig.selectedBone!.id, value)
      "
    />

    <VSlider
      v-model="rig.selectedBone.length"
      label="Длина"
      :min="4"
      :max="Math.max(rig.region.width, rig.region.height)"
      :step="1"
      density="compact"
      hideDetails
      thumbLabel
      class="mb-2"
    />

    <VDivider class="my-3" />

    <VSwitch
      :modelValue="!!rig.selectedBone.physics?.enabled"
      label="Пружинная физика"
      color="primary"
      density="compact"
      hideDetails
      class="mb-1"
      @update:modelValue="
        (value: boolean | null) =>
          rig.toggleBonePhysics(rig.selectedBone!.id, !!value)
      "
    />

    <template v-if="rig.selectedBone.physics">
      <p class="text-caption text-disabled mb-2">
        Кость инерционно догоняет родителя — для волос, хвоста, плаща.
      </p>
      <VSlider
        v-model="rig.selectedBone.physics.stiffness"
        label="Жёсткость"
        :min="0.02"
        :max="1"
        :step="0.01"
        density="compact"
        hideDetails
        thumbLabel
      />
      <VSlider
        v-model="rig.selectedBone.physics.damping"
        label="Затухание"
        :min="0.05"
        :max="0.95"
        :step="0.01"
        density="compact"
        hideDetails
        thumbLabel
      />
      <VSlider
        v-model="rig.selectedBone.physics.gravity"
        label="Гравитация"
        :min="0"
        :max="1"
        :step="0.01"
        density="compact"
        hideDetails
        thumbLabel
      />
      <VSlider
        v-model="rig.selectedBone.physics.inertia"
        label="Инерция"
        :min="0"
        :max="2"
        :step="0.01"
        density="compact"
        hideDetails
        thumbLabel
      />
    </template>
  </template>

  <VDivider class="my-3" />
  <VBtn
    v-if="rig.bones.length"
    size="small"
    variant="tonal"
    color="error"
    block
    prependIcon="mdi-delete-sweep"
    @click="rig.clearBones()"
  >
    Удалить все кости
  </VBtn>
</template>

<style scoped>
  .preset-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .preset-btn {
    text-transform: none;
    font-size: 11px;
    min-width: 0;
  }
  .preset-btn :deep(.v-btn__content) {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .bone-list {
    max-height: 260px;
    overflow-y: auto;
    background: transparent;
  }
  .bone-row {
    min-height: 32px;
  }
  .rename-field :deep(input) {
    font-size: 12px;
    padding: 0;
  }
</style>
