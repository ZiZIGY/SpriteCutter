<script setup lang="ts">
  import { onMounted, onUnmounted, useTemplateRef } from 'vue';
  import { useSpriteStore } from '@/stores/spriteStore';
  import { paintFrame } from '@/utils/render/frames';

  /** Plays the exported frames (cleaned and normalized), not raw sheet cells. */
  const props = withDefaults(
    defineProps<{ frames: number[]; fps: number; size?: number }>(),
    { size: 72 }
  );

  const store = useSpriteStore();
  const canvasRef = useTemplateRef<HTMLCanvasElement>('canvasRef');

  let raf = 0;
  let last = 0;
  let idx = 0;

  function draw() {
    const canvas = canvasRef.value;
    const f = store.frames;
    if (!canvas || !f) return;
    const dpr = window.devicePixelRatio || 1;
    const px = Math.round(props.size * dpr);
    if (canvas.width !== px) canvas.width = canvas.height = px;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, px, px);
    const ids = props.frames.filter((id) => f.byId.has(id));
    if (!ids.length) return;
    const item = f.byId.get(ids[idx % ids.length])!;
    const k = Math.min(px / f.width, px / f.height);
    paintFrame(ctx, f, item, (px - f.width * k) / 2, (px - f.height * k) / 2, k);
  }

  function tick(t: number) {
    raf = requestAnimationFrame(tick);
    if (t - last < 1000 / Math.max(1, props.fps)) return;
    last = t;
    idx = (idx + 1) % Math.max(1, props.frames.length);
    draw();
  }

  onMounted(() => {
    draw();
    raf = requestAnimationFrame(tick);
  });
  onUnmounted(() => cancelAnimationFrame(raf));
</script>

<template>
  <canvas
    ref="canvasRef"
    class="anim-preview"
    :style="{ width: `${size}px`, height: `${size}px` }"
  />
</template>

<style scoped>
  .anim-preview {
    border-radius: 8px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
    background:
      repeating-conic-gradient(rgba(128, 128, 128, 0.2) 0% 25%, transparent 0% 50%)
      0 0 / 12px 12px;
    flex-shrink: 0;
  }
</style>
