<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useTheme } from 'vuetify';
  import {
    useDropZone,
    useEventListener,
    useLocalStorage,
  } from '@vueuse/core';

  import { useSpriteStore } from '@/stores/spriteStore';
  import { useUiStore } from '@/stores/uiStore';
  import { useFileIntake } from '@/composables/useFileIntake';
  import DetectMenu from '@/components/popups/DetectMenu.vue';
  import FrameMenu from '@/components/popups/FrameMenu.vue';
  import NamesDialog from '@/components/popups/NamesDialog.vue';
  import AnimationsDialog from '@/components/popups/AnimationsDialog.vue';
  import ExportDialog from '@/components/popups/ExportDialog.vue';

  const store = useSpriteStore();
  const ui = useUiStore();
  const { takeFiles, takeText } = useFileIntake();

  const theme = useTheme();
  const isDark = computed(() => theme.current.value.dark);
  const savedTheme = useLocalStorage<'light' | 'dark'>(
    'sprite-cutter-theme',
    'dark'
  );
  theme.change(savedTheme.value);
  function toggleTheme() {
    savedTheme.value = isDark.value ? 'light' : 'dark';
    theme.change(savedTheme.value);
  }

  // ── files and clipboard, anywhere on the page ──────────────────────────────
  const { isOverDropZone } = useDropZone(() => document.body, {
    // Only files: dragging selected text into a field stays a native drop.
    checkValidity: (items) => [...items].some((i) => i.kind === 'file'),
    onDrop: (files) => {
      if (files) takeFiles(files);
    },
  });

  useEventListener(window, 'paste', async (e: ClipboardEvent) => {
    const target = e.target as HTMLElement | null;
    // A paste into a field stays a normal paste.
    if (target?.closest?.('input, textarea, [contenteditable="true"]')) return;
    const files = [...(e.clipboardData?.files ?? [])];
    if (files.length) {
      e.preventDefault();
      if (await takeFiles(files)) return;
    }
    const text = e.clipboardData?.getData('text/plain');
    if (text?.trim()) {
      e.preventDefault();
      takeText(text);
    }
  });

  // Names text that arrived before the image: open the dialog once sprites exist.
  watch(
    () => store.analysis,
    (an) => {
      if (an && ui.namesPending) {
        ui.namesPending = false;
        ui.openNames();
      }
    }
  );

  // ── toast ──────────────────────────────────────────────────────────────────
  const toastOpen = ref(false);
  watch(
    () => ui.toast,
    (t) => {
      if (t) toastOpen.value = true;
    }
  );
</script>

<template>
  <VApp>
    <VAppBar
      flat
      border="b"
      color="surface"
      density="compact"
    >
      <!-- Not VAppBarTitle: its flex-basis of 0 collapses it to nothing. -->
      <div class="logo">
        <span class="text-primary font-weight-bold">Sprite</span
        ><span class="text-on-surface">Cutter</span>
      </div>

      <template v-if="store.imageSrc">
        <DetectMenu />
        <FrameMenu />
        <VBtn
          variant="text"
          prependIcon="mdi-text-box-search-outline"
          class="bar-btn"
          @click="ui.openNames()"
        >
          Имена
        </VBtn>
        <VBtn
          variant="text"
          prependIcon="mdi-filmstrip"
          class="bar-btn"
          @click="ui.open('animations')"
        >
          Анимации
          <VBadge
            v-if="store.animations.length"
            :content="store.animations.length"
            inline
            color="primary"
          />
        </VBtn>
      </template>

      <template #append>
        <template v-if="store.imageSrc">
          <VChip
            size="small"
            variant="tonal"
            class="mr-3 d-none d-md-flex"
          >
            {{ store.imageWidth }}×{{ store.imageHeight }}
          </VChip>
          <VBtn
            color="primary"
            variant="flat"
            prependIcon="mdi-export-variant"
            class="bar-btn mr-2"
            :disabled="!store.sprites.length"
            @click="ui.open('export')"
          >
            Экспорт
          </VBtn>
          <VBtn
            prependIcon="mdi-image-plus"
            variant="tonal"
            class="bar-btn mr-2"
            @click="store.reset()"
          >
            Новое
          </VBtn>
        </template>
        <VBtn
          :icon="isDark ? 'mdi-weather-sunny' : 'mdi-weather-night'"
          variant="text"
          size="small"
          class="mr-2"
          @click="toggleTheme"
        />
      </template>
    </VAppBar>

    <!-- A definite height, so the editor's 100% resolves to the window and the
         sprite list scrolls inside its panel instead of stretching the page. -->
    <VMain class="app-main">
      <RouterView />
    </VMain>

    <NamesDialog />
    <AnimationsDialog />
    <ExportDialog />

    <Transition name="fade">
      <div
        v-if="isOverDropZone && store.imageSrc"
        class="drop-overlay"
      >
        <VIcon size="56">mdi-tray-arrow-down</VIcon>
        <p class="text-title-large mt-3">Картинка — новый лист, текст — имена</p>
      </div>
    </Transition>

    <VSnackbar
      v-model="toastOpen"
      :color="ui.toast?.color || undefined"
      timeout="2600"
      location="bottom"
    >
      {{ ui.toast?.text }}
    </VSnackbar>
  </VApp>
</template>

<style scoped>
  .bar-btn {
    text-transform: none;
    letter-spacing: normal;
  }
  .logo {
    flex-shrink: 0;
    font-size: 18px;
    padding: 0 16px 0 16px;
    white-space: nowrap;
  }
  .app-main {
    height: 100dvh;
    overflow: auto;
  }
  .drop-overlay {
    position: fixed;
    inset: 0;
    z-index: 3000;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: rgba(var(--v-theme-primary), 0.18);
    border: 3px dashed rgb(var(--v-theme-primary));
    color: rgb(var(--v-theme-primary));
    pointer-events: none;
  }
  .fade-enter-active,
  .fade-leave-active {
    transition: opacity 0.15s ease;
  }
  .fade-enter-from,
  .fade-leave-to {
    opacity: 0;
  }
</style>
