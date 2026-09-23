<script setup lang="ts">
  import { computed, nextTick, useTemplateRef, watch } from 'vue';
  import { useSpriteStore, type Sprite } from '@/stores/spriteStore';
  import { useUiStore } from '@/stores/uiStore';
  import SpriteThumb from './SpriteThumb.vue';

  const store = useSpriteStore();
  const ui = useUiStore();
  const listRef = useTemplateRef<HTMLDivElement>('listRef');

  const rows = computed(() => {
    const out: { row: number; items: { sprite: Sprite; index: number }[] }[] = [];
    store.sprites.forEach((sprite, index) => {
      const last = out[out.length - 1];
      if (last?.row === sprite.row) last.items.push({ sprite, index });
      else out.push({ row: sprite.row, items: [{ sprite, index }] });
    });
    return out;
  });

  const named = computed(() => store.sprites.filter((s) => s.name).length);

  function defaultName(index: number) {
    return `sprite_${String(index + 1).padStart(2, '0')}`;
  }

  function onItemClick(e: MouseEvent, s: Sprite) {
    if (e.shiftKey || e.ctrlKey || e.metaKey) store.toggleSelect(s.id);
    else store.selectOnly(s.id);
    store.reveal(s.id);
  }

  // Selecting on the canvas scrolls the list to the (first) selected sprite.
  watch(
    () => store.selected,
    async (sel) => {
      if (sel.size !== 1) return;
      await nextTick();
      const [id] = sel;
      listRef.value
        ?.querySelector(`[data-id="${id}"]`)
        ?.scrollIntoView({ block: 'nearest' });
    }
  );
</script>

<template>
  <div class="panel">
    <div class="panel-head">
      <span class="text-title-small">Спрайты</span>
      <VChip
        size="x-small"
        variant="tonal"
        class="ml-2"
        >{{ store.sprites.length }}</VChip
      >
      <VSpacer />
      <VBtn
        size="x-small"
        variant="text"
        prependIcon="mdi-text-box-search-outline"
        @click="ui.openNames()"
      >
        Имена из текста
      </VBtn>
    </div>

    <div
      ref="listRef"
      class="panel-body"
    >
      <div
        v-if="!store.sprites.length"
        class="empty text-body-small text-medium-emphasis"
      >
        Спрайты не найдены. Откройте «Поиск» и поправьте цвет фона или допуск —
        или нарисуйте рамку вручную (B).
      </div>

      <template
        v-for="group in rows"
        :key="group.row"
      >
        <div class="row-head">
          Ряд {{ group.row + 1 }}
          <span class="text-disabled">· {{ group.items.length }}</span>
        </div>
        <div
          v-for="{ sprite, index } in group.items"
          :key="sprite.id"
          class="item"
          :class="{
            selected: store.selected.has(sprite.id),
            hovered: store.hovered === sprite.id,
            skipped: sprite.skip,
          }"
          :data-id="sprite.id"
          @click="onItemClick($event, sprite)"
          @mouseenter="store.hovered = sprite.id"
          @mouseleave="store.hovered = null"
        >
          <span class="idx">{{ index + 1 }}</span>
          <SpriteThumb :id="sprite.id" />
          <input
            class="name-input"
            :value="sprite.name"
            :placeholder="defaultName(index)"
            spellcheck="false"
            @input="
              store.setName(sprite.id, ($event.target as HTMLInputElement).value)
            "
            @click.stop
            @focus="store.selectOnly(sprite.id)"
            @keydown.enter="($event.target as HTMLInputElement).blur()"
          />
          <button
            type="button"
            class="skip-btn"
            :class="{ on: sprite.skip }"
            :title="sprite.skip ? 'Вернуть в экспорт' : 'Пропустить (не экспортировать)'"
            @click.stop="store.toggleSkip(sprite.id)"
          >
            <VIcon size="16">{{
              sprite.skip ? 'mdi-eye-off-outline' : 'mdi-eye-outline'
            }}</VIcon>
          </button>
        </div>
      </template>
    </div>

    <div class="panel-foot text-body-small text-medium-emphasis">
      <span v-if="store.frames"
        >Кадр {{ store.frames.width }}×{{ store.frames.height }}</span
      >
      <span>· с именами {{ named }}/{{ store.sprites.length }}</span>
      <VSpacer />
      <VBtn
        v-if="named"
        size="x-small"
        variant="text"
        color="error"
        @click="store.clearNames()"
      >
        Сбросить имена
      </VBtn>
    </div>
  </div>
</template>

<style scoped>
  .panel {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-radius: 12px;
    border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
    background: rgb(var(--v-theme-surface));
    overflow: hidden;
  }
  .panel-head,
  .panel-foot {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    flex-shrink: 0;
  }
  .panel-head {
    border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  }
  .panel-foot {
    border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
    min-height: 40px;
  }
  .panel-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 4px 6px 8px;
  }
  .empty {
    padding: 16px 8px;
  }
  .row-head {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgba(var(--v-theme-on-surface), 0.6);
    padding: 10px 6px 4px;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 6px;
    border-radius: 8px;
    cursor: pointer;
    border: 1px solid transparent;
  }
  .item.hovered {
    background: rgba(var(--v-theme-on-surface), 0.05);
  }
  .item.selected {
    background: rgba(255, 179, 0, 0.12);
    border-color: rgba(255, 179, 0, 0.5);
  }
  .item.skipped .thumb,
  .item.skipped :deep(.thumb),
  .item.skipped .name-input {
    opacity: 0.35;
  }
  .skip-btn {
    flex-shrink: 0;
    width: 26px;
    height: 26px;
    border: none;
    background: none;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(var(--v-theme-on-surface), 0.35);
  }
  .item:hover .skip-btn,
  .skip-btn.on {
    color: rgba(var(--v-theme-on-surface), 0.8);
  }
  .skip-btn:hover {
    background: rgba(var(--v-theme-on-surface), 0.08);
  }
  .idx {
    width: 22px;
    flex-shrink: 0;
    text-align: right;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    color: rgba(var(--v-theme-on-surface), 0.55);
  }
  .name-input {
    flex: 1;
    min-width: 0;
    height: 30px;
    padding: 0 8px;
    border-radius: 6px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.14);
    background: transparent;
    color: rgb(var(--v-theme-on-surface));
    font: inherit;
    font-size: 13px;
    outline: none;
  }
  .name-input::placeholder {
    color: rgba(var(--v-theme-on-surface), 0.35);
  }
  .name-input:focus {
    border-color: rgb(var(--v-theme-primary));
  }
</style>
