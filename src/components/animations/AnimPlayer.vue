<script setup lang="ts">
  import { computed, onMounted, onUnmounted, useTemplateRef, watch } from 'vue';
  import { useElementSize, useLocalStorage } from '@vueuse/core';
  import { useSpriteStore, type SpriteAnimation } from '@/stores/spriteStore';
  import { paintFrame } from '@/utils/render/frames';

  /**
   * Plays an animation exactly as it will be exported, and is where frames
   * get lined up by hand: drag the current frame (the previous one shows
   * through as an onion skin) or nudge it with Shift+arrows.
   */
  const props = defineProps<{ anim: SpriteAnimation }>();
  const frame = defineModel<number>('frame', { required: true });
  const playing = defineModel<boolean>('playing', { required: true });

  const store = useSpriteStore();
  const prefs = useLocalStorage(
    'sprite-cutter-player',
    { onion: true, cross: true, bg: 'checker' as 'checker' | 'dark' | 'light', zoom: 0 },
    { mergeDefaults: true }
  );

  const boxRef = useTemplateRef<HTMLDivElement>('boxRef');
  const canvasRef = useTemplateRef<HTMLCanvasElement>('canvasRef');
  const { width: boxW, height: boxH } = useElementSize(boxRef);

  const ids = computed(() => {
    const f = store.frames;
    return f ? props.anim.frames.filter((id) => f.byId.has(id)) : [];
  });

  /** Screen pixels per output pixel; 0 in prefs means "fit". */
  const scale = computed(() => {
    const f = store.frames;
    if (!f) return 1;
    if (prefs.value.zoom > 0) return prefs.value.zoom;
    const fit = Math.min((boxW.value - 32) / f.width, (boxH.value - 32) / f.height);
    return Math.max(0.1, Math.min(8, fit));
  });

  function zoomBy(k: number) {
    prefs.value.zoom = Math.max(0.1, Math.min(16, scale.value * k));
  }

  let checker: CanvasPattern | null = null;
  function checkerPattern(ctx: CanvasRenderingContext2D) {
    if (checker) return checker;
    const tile = document.createElement('canvas');
    tile.width = tile.height = 16;
    const t = tile.getContext('2d')!;
    t.fillStyle = '#9aa0a6';
    t.fillRect(0, 0, 16, 16);
    t.fillStyle = '#c4c8cc';
    t.fillRect(0, 0, 8, 8);
    t.fillRect(8, 8, 8, 8);
    checker = ctx.createPattern(tile, 'repeat');
    return checker;
  }

  function draw() {
    const canvas = canvasRef.value;
    const f = store.frames;
    if (!canvas || !f) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.round(boxW.value * dpr);
    const ch = Math.round(boxH.value * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const k = scale.value;
    const fw = f.width * k;
    const fh = f.height * k;
    const ox = Math.round((boxW.value - fw) / 2);
    const oy = Math.round((boxH.value - fh) / 2);

    ctx.fillStyle =
      prefs.value.bg === 'checker'
        ? checkerPattern(ctx)!
        : prefs.value.bg === 'dark'
          ? '#15151f'
          : '#f4f5f7';
    ctx.fillRect(ox, oy, fw, fh);

    const list = ids.value;
    if (list.length) {
      const i = Math.min(frame.value, list.length - 1);
      if (prefs.value.onion && list.length > 1) {
        const prev = f.byId.get(list[(i - 1 + list.length) % list.length])!;
        ctx.globalAlpha = 0.3;
        paintFrame(ctx, f, prev, ox, oy, k);
        ctx.globalAlpha = 1;
      }
      paintFrame(ctx, f, f.byId.get(list[i])!, ox, oy, k);
    }

    ctx.strokeStyle = 'rgba(128, 128, 160, 0.6)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + 0.5, oy + 0.5, fw - 1, fh - 1);
    if (prefs.value.cross) {
      ctx.strokeStyle = 'rgba(255, 179, 0, 0.55)';
      ctx.beginPath();
      ctx.moveTo(ox + fw / 2, oy);
      ctx.lineTo(ox + fw / 2, oy + fh);
      ctx.moveTo(ox, oy + fh / 2);
      ctx.lineTo(ox + fw, oy + fh / 2);
      if (store.output.anchor === 'bottom') {
        const base = oy + fh - store.output.padding * k;
        ctx.moveTo(ox, base);
        ctx.lineTo(ox + fw, base);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // ── playback ───────────────────────────────────────────────────────────────
  let raf = 0;
  let last = 0;
  let dir = 1;

  function step(delta: number) {
    const n = ids.value.length;
    if (!n) return;
    frame.value = (frame.value + delta + n) % n;
  }

  function tick(t: number) {
    raf = requestAnimationFrame(tick);
    if (!playing.value) {
      last = t;
      return;
    }
    const n = ids.value.length;
    if (n < 2 || t - last < 1000 / Math.max(1, props.anim.fps)) return;
    last = t;
    const loop = props.anim.loop;
    if (loop === 'pingpong') {
      if (frame.value + dir >= n || frame.value + dir < 0) dir = -dir;
      frame.value += dir;
    } else if (loop === 'once' && frame.value >= n - 1) {
      playing.value = false;
    } else {
      frame.value = (frame.value + 1) % n;
    }
  }

  onMounted(() => {
    raf = requestAnimationFrame(tick);
    draw();
  });
  onUnmounted(() => cancelAnimationFrame(raf));

  watch(
    () => [store.frames, frame.value, scale.value, boxW.value, boxH.value, prefs.value, ids.value],
    draw,
    { flush: 'post', deep: true }
  );
  watch(
    () => props.anim.id,
    () => {
      frame.value = 0;
      dir = 1;
    }
  );

  // ── hand alignment ─────────────────────────────────────────────────────────
  const currentId = computed(() => ids.value[Math.min(frame.value, ids.value.length - 1)]);

  /** Screen pixels per source pixel for the current frame. */
  function screenPerSource() {
    const item = currentId.value !== undefined && store.frames?.byId.get(currentId.value);
    return item ? scale.value * item.place.k : 1;
  }

  let drag: { x: number; y: number; accX: number; accY: number } | null = null;

  function onPointerDown(e: PointerEvent) {
    if (currentId.value === undefined || e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    playing.value = false;
    drag = { x: e.clientX, y: e.clientY, accX: 0, accY: 0 };
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag || currentId.value === undefined) return;
    const k = screenPerSource();
    drag.accX += (e.clientX - drag.x) / k;
    drag.accY += (e.clientY - drag.y) / k;
    drag.x = e.clientX;
    drag.y = e.clientY;
    const dx = Math.trunc(drag.accX);
    const dy = Math.trunc(drag.accY);
    if (dx || dy) {
      store.nudgeFrame(props.anim.id, currentId.value, dx, dy);
      drag.accX -= dx;
      drag.accY -= dy;
    }
  }

  function onPointerUp() {
    drag = null;
  }

  function onKey(e: KeyboardEvent) {
    // Keep the editor's window-wide shortcuts out of it.
    e.stopPropagation();
    const id = currentId.value;
    if (e.code === 'Space') {
      playing.value = !playing.value;
    } else if (e.shiftKey && id !== undefined && e.code.startsWith('Arrow')) {
      const d = e.ctrlKey ? 5 : 1;
      const dx = e.code === 'ArrowLeft' ? -d : e.code === 'ArrowRight' ? d : 0;
      const dy = e.code === 'ArrowUp' ? -d : e.code === 'ArrowDown' ? d : 0;
      store.nudgeFrame(props.anim.id, id, dx, dy);
    } else if (e.code === 'ArrowLeft') {
      playing.value = false;
      step(-1);
    } else if (e.code === 'ArrowRight') {
      playing.value = false;
      step(1);
    } else {
      return;
    }
    e.preventDefault();
  }

  const nudge = computed(() =>
    currentId.value !== undefined ? props.anim.nudge[currentId.value] : undefined
  );

  function stepPaused(delta: number) {
    playing.value = false;
    step(delta);
  }

  function goTo(i: number) {
    playing.value = false;
    frame.value = Math.max(0, i);
  }

  defineExpose({ step });
</script>

<template>
  <div class="player">
    <div
      ref="boxRef"
      class="stage"
      tabindex="0"
      @keydown="onKey"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <canvas
        ref="canvasRef"
        class="stage-canvas"
      />
      <div
        v-if="!ids.length"
        class="stage-empty"
      >
        В анимации нет кадров
      </div>
    </div>

    <div class="controls">
      <VBtn
        icon="mdi-skip-previous"
        size="small"
        variant="text"
        @click="goTo(0)"
      />
      <VBtn
        icon="mdi-step-backward"
        size="small"
        variant="text"
        @click="stepPaused(-1)"
      />
      <VBtn
        :icon="playing ? 'mdi-pause' : 'mdi-play'"
        size="small"
        color="primary"
        variant="flat"
        @click="playing = !playing"
      />
      <VBtn
        icon="mdi-step-forward"
        size="small"
        variant="text"
        @click="stepPaused(1)"
      />
      <VBtn
        icon="mdi-skip-next"
        size="small"
        variant="text"
        @click="goTo(ids.length - 1)"
      />
      <span class="counter">{{ ids.length ? frame + 1 : 0 }} / {{ ids.length }}</span>

      <VSpacer />

      <span
        v-if="nudge"
        class="nudge"
        title="Ручной сдвиг этого кадра, пиксели исходника"
      >
        сдвиг {{ Math.round(nudge.x) }}, {{ Math.round(nudge.y) }}
      </span>
      <VBtn
        size="small"
        :variant="prefs.onion ? 'tonal' : 'text'"
        prependIcon="mdi-layers-outline"
        class="ctl"
        @click="prefs.onion = !prefs.onion"
        >Кальки</VBtn
      >
      <VBtn
        size="small"
        :variant="prefs.cross ? 'tonal' : 'text'"
        prependIcon="mdi-crosshairs"
        class="ctl"
        @click="prefs.cross = !prefs.cross"
        >Прицел</VBtn
      >
      <VBtnToggle
        v-model="prefs.bg"
        mandatory
        density="compact"
        variant="outlined"
        divided
      >
        <VBtn
          value="checker"
          icon="mdi-checkerboard"
          size="small"
        />
        <VBtn
          value="dark"
          icon="mdi-square"
          size="small"
        />
        <VBtn
          value="light"
          icon="mdi-square-outline"
          size="small"
        />
      </VBtnToggle>
      <div class="zoom">
        <VBtn
          icon="mdi-minus"
          size="x-small"
          variant="text"
          @click="zoomBy(0.8)"
        />
        <span class="zoom-val">{{ Math.round(scale * 100) }}%</span>
        <VBtn
          icon="mdi-plus"
          size="x-small"
          variant="text"
          @click="zoomBy(1.25)"
        />
        <VBtn
          size="x-small"
          :variant="prefs.zoom === 0 ? 'tonal' : 'text'"
          @click="prefs.zoom = 0"
          >Вписать</VBtn
        >
      </div>
    </div>
  </div>
</template>

<style scoped>
  .player {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1;
    gap: 6px;
  }
  .stage {
    position: relative;
    flex: 1;
    min-height: 220px;
    border-radius: 12px;
    background: rgba(var(--v-theme-on-surface), 0.04);
    outline: none;
    cursor: grab;
    touch-action: none;
  }
  .stage:focus-visible {
    box-shadow: 0 0 0 2px rgb(var(--v-theme-primary));
  }
  .stage:active {
    cursor: grabbing;
  }
  .stage-canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .stage-empty {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(var(--v-theme-on-surface), 0.5);
  }
  .controls {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
  }
  .counter {
    margin-left: 6px;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    min-width: 56px;
  }
  .nudge {
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: rgb(var(--v-theme-primary));
    margin-right: 6px;
  }
  .ctl {
    text-transform: none;
    letter-spacing: normal;
  }
  .zoom {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-left: 6px;
  }
  .zoom-val {
    min-width: 44px;
    text-align: center;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
</style>
