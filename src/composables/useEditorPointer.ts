import { computed, ref, type Ref } from 'vue';
import { useEventListener } from '@vueuse/core';
import { useSpriteStore, type Sprite } from '@/stores/spriteStore';
import { useUiStore } from '@/stores/uiStore';
import type { Rect } from '@/utils/detect/sprites';

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export type Gesture =
  | { kind: 'pan' }
  | { kind: 'marquee'; x0: number; y0: number; x1: number; y1: number; additive: boolean }
  | { kind: 'draw'; x0: number; y0: number; x1: number; y1: number }
  | {
      kind: 'move';
      hit: number;
      starts: Map<number, Rect>;
      wx: number;
      wy: number;
      started: boolean;
    }
  | { kind: 'resize'; id: number; handle: Handle; start: Rect; wx: number; wy: number };

/** Handle hit radius and drag threshold, in screen pixels. */
const HANDLE_PX = 7;
const DRAG_PX = 3;

const HANDLE_CURSOR: Record<Handle, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
};

export function handlePoints(r: Rect): [Handle, number, number][] {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  return [
    ['nw', r.x, r.y],
    ['n', cx, r.y],
    ['ne', r.x + r.w, r.y],
    ['e', r.x + r.w, cy],
    ['se', r.x + r.w, r.y + r.h],
    ['s', cx, r.y + r.h],
    ['sw', r.x, r.y + r.h],
    ['w', r.x, cy],
  ];
}

export function normRect(g: { x0: number; y0: number; x1: number; y1: number }): Rect {
  return {
    x: Math.min(g.x0, g.x1),
    y: Math.min(g.y0, g.y1),
    w: Math.abs(g.x1 - g.x0),
    h: Math.abs(g.y1 - g.y0),
  };
}

/** Focus is in a field or inside a popup menu (sliders there take keys too). */
function isTyping(e: Event) {
  const t = e.target as HTMLElement | null;
  return !!t?.closest?.(
    'input, textarea, select, [contenteditable="true"], .v-overlay'
  );
}

