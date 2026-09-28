<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useSpriteStore, type SpriteAnimation } from '@/stores/spriteStore';
  import FrameView from '@/components/FrameView.vue';

  /** The frames of an animation in order: pick, drag to reorder, remove, add. */
  const props = defineProps<{ anim: SpriteAnimation }>();
  const frame = defineModel<number>('frame', { required: true });
  const emit = defineEmits<{ pick: [] }>();

  const store = useSpriteStore();
  const CELL = 72;

  const items = computed(() => {
    const f = store.frames;
    return props.anim.frames
      .map((id, index) => ({ id, index }))
      .filter((it) => f?.byId.has(it.id));
  });

  const scale = computed(() => {
    const f = store.frames;
    return f ? CELL / Math.max(f.width, f.height) : 1;
  });

  const nameOf = (id: number) => {
    const i = store.sprites.findIndex((s) => s.id === id);
    const s = store.sprites[i];
    return s?.name || `sprite_${String(i + 1).padStart(2, '0')}`;
  };

  const dragFrom = ref<number | null>(null);
  const dropAt = ref<number | null>(null);

  function onDrop(to: number) {
    if (dragFrom.value !== null && dragFrom.value !== to) {
      store.moveFrame(props.anim.id, dragFrom.value, to);
      frame.value = to;
    }
    dragFrom.value = null;
    dropAt.value = null;
  }

  function startDrag(e: DragEvent, index: number) {
    dragFrom.value = index;
    // Firefox starts a drag only when some data is set.
    e.dataTransfer?.setData('text/plain', String(index));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  function endDrag() {
    dragFrom.value = null;
    dropAt.value = null;
  }

  function pickFrames() {
    store.selectAnimationFrames(props.anim.id);
    emit('pick');
  }

  function remove(index: number) {
    store.removeFrame(props.anim.id, index);
    frame.value = Math.min(frame.value, Math.max(0, props.anim.frames.length - 1));
  }

  const addable = computed(
    () => [...store.selected].filter((id) => !props.anim.frames.includes(id)).length
  );
</script>

<template>
  <div class="timeline">
    <div
      v-for="(it, pos) in items"
      :key="`${it.id}-${it.index}`"
      class="tl-cell"
      :class="{
        active: pos === frame,
        dragging: dragFrom === it.index,
        'drop-here': dropAt === it.index && dragFrom !== it.index,
      }"
      draggable="true"
      :title="nameOf(it.id)"
      @click="frame = pos"
      @dragstart="startDrag($event, it.index)"
      @dragover.prevent="dropAt = it.index"
      @dragleave="dropAt = dropAt === it.index ? null : dropAt"
      @drop.prevent="onDrop(it.index)"
      @dragend="endDrag"
    >
      <div
        class="tl-thumb"
        :style="{ width: `${CELL}px`, height: `${CELL}px` }"
      >
        <FrameView
          :id="it.id"
          :scale="scale"
          :style="{
            width: `${(store.frames?.width ?? 0) * scale}px`,
            height: `${(store.frames?.height ?? 0) * scale}px`,
          }"
        />
      </div>
      <div class="tl-foot">
        <span class="tl-num">{{ pos + 1 }}</span>
        <span
          v-if="anim.nudge[it.id]"
          class="tl-nudged"
          title="Кадр сдвинут вручную"
          >●</span
        >
      </div>
      <button
        type="button"
        class="tl-remove"
        title="Убрать кадр из анимации"
        @click.stop="remove(it.index)"
      >
        <VIcon size="14">mdi-close</VIcon>
      </button>
    </div>

    <button
      type="button"
      class="tl-add"
      :disabled="!addable"
      :title="
        addable
          ? 'Добавить выделенные на холсте или в списке спрайты'
          : 'Выделите спрайты в списке справа, чтобы добавить их'
      "
      @click="store.addSelectedFrames(anim.id)"
    >
      <VIcon>mdi-plus</VIcon>
      <span>{{ addable ? `Добавить (${addable})` : 'Добавить выделенные' }}</span>
    </button>
    <button
      type="button"
      class="tl-add"
      title="Выделить кадры этой анимации в списке и на холсте"
      @click="pickFrames"
    >
      <VIcon>mdi-select-group</VIcon>
      <span>Выделить кадры</span>
    </button>
  </div>
</template>

<style scoped>
  .timeline {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding: 8px 4px 10px;
  }
  .tl-cell {
    position: relative;
    flex-shrink: 0;
    border-radius: 10px;
    border: 2px solid transparent;
    padding: 4px;
    cursor: pointer;
    background: rgba(var(--v-theme-on-surface), 0.04);
  }
  .tl-cell:hover {
    background: rgba(var(--v-theme-on-surface), 0.08);
  }
  .tl-cell.active {
    border-color: rgb(var(--v-theme-primary));
  }
  .tl-cell.dragging {
    opacity: 0.4;
  }
  .tl-cell.drop-here {
    border-color: #ffb300;
    border-style: dashed;
  }
  .tl-thumb {
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background:
      repeating-conic-gradient(rgba(128, 128, 128, 0.22) 0% 25%, transparent 0% 50%)
      0 0 / 10px 10px;
  }
  .tl-foot {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    margin-top: 2px;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    color: rgba(var(--v-theme-on-surface), 0.7);
  }
  .tl-nudged {
    color: rgb(var(--v-theme-primary));
    font-size: 9px;
  }
  .tl-remove {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: none;
    align-items: center;
    justify-content: center;
    color: #fff;
    background: rgba(16, 20, 32, 0.85);
  }
  .tl-cell:hover .tl-remove {
    display: flex;
  }
  .tl-remove:hover {
    background: rgb(var(--v-theme-error));
  }
  .tl-add {
    flex-shrink: 0;
    width: 96px;
    border-radius: 10px;
    border: 2px dashed rgba(var(--v-theme-on-surface), 0.2);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    font-size: 11px;
    text-align: center;
    color: rgba(var(--v-theme-on-surface), 0.7);
    padding: 6px;
  }
  .tl-add:hover:not(:disabled) {
    border-color: rgb(var(--v-theme-primary));
    color: rgb(var(--v-theme-primary));
  }
  .tl-add:disabled {
    opacity: 0.45;
    cursor: default;
  }
</style>
