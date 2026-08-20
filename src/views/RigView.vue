<script setup lang="ts">
  import RigCanvas from '@/components/rig/RigCanvas.vue';
</script>

<template>
  <div class="fill-viewport d-flex flex-column pa-3">
    <RigCanvas />
  </div>
</template>

<style scoped>
  .fill-viewport {
    height: 100%;
    box-sizing: border-box;
  }
</style>
