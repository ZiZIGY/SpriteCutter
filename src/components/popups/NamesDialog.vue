<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useFileDialog } from '@vueuse/core';
  import { useSpriteStore } from '@/stores/spriteStore';
  import { useUiStore } from '@/stores/uiStore';
  import { findNameCandidates, norm } from '@/utils/names/extract';
  import SpriteThumb from '@/components/SpriteThumb.vue';

  const store = useSpriteStore();
  const ui = useUiStore();

  const open = computed({
    get: () => ui.dialog === 'names',
    set: (v) => (ui.dialog = v ? 'names' : null),
  });

  // VTextField's clear button sets null.
  const keyword = ref<string | null>('');
  const chosenKey = ref<string | null>(null);
  const shift = ref(0);
  const onlySelected = ref(false);

  watch(open, (v) => {
    if (!v) return;
    onlySelected.value = store.selected.size > 1;
  });

  const targets = computed(() =>
    onlySelected.value && store.selected.size
      ? store.sprites.filter((s) => store.selected.has(s.id))
      : store.sprites
  );

  const candidates = computed(() =>
    findNameCandidates(ui.namesText, {
      keyword: keyword.value ?? '',
      expected: targets.value.length,
    })
  );

  const keywordMissing = computed(
    () =>
      !!norm(keyword.value ?? '') &&
      candidates.value.length > 0 &&
      candidates.value.every((c) => c.match < 0)
  );

  const active = computed(
    () =>
      candidates.value.find((c) => c.key === chosenKey.value) ??
      candidates.value[0] ??
      null
  );

  // A new text or keyword starts from the best guess again.
  watch([() => ui.namesText, keyword], () => {
    chosenKey.value = null;
    shift.value = 0;
  });

  const preview = computed(() =>
    targets.value.map((s, i) => {
      const n = active.value?.names[i - shift.value];
      return {
        sprite: s,
        index: store.sprites.indexOf(s),
        name: n === undefined ? null : n,
        isMatch: !!active.value && active.value.match === i - shift.value,
      };
    })
  );

  const assigned = computed(() => preview.value.filter((p) => p.name).length);
  const namesCount = computed(() => active.value?.names.length ?? 0);

  const countNote = computed(() => {
    const n = namesCount.value;
    const t = targets.value.length;
    if (!active.value || n === t) return '';
    return n > t
      ? `Имён ${n}, спрайтов ${t} — лишние имена не применятся.`
      : `Имён ${n}, спрайтов ${t} — у ${t - n} спрайтов имя не изменится.`;
  });

  /** Put the keyword's name onto the selected sprite and shift the rest along. */
  const canAlign = computed(
    () =>
      !!active.value &&
      active.value.match >= 0 &&
      store.selected.size === 1 &&
      targets.value.some((s) => store.selected.has(s.id))
  );
  function alignToSelected() {
    if (!active.value) return;
    const [id] = store.selected;
    const ti = targets.value.findIndex((s) => s.id === id);
    shift.value = ti - active.value.match;
  }

  function apply() {
    const names = new Map<number, string>();
    for (const p of preview.value) if (p.name) names.set(p.sprite.id, p.name);
    store.applyNames(names);
    ui.notify(`Имена применены: ${names.size}`);
    open.value = false;
  }

  const { open: openFile, onChange } = useFileDialog({
    accept: '.txt,.json,.md,.csv,.tsv,.yaml,.yml,.xml,text/*',
    multiple: false,
    reset: true,
  });
  onChange(async (files) => {
    const f = files?.[0];
    if (f) ui.namesText = await f.text();
  });

  const placeholder = `Вставьте любой текст с именами, например:

arrow
bow
sword

или JSON, markdown-таблицу, CSV, «имя — описание»…`;
</script>

