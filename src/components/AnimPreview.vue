<script setup lang="ts">
  import { onMounted, onUnmounted, ref, watch } from 'vue';
  import { useSpriteStore } from '@/stores/spriteStore';

  const props = defineProps<{ frames: string[]; fps: number }>();

  const SIZE = 56;

  const store = useSpriteStore();
  const canvasRef = ref<HTMLCanvasElement | null>(null);

  let img: HTMLImageElement | null = null;
  let raf = 0;
  let last = 0;
  let idx = 0;

  function cellByKey(key: string) {
    return (
      store.activeCells.find((c) => `${c.col}_${c.row}` === key) ?? null
    );
  }

  function draw() {
    const canvas = canvasRef.value;
    if (!canvas || !img || !props.frames.length) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, SIZE, SIZE);
    const cell = cellByKey(props.frames[idx % props.frames.length]);
    if (!cell) return;
    const offset = store.getCellOffset(cell.col, cell.row);
    const scale = Math.min(SIZE / cell.width, SIZE / cell.height, 1);
    const w = cell.width * scale;
    const h = cell.height * scale;
    ctx.imageSmoothingEnabled = scale >= 1;
    ctx.drawImage(
      img,
      cell.x + offset.x,
      cell.y + offset.y,
      cell.width,
      cell.height,
      (SIZE - w) / 2,
      (SIZE - h) / 2,
      w,
      h
    );
  }

  function tick(t: number) {
    raf = requestAnimationFrame(tick);
    if (t - last < 1000 / Math.max(1, props.fps)) return;
    last = t;
    idx = (idx + 1) % Math.max(1, props.frames.length);
    draw();
  }

  onMounted(() => {
    img = new Image();
    img.onload = () => {
      draw();
      raf = requestAnimationFrame(tick);
    };
    img.src = store.imageSrc;
  });

  onUnmounted(() => cancelAnimationFrame(raf));

  watch(
    () => [props.frames, props.fps] as const,
    () => {
      idx = 0;
      draw();
    }
  );
</script>

<template>
  <canvas
    ref="canvasRef"
    :width="SIZE"
    :height="SIZE"
    class="anim-preview"
  />
</template>

<style scoped>
  .anim-preview {
    width: 56px;
    height: 56px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background:
      repeating-conic-gradient(
        rgba(255, 255, 255, 0.06) 0% 25%,
        transparent 0% 50%
      )
      0 0 / 12px 12px;
    flex-shrink: 0;
  }
</style>
