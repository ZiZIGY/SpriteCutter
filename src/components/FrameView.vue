<script setup lang="ts">
  import { onMounted, useTemplateRef, watch } from 'vue';
  import { useSpriteStore } from '@/stores/spriteStore';
  import { paintFrame } from '@/utils/render/frames';

  /** One output frame at `scale`, exactly as the export paints it. */
  const props = defineProps<{ id: number; scale: number }>();

  const store = useSpriteStore();
  const canvasRef = useTemplateRef<HTMLCanvasElement>('canvasRef');

  function draw() {
    const canvas = canvasRef.value;
    const f = store.frames;
    if (!canvas || !f) return;
    const dpr = window.devicePixelRatio || 1;
    const k = props.scale * dpr;
    const w = Math.max(1, Math.round(f.width * k));
    const h = Math.max(1, Math.round(f.height * k));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    const item = f.byId.get(props.id);
    if (item) paintFrame(ctx, f, item, 0, 0, k);
  }

  onMounted(draw);
  watch(() => [store.frames, props.id, props.scale], draw, { flush: 'post' });
</script>

<template>
  <canvas
    ref="canvasRef"
    class="frame"
  />
</template>

<style scoped>
  .frame {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
