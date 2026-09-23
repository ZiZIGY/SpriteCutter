<script setup lang="ts">
  import { onMounted, useTemplateRef, watch } from 'vue';
  import { useSpriteStore } from '@/stores/spriteStore';
  import { paintFrame } from '@/utils/render/frames';

  /** The sprite as it will be exported: cleaned, scaled and placed in the frame. */
  const props = withDefaults(defineProps<{ id: number; size?: number }>(), {
    size: 44,
  });

  const store = useSpriteStore();
  const canvasRef = useTemplateRef<HTMLCanvasElement>('canvasRef');

  function draw() {
    const canvas = canvasRef.value;
    const f = store.frames;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const px = Math.round(props.size * dpr);
    if (canvas.width !== px) canvas.width = canvas.height = px;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, px, px);
    const item = f?.byId.get(props.id);
    if (!f || !item) return;

    const k = Math.min(px / f.width, px / f.height);
    const ox = (px - f.width * k) / 2;
    const oy = (px - f.height * k) / 2;
    paintFrame(ctx, f, item, ox, oy, k);
    ctx.strokeStyle = 'rgba(128, 128, 128, 0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + 0.5, oy + 0.5, f.width * k - 1, f.height * k - 1);
  }

  onMounted(draw);
  watch(() => [store.frames, props.id, props.size], draw, { flush: 'post' });
</script>

<template>
  <canvas
    ref="canvasRef"
    class="thumb"
    :style="{ width: `${size}px`, height: `${size}px` }"
  />
</template>

<style scoped>
  .thumb {
    flex-shrink: 0;
    border-radius: 6px;
    background:
      repeating-conic-gradient(rgba(128, 128, 128, 0.22) 0% 25%, transparent 0% 50%)
      0 0 / 10px 10px;
  }
</style>