export function useEditorPointer(
  viewportRef: Ref<HTMLDivElement | null>,
  canvasRef: Ref<HTMLCanvasElement | null>,
  zoom: Ref<number>,
  panX: Ref<number>,
  panY: Ref<number>,
  fitToScreen: () => void
) {
  const store = useSpriteStore();
  const ui = useUiStore();
  const spaceHeld = ref(false);
  const gesture = ref<Gesture | null>(null);
  const hoverHandle = ref<Handle | null>(null);
  const hoverSprite = ref(false);
  let lastX = 0;
  let lastY = 0;
  let downX = 0;
  let downY = 0;

  function toWorld(clientX: number, clientY: number) {
    const rect = canvasRef.value!.getBoundingClientRect();
    return {
      x: (clientX - rect.left - panX.value) / zoom.value,
      y: (clientY - rect.top - panY.value) / zoom.value,
    };
  }

  /** Smallest box under the point, so a sprite nested in a bigger box stays clickable. */
  function spriteAt(x: number, y: number): Sprite | null {
    let best: Sprite | null = null;
    for (const s of store.sprites) {
      if (x < s.x || y < s.y || x >= s.x + s.w || y >= s.y + s.h) continue;
      if (!best || s.w * s.h < best.w * best.h) best = s;
    }
    return best;
  }

  function soleSelected(): Sprite | null {
    if (store.selected.size !== 1) return null;
    const [id] = store.selected;
    return store.sprites.find((s) => s.id === id) ?? null;
  }

  function handleAt(x: number, y: number): Handle | null {
    const s = soleSelected();
    if (!s || store.tool !== 'select') return null;
    const r = HANDLE_PX / zoom.value;
    for (const [h, hx, hy] of handlePoints(s)) {
      if (Math.abs(x - hx) <= r && Math.abs(y - hy) <= r) return h;
    }
    return null;
  }

  function onPointerDown(e: PointerEvent) {
    viewportRef.value?.focus();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    lastX = downX = e.clientX;
    lastY = downY = e.clientY;

    if (e.button === 1 || (e.button === 0 && spaceHeld.value)) {
      gesture.value = { kind: 'pan' };
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;

    const { x, y } = toWorld(e.clientX, e.clientY);
    if (store.tool === 'draw') {
      gesture.value = { kind: 'draw', x0: x, y0: y, x1: x, y1: y };
      return;
    }

    const handle = handleAt(x, y);
    const sole = soleSelected();
    if (handle && sole) {
      store.beginEdit();
      gesture.value = {
        kind: 'resize',
        id: sole.id,
        handle,
        start: { x: sole.x, y: sole.y, w: sole.w, h: sole.h },
        wx: x,
        wy: y,
      };
      return;
    }

    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    const hit = spriteAt(x, y);
    if (hit) {
      if (additive) {
        store.toggleSelect(hit.id);
        return;
      }
      if (!store.selected.has(hit.id)) store.selectOnly(hit.id);
      const starts = new Map<number, Rect>();
      for (const s of store.sprites) {
        if (store.selected.has(s.id)) starts.set(s.id, { x: s.x, y: s.y, w: s.w, h: s.h });
      }
      gesture.value = { kind: 'move', hit: hit.id, starts, wx: x, wy: y, started: false };
      return;
    }

    if (!additive) store.clearSelection();
    gesture.value = { kind: 'marquee', x0: x, y0: y, x1: x, y1: y, additive };
  }

  function onPointerMove(e: PointerEvent) {
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    const { x, y } = toWorld(e.clientX, e.clientY);
    const g = gesture.value;

    if (!g) {
      const hit = spriteAt(x, y);
      store.hovered = hit?.id ?? null;
      hoverSprite.value = !!hit;
      hoverHandle.value = handleAt(x, y);
      return;
    }

    switch (g.kind) {
      case 'pan':
        panX.value += dx;
        panY.value += dy;
        break;
      case 'marquee':
      case 'draw':
        g.x1 = x;
        g.y1 = y;
        break;
      case 'move': {
        if (!g.started) {
          if (Math.hypot(e.clientX - downX, e.clientY - downY) < DRAG_PX) return;
          g.started = true;
          store.beginEdit();
        }
        const ddx = Math.round(x - g.wx);
        const ddy = Math.round(y - g.wy);
        for (const [id, r] of g.starts) {
          store.setRect(id, { ...r, x: r.x + ddx, y: r.y + ddy });
        }
        break;
      }
      case 'resize': {
        const r = { ...g.start };
        const ddx = x - g.wx;
        const ddy = y - g.wy;
        if (g.handle.includes('w')) {
          r.x += ddx;
          r.w -= ddx;
        }
        if (g.handle.includes('e')) r.w += ddx;
        if (g.handle.includes('n')) {
          r.y += ddy;
          r.h -= ddy;
        }
        if (g.handle.includes('s')) r.h += ddy;
        // Dragging an edge past the opposite one flips instead of collapsing.
        if (r.w < 0) {
          r.x += r.w;
          r.w = -r.w;
        }
        if (r.h < 0) {
          r.y += r.h;
          r.h = -r.h;
        }
        store.setRect(g.id, r);
        break;
      }
    }
  }

  function onPointerUp() {
    const g = gesture.value;
    gesture.value = null;
    if (!g) return;
    switch (g.kind) {
      case 'marquee': {
        const r = normRect(g);
        if (r.w * zoom.value >= DRAG_PX || r.h * zoom.value >= DRAG_PX) {
          store.selectRect(r, g.additive);
        }
        break;
      }
      case 'draw': {
        const r = normRect(g);
        if (r.w >= 2 && r.h >= 2) store.addBox(r);
        break;
      }
      case 'move':
        if (g.started) store.finishEdit([...g.starts.keys()]);
        else if (store.selected.size > 1) store.selectOnly(g.hit);
        break;
      case 'resize':
        store.finishEdit([g.id]);
        break;
    }
  }

  function onPointerLeave() {
    if (!gesture.value) store.hovered = null;
  }

  // Shortcuts live on the window so they work after clicking the sprite list,
  // but never while typing or while a dialog owns the keyboard.
  useEventListener(window, 'keydown', (e: KeyboardEvent) => {
    if (isTyping(e) || ui.dialog || !store.imageSrc) return;
    const mod = e.ctrlKey || e.metaKey;
    if (e.code === 'Space') {
      spaceHeld.value = true;
      e.preventDefault();
      return;
    }
    if (mod && e.code === 'KeyZ') {
      if (e.shiftKey) store.redo();
      else store.undo();
      e.preventDefault();
    } else if (mod && e.code === 'KeyY') {
      store.redo();
      e.preventDefault();
    } else if (mod && e.code === 'KeyA') {
      store.selectAll();
      e.preventDefault();
    } else if (mod) {
      return;
    } else if (e.code === 'Delete' || e.code === 'Backspace') {
      store.removeSelected();
    } else if (e.code === 'KeyM') {
      store.mergeSelected();
    } else if (e.code === 'KeyV') {
      store.tool = 'select';
    } else if (e.code === 'KeyB' || e.code === 'KeyR') {
      store.tool = 'draw';
    } else if (e.code === 'KeyN') {
      store.showNames = !store.showNames;
    } else if (e.code === 'Digit0' || e.code === 'Numpad0') {
      fitToScreen();
    } else if (e.code === 'Escape') {
      if (gesture.value) gesture.value = null;
      else store.clearSelection();
    }
  });
  useEventListener(window, 'keyup', (e: KeyboardEvent) => {
    if (e.code === 'Space') spaceHeld.value = false;
  });

  const cursor = computed(() => {
    const g = gesture.value;
    if (g?.kind === 'pan') return 'grabbing';
    if (spaceHeld.value) return 'grab';
    if (g?.kind === 'resize') return HANDLE_CURSOR[g.handle];
    if (g?.kind === 'move') return 'move';
    if (store.tool === 'draw' || g) return 'crosshair';
    if (hoverHandle.value) return HANDLE_CURSOR[hoverHandle.value];
    return hoverSprite.value ? 'pointer' : 'default';
  });

  return {
    gesture,
    cursor,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerLeave,
  };
}
