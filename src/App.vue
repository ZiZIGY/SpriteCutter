<script setup lang="ts">
  import { computed } from 'vue';
  import { useRoute } from 'vue-router';
  import { useTheme } from 'vuetify';
  import { useLocalStorage } from '@vueuse/core';

  import { useSpriteStore } from '@/stores/spriteStore';
  import { useRigStore } from '@/stores/rigStore';
  import CutterSidebar from '@/components/layout/CutterSidebar.vue';
  import RigSidebar from '@/components/layout/RigSidebar.vue';

  const store = useSpriteStore();
  const rig = useRigStore();
  const route = useRoute();
  const theme = useTheme();
  const isDark = computed(() => theme.current.value.dark);

  const savedTheme = useLocalStorage<'light' | 'dark'>(
    'sprite-cutter-theme',
    'dark'
  );
  theme.global.name.value = savedTheme.value;

  function toggleTheme() {
    savedTheme.value = isDark.value ? 'light' : 'dark';
    theme.global.name.value = savedTheme.value;
  }

  /** Which sidebar the current route asks for; null hides the drawer. */
  const sidebar = computed(() =>
    store.imageSrc ? (route.meta.sidebar ?? null) : null
  );

  const navItems = [
    { to: '/', icon: 'mdi-grid-large', label: 'Нарезка' },
    { to: '/rig', icon: 'mdi-bone', label: '2D Rigging' },
  ];

  function resetAll() {
    rig.reset();
    store.reset();
  }
</script>

<template>
  <VApp>
    <VAppBar
      flat
      border="b"
      color="surface"
    >
      <VAppBarTitle class="pl-2 flex-grow-0 mr-4">
        <span class="text-primary font-weight-bold">Sprite</span
        ><span class="text-on-surface">Cutter</span>
      </VAppBarTitle>

      <VTabs
        v-if="store.imageSrc"
        :modelValue="route.path"
        color="primary"
        density="compact"
      >
        <VTab
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          :value="item.to"
          :prependIcon="item.icon"
          class="nav-tab"
        >
          {{ item.label }}
        </VTab>
      </VTabs>

      <template #append>
        <VChip
          v-if="store.imageSrc"
          size="small"
          variant="tonal"
          class="mr-3"
        >
          {{ store.imageWidth }}×{{ store.imageHeight }}
        </VChip>
        <VBtn
          v-if="store.imageSrc"
          prependIcon="mdi-image-plus"
          text="Новое"
          variant="tonal"
          size="small"
          class="mr-2"
          @click="resetAll"
        />
        <VBtn
          :icon="isDark ? 'mdi-weather-sunny' : 'mdi-weather-night'"
          variant="text"
          size="small"
          class="mr-2"
          @click="toggleTheme"
        />
      </template>
    </VAppBar>

    <VNavigationDrawer
      v-if="sidebar"
      permanent
      width="300"
      color="surface"
      style="overflow-y: auto"
    >
      <CutterSidebar v-if="sidebar === 'cutter'" />
      <RigSidebar v-else-if="sidebar === 'rig'" />
    </VNavigationDrawer>

    <VMain>
      <RouterView />
    </VMain>
  </VApp>
</template>

<style scoped>
  .nav-tab {
    text-transform: none;
    letter-spacing: normal;
  }
</style>