<template>
  <VDialog
    v-model="open"
    max-width="1100"
    scrollable
  >
    <VCard class="names-card">
      <VCardTitle class="d-flex align-center pt-4 px-5">
        <VIcon
          class="mr-2"
          color="primary"
          >mdi-text-box-search-outline</VIcon
        >
        Имена из текста
        <VSpacer />
        <VBtn
          icon="mdi-close"
          variant="text"
          size="small"
          @click="open = false"
        />
      </VCardTitle>

      <VCardText class="names-body">
        <section class="pane">
          <div class="d-flex align-center mb-2">
            <span class="field-label">Текст</span>
            <VSpacer />
            <VBtn
              size="x-small"
              variant="text"
              prependIcon="mdi-file-upload-outline"
              @click="openFile()"
              >Из файла</VBtn
            >
            <VBtn
              v-if="ui.namesText"
              size="x-small"
              variant="text"
              prependIcon="mdi-close"
              @click="ui.namesText = ''"
              >Очистить</VBtn
            >
          </div>
          <textarea
            v-model="ui.namesText"
            class="source"
            :placeholder="placeholder"
            spellcheck="false"
          />

          <VTextField
            v-model="keyword"
            class="mt-3"
            label="Ключевое слово — имя одного из спрайтов"
            placeholder="например: arrow"
            prependInnerIcon="mdi-key-variant"
            density="compact"
            variant="outlined"
            clearable
            hideDetails
          />
          <p class="hint mt-1">
            Напишите, как в тексте назван любой спрайт — остальные имена
            найдутся по тому же шаблону. Без ключевого слова шаблон выбирается
            автоматически.
          </p>

          <div
            v-if="candidates.length"
            class="mt-4"
          >
            <div class="field-label mb-1">Распознано</div>
            <div class="cands">
              <button
                v-for="c in candidates.slice(0, 6)"
                :key="c.key"
                type="button"
                class="cand"
                :class="{ active: active?.key === c.key }"
                @click="chosenKey = c.key"
              >
                <VIcon
                  v-if="c.match >= 0"
                  size="14"
                  color="success"
                  class="mr-1"
                  >mdi-check-circle</VIcon
                >
                <span class="cand-label">{{ c.label }}</span>
                <span class="cand-count">{{ c.names.length }}</span>
                <span class="cand-sample">{{ c.names.slice(0, 4).join(', ') }}…</span>
              </button>
            </div>
          </div>

          <VAlert
            v-if="keywordMissing"
            type="warning"
            variant="tonal"
            density="compact"
            class="mt-3 text-body-medium"
          >
            «{{ keyword }}» в тексте не найдено — показан лучший вариант без
            ключевого слова.
          </VAlert>
          <VAlert
            v-if="ui.namesText.trim() && !candidates.length"
            type="info"
            variant="tonal"
            density="compact"
            class="mt-3 text-body-medium"
          >
            Не удалось выделить имена из этого текста.
          </VAlert>
        </section>

        <section class="pane preview-pane">
          <div class="d-flex align-center flex-wrap ga-2 mb-2">
            <span class="field-label">Предпросмотр</span>
            <VSpacer />
            <VSwitch
              v-if="store.selected.size"
              v-model="onlySelected"
              density="compact"
              hideDetails
              color="primary"
              :label="`Только выделенные (${store.selected.size})`"
              class="flex-grow-0"
            />
          </div>

          <div class="d-flex align-center ga-2 mb-2">
            <span class="text-body-medium">Сдвиг</span>
            <VBtn
              icon="mdi-chevron-left"
              size="x-small"
              variant="tonal"
              @click="shift--"
            />
            <span class="shift-val">{{ shift > 0 ? `+${shift}` : shift }}</span>
            <VBtn
              icon="mdi-chevron-right"
              size="x-small"
              variant="tonal"
              @click="shift++"
            />
            <VBtn
              v-if="canAlign"
              size="x-small"
              variant="text"
              color="primary"
              prependIcon="mdi-link-variant"
              @click="alignToSelected"
            >
              «{{ active!.names[active!.match] }}» → выделенный спрайт
            </VBtn>
          </div>

          <p
            v-if="countNote"
            class="hint mb-2"
          >
            {{ countNote }}
          </p>

          <div class="preview-list">
            <div
              v-if="!targets.length"
              class="hint pa-3"
            >
              Нет спрайтов.
            </div>
            <div
              v-for="p in preview"
              :key="p.sprite.id"
              class="prow"
              :class="{ match: p.isMatch }"
            >
              <span class="idx">{{ p.index + 1 }}</span>
              <SpriteThumb
                :id="p.sprite.id"
                :size="34"
              />
              <VIcon
                size="14"
                class="mx-1 text-disabled"
                >mdi-arrow-right</VIcon
              >
              <span
                v-if="p.name"
                class="pname"
                >{{ p.name }}</span
              >
              <span
                v-else
                class="pname empty"
                >{{ p.sprite.name || '—' }}</span
              >
              <span
                v-if="p.name && p.sprite.name && p.sprite.name !== p.name"
                class="old"
                >{{ p.sprite.name }}</span
              >
            </div>
          </div>
        </section>
      </VCardText>

      <VCardActions class="px-5 pb-4">
        <span class="hint">Ctrl+V с текстом в любом месте тоже открывает это окно</span>
        <VSpacer />
        <VBtn
          variant="text"
          @click="open = false"
          >Отмена</VBtn
        >
        <VBtn
          color="primary"
          variant="flat"
          prependIcon="mdi-check"
          :disabled="!assigned"
          @click="apply"
        >
          Применить ({{ assigned }})
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
  .names-body {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
    gap: 20px;
    padding: 8px 20px 12px !important;
  }
  @media (max-width: 800px) {
    .names-body {
      grid-template-columns: 1fr;
    }
  }
  .pane {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .field-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgba(var(--v-theme-on-surface), 0.6);
  }
  .hint {
    font-size: 12px;
    color: rgba(var(--v-theme-on-surface), 0.6);
  }
  .source {
    width: 100%;
    min-height: 260px;
    height: 36vh;
    resize: vertical;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.2);
    background: rgba(var(--v-theme-on-surface), 0.03);
    color: rgb(var(--v-theme-on-surface));
    font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    outline: none;
    white-space: pre;
  }
  .source:focus {
    border-color: rgb(var(--v-theme-primary));
  }
  .cands {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .cand {
    display: flex;
    align-items: center;
    gap: 6px;
    text-align: left;
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
    color: rgb(var(--v-theme-on-surface));
    font-size: 13px;
    min-width: 0;
  }
  .cand:hover {
    background: rgba(var(--v-theme-on-surface), 0.05);
  }
  .cand.active {
    border-color: rgb(var(--v-theme-primary));
    background: rgba(var(--v-theme-primary), 0.1);
  }
  .cand-label {
    font-weight: 500;
    white-space: nowrap;
  }
  .cand-count {
    font-size: 11px;
    padding: 0 6px;
    border-radius: 10px;
    background: rgba(var(--v-theme-on-surface), 0.1);
    font-variant-numeric: tabular-nums;
  }
  .cand-sample {
    color: rgba(var(--v-theme-on-surface), 0.55);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .shift-val {
    min-width: 28px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .preview-list {
    flex: 1;
    min-height: 200px;
    max-height: 52vh;
    overflow-y: auto;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
    border-radius: 8px;
    padding: 4px;
  }
  .prow {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 6px;
    border-radius: 6px;
    min-width: 0;
  }
  .prow.match {
    background: rgba(var(--v-theme-success), 0.14);
  }
  .idx {
    width: 22px;
    text-align: right;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    color: rgba(var(--v-theme-on-surface), 0.55);
    flex-shrink: 0;
  }
  .pname {
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .pname.empty {
    font-weight: 400;
    color: rgba(var(--v-theme-on-surface), 0.4);
  }
  .old {
    font-size: 12px;
    text-decoration: line-through;
    color: rgba(var(--v-theme-on-surface), 0.4);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
