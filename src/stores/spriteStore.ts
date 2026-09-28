import { computed, markRaw, ref, shallowRef, toRaw } from 'vue';
import { defineStore } from 'pinia';
import { useLocalStorage } from '@vueuse/core';

import { decodeImage, type DecodedImage } from '@/utils/image';
import { hexToRgb, rgbToHex } from '@/utils/color';
import { analyze, type Analysis } from '@/utils/detect/analyze';
import { estimateBackground, type Background } from '@/utils/detect/background';
import { estimateGrid } from '@/utils/detect/gridEstimate';
import {
  findSprites,
  gridSprites,
  iou,
  ownedFor,
  readingOrder,
  snapBox,
  type GridSpec,
  type Rect,
  type SpriteBox,
} from '@/utils/detect/sprites';
import {
  extractSprite,
  layoutFrames,
  type Extracted,
  type FrameOptions,
  type FrameSet,
  type Placement,
  type Shift,
  type Unit,
} from '@/utils/render/frames';
import { alignFrames, type AlignMode } from '@/utils/render/align';
import {
  planSheet,
  type PlanItem,
  type SheetLayout,
  type SheetPlan,
} from '@/utils/render/sheet';

export interface Sprite extends SpriteBox {
  id: number;
  name: string;
  /** Row in reading order, from 0. */
  row: number;
  /** Left out of the export. */
  skip?: boolean;
  /** Empty cells on the output sheet before this sprite. */
  gapBefore?: number;
  /** Starts a new row on the output sheet. */
  breakBefore?: boolean;
}

export interface ExportOptions {
  format: 'png' | 'webp';
  gap: number;
  /** 'anims': one row per animation in its frame order, then the rest. */
  layout: SheetLayout | 'anims';
  columns: number;
}

export type EditorView = 'source' | 'result' | 'animations';

export type LoopMode = 'loop' | 'pingpong' | 'once';

export interface SpriteAnimation {
  id: number;
  name: string;
  /** Sprite ids in playback order. */
  frames: number[];
  fps: number;
  loop: LoopMode;
  /** How the frames are lined up with each other on the sheet. */
  align: AlignMode;
  /** Hand-tuned extra shift per sprite id, in source pixels. */
  nudge: Record<number, Shift>;
}

export type DetectMethod = 'auto' | 'grid';
export type EditorTool = 'select' | 'draw';

export interface OutputOptions extends FrameOptions {
  removeBg: boolean;
  isolate: boolean;
  soften: boolean;
  trim: boolean;
}

export interface FrameItem {
  ext: Extracted;
  place: Placement;
}

export interface AnimationPrefs {
  /** Every source row with two or more sprites becomes an animation. */
  autoRows: boolean;
  /** Alignment for new animations. */
  align: AlignMode;
}

export interface Frames extends FrameSet {
  byId: Map<number, FrameItem>;
}

interface Snapshot {
  analysis: Analysis | null;
  sprites: Sprite[];
}

export interface DetectRun {
  history?: 'push' | 'keep' | 'clear';
  /** Grid method: re-estimate cell size and offsets from the sheet first. */
  estimateGrid?: boolean;
}

const HISTORY_LIMIT = 100;
/** Analyses are megabytes each; history keeps at most this many alive. */
const HISTORY_ANALYSES = 2;
const EXTRACT_CACHE_LIMIT = 600;

const DEFAULT_OUTPUT: OutputOptions = {
  removeBg: true,
  isolate: true,
  soften: true,
  trim: true,
  size: 'auto',
  width: 128,
  height: 128,
  square: true,
  // Generated sheets draw the "same" icon at different sizes; evening them
  // out is the common case. Pixel art and animation frames want 'none'.
  scale: 'fit',
  padding: 2,
  anchor: 'center',
  smooth: true,
};

const waitFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function cloneSprite(s: Sprite): Sprite {
  const raw = toRaw(s);
  return { ...raw, owned: raw.owned ? [...raw.owned] : null };
}

export const useSpriteStore = defineStore('sprite', () => {
  // ── image ──────────────────────────────────────────────────────────────────
  const imageName = ref('');
  const imageSrc = ref('');
  const imageWidth = ref(0);
  const imageHeight = ref(0);
  const source = shallowRef<DecodedImage | null>(null);
  const analysis = shallowRef<Analysis | null>(null);
  const busy = ref(false);
  const error = ref('');

  // ── detection settings ─────────────────────────────────────────────────────
  const detect = useLocalStorage(
    'sprite-cutter-detect',
    { tolerance: 40, minSize: 3, fillHoles: false, splitTouching: true },
    { mergeDefaults: true }
  );
  const method = ref<DetectMethod>('auto');
  /** User-picked background colour; null lets the border decide. */
  const bgOverride = ref<string | null>(null);
  const grid = ref<GridSpec>({
    cellW: 64,
    cellH: 64,
    offX: 0,
    offY: 0,
    gapX: 0,
    gapY: 0,
  });
  const showMask = ref(false);

  const output = useLocalStorage<OutputOptions>(
    'sprite-cutter-output',
    DEFAULT_OUTPUT,
    { mergeDefaults: true }
  );
  const exportOptions = useLocalStorage<ExportOptions>(
    'sprite-cutter-export',
    { format: 'png', gap: 2, layout: 'rows', columns: 8 },
    { mergeDefaults: true }
  );
  const animPrefs = useLocalStorage<AnimationPrefs>(
    'sprite-cutter-animations',
    { autoRows: false, align: 'match' },
    { mergeDefaults: true }
  );
  /** Main area: the marked-up sheet, or the output as it will be exported. */
  const view = ref<EditorView>('source');

  // ── sprites & editing ──────────────────────────────────────────────────────
  const sprites = ref<Sprite[]>([]);
  const selected = ref(new Set<number>());
  const hovered = ref<number | null>(null);
  /** Set by the list to ask the canvas to bring a sprite into view; `seq`
   *  makes a repeat request for the same sprite still fire the watcher. */
  const revealRequest = ref<{ id: number; seq: number } | null>(null);
  const tool = ref<EditorTool>('select');
  const showNames = ref(true);
  const animations = ref<SpriteAnimation[]>([]);
  let idSeq = 1;
  let animSeq = 1;

  const rowCount = computed(() =>
    sprites.value.length ? sprites.value[sprites.value.length - 1].row + 1 : 0
  );

  const backgroundColors = computed<string[]>(() => {
    const bg = analysis.value?.background;
    return bg?.kind === 'color' ? bg.colors.map(rgbToHex) : [];
  });

  // ── history ────────────────────────────────────────────────────────────────
  const past: Snapshot[] = [];
  const future: Snapshot[] = [];
  const historyTick = ref(0);
  const canUndo = computed(() => historyTick.value >= 0 && past.length > 0);
  const canRedo = computed(() => historyTick.value >= 0 && future.length > 0);

  function snapshot(): Snapshot {
    return { analysis: analysis.value, sprites: sprites.value.map(cloneSprite) };
  }

  function pushHistory() {
    past.push(snapshot());
    if (past.length > HISTORY_LIMIT) past.shift();
    // Re-detection swaps the whole analysis; drop the oldest entries once more
    // than HISTORY_ANALYSES distinct ones would stay referenced.
    while (new Set(past.map((s) => s.analysis)).size > HISTORY_ANALYSES) {
      past.shift();
    }
    future.length = 0;
    historyTick.value++;
  }

  function restore(snap: Snapshot) {
    analysis.value = snap.analysis;
    sprites.value = snap.sprites.map(cloneSprite);
    selected.value = new Set();
  }

  function undo() {
    const snap = past.pop();
    if (!snap) return;
    future.push(snapshot());
    restore(snap);
    historyTick.value++;
  }

  function redo() {
    const snap = future.pop();
    if (!snap) return;
    past.push(snapshot());
    restore(snap);
    historyTick.value++;
  }

  function clearHistory() {
    past.length = 0;
    future.length = 0;
    historyTick.value++;
  }

  // ── loading & detection ────────────────────────────────────────────────────
  async function loadImage(file: Blob, name?: string) {
    reset();
    busy.value = true;
    const src = URL.createObjectURL(file);
    try {
      const decoded = await decodeImage(src);
      imageName.value =
        name || (file instanceof File && file.name) || 'sprites.png';
      imageSrc.value = src;
      imageWidth.value = decoded.width;
      imageHeight.value = decoded.height;
      source.value = markRaw(decoded);
      // Let the canvas paint the image under the busy overlay before the
      // synchronous detection pass blocks the main thread.
      await waitFrame();
      await waitFrame();
      runDetection({ history: 'clear' });
    } catch (e) {
      URL.revokeObjectURL(src);
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      busy.value = false;
    }
  }

  function currentBackground(img: DecodedImage): Background {
    if (bgOverride.value) {
      return { kind: 'color', colors: [hexToRgb(bgOverride.value)] };
    }
    return estimateBackground(img.pixels, img.width, img.height);
  }

  /**
   * Re-reads the sheet with the current settings and replaces all boxes.
   * Names carry over to the new box that overlaps the old one best, so
   * nudging the tolerance does not wipe applied names.
   *
   * history: 'push' makes the run undoable; 'keep' is for follow-up runs while
   * a slider is being dragged, so one undo reverts the whole adjustment.
   */
  function runDetection(opts: DetectRun = {}) {
    const img = source.value;
    if (!img) return;
    const an = markRaw(
      analyze(img.pixels, img.width, img.height, {
        background: currentBackground(img),
        tolerance: detect.value.tolerance,
        fillHoles: detect.value.fillHoles,
        // The grid method cuts by cells; splitting blobs would only cost time.
        splitTouching: method.value === 'auto' && detect.value.splitTouching,
      })
    );
    if (method.value === 'grid' && opts.estimateGrid) {
      const est = estimateGrid(an.content, an.width, an.height);
      if (est) grid.value = est;
    }
    let boxes =
      method.value === 'grid'
        ? gridSprites(an, grid.value)
        : findSprites(an, { minSize: detect.value.minSize });

    // Drawn grid lines glue a whole classic sheet into one blob. On a fresh
    // load, fall back to the grid method when that is what happened and a
    // grid actually finds several cells.
    const whole = boxes.length === 1 && boxes[0].w > an.width * 0.6 && boxes[0].h > an.height * 0.6;
    if (opts.history === 'clear' && method.value === 'auto' && whole) {
      const est = estimateGrid(an.content, an.width, an.height);
      const cells = est ? gridSprites(an, est) : [];
      if (est && cells.length > 1) {
        method.value = 'grid';
        grid.value = est;
        boxes = cells;
      }
    }

    const history = opts.history ?? 'push';
    if (history === 'push') pushHistory();
    else if (history === 'clear') clearHistory();
    const prev = sprites.value;
    analysis.value = an;
    // Each new box inherits from the old box it overlaps best: name, export
    // flags, and its place in animations.
    const renamed = new Map<number, number>();
    sprites.value = ordered(
      boxes.map((b) => {
        const s: Sprite = { ...b, id: idSeq++, name: '', row: 0 };
        let best = 0;
        let from: number | null = null;
        for (const p of prev) {
          const v = iou(p, s);
          if (v > best && v >= 0.5) {
            best = v;
            from = p.id;
            s.name = p.name;
            s.skip = p.skip;
            s.gapBefore = p.gapBefore;
            s.breakBefore = p.breakBefore;
          }
        }
        if (from !== null) renamed.set(from, s.id);
        return s;
      })
    );
    for (const a of animations.value) {
      const nudge: Record<number, Shift> = {};
      for (const [old, shift] of Object.entries(a.nudge)) {
        const id = renamed.get(Number(old));
        if (id !== undefined) nudge[id] = shift;
      }
      a.frames = a.frames.flatMap((id) => {
        const next = renamed.get(id);
        return next === undefined ? [] : [next];
      });
      a.nudge = nudge;
    }
    animations.value = animations.value.filter((a) => a.frames.length);
    if (animPrefs.value.autoRows && !animations.value.length) addAnimationsFromRows();
    selected.value = new Set();
  }

  /** Detection triggered from the settings UI; shows the overlay for big sheets. */
  async function redetect(opts: DetectRun = {}) {
    if (!source.value) return;
    const slow = imageWidth.value * imageHeight.value > 1_500_000;
    if (slow) {
      busy.value = true;
      await waitFrame();
      await waitFrame();
    }
    try {
      runDetection(opts);
    } finally {
      busy.value = false;
    }
  }

  function ordered(list: Sprite[]): Sprite[] {
    return readingOrder(list).map(({ item, row }) => {
      item.row = row;
      return item;
    });
  }

  function setBackground(hex: string | null) {
    bgOverride.value = hex;
  }

  // ── editing ────────────────────────────────────────────────────────────────
  function byId(id: number) {
    return sprites.value.find((s) => s.id === id);
  }

  function removeSelected() {
    if (!selected.value.size) return;
    pushHistory();
    const gone = selected.value;
    sprites.value = ordered(sprites.value.filter((s) => !gone.has(s.id)));
    selected.value = new Set();
  }

  function mergeSelected() {
    const group = sprites.value.filter((s) => selected.value.has(s.id));
    if (group.length < 2) return;
    pushHistory();
    const x = Math.min(...group.map((s) => s.x));
    const y = Math.min(...group.map((s) => s.y));
    const x2 = Math.max(...group.map((s) => s.x + s.w));
    const y2 = Math.max(...group.map((s) => s.y + s.h));
    const owned = group.some((s) => !s.owned)
      ? null
      : [...new Set(group.flatMap((s) => s.owned!))].sort((a, b) => a - b);
    const merged: Sprite = {
      id: idSeq++,
      x,
      y,
      w: x2 - x,
      h: y2 - y,
      owned,
      name: group.find((s) => s.name)?.name ?? '',
      row: 0,
    };
    sprites.value = ordered([
      ...sprites.value.filter((s) => !selected.value.has(s.id)),
      merged,
    ]);
    selected.value = new Set([merged.id]);
  }

  function clampRect(r: Rect): Rect {
    const x = Math.max(0, Math.min(imageWidth.value - 1, Math.round(r.x)));
    const y = Math.max(0, Math.min(imageHeight.value - 1, Math.round(r.y)));
    return {
      x,
      y,
      w: Math.max(1, Math.min(imageWidth.value - x, Math.round(r.w))),
      h: Math.max(1, Math.min(imageHeight.value - y, Math.round(r.h))),
    };
  }

  /** A hand-drawn box, snapped to the blobs it mostly covers. */
  function addBox(r: Rect) {
    const an = analysis.value;
    if (!an) return;
    pushHistory();
    const s: Sprite = {
      ...snapBox(an, clampRect(r)),
      id: idSeq++,
      name: '',
      row: 0,
    };
    sprites.value = ordered([...sprites.value, s]);
    selected.value = new Set([s.id]);
  }

  /** Call once before a drag starts mutating boxes with `setRect`. */
  function beginEdit() {
    pushHistory();
  }

  function setRect(id: number, r: Rect) {
    const s = byId(id);
    if (!s) return;
    const c = clampRect(r);
    s.x = c.x;
    s.y = c.y;
    s.w = c.w;
    s.h = c.h;
  }

  /** After a move/resize: re-claim blobs under the new rect, re-sort rows. */
  function finishEdit(ids: number[]) {
    const an = analysis.value;
    if (!an) return;
    for (const id of ids) {
      const s = byId(id);
      if (s) s.owned = ownedFor(an, s);
    }
    sprites.value = ordered([...sprites.value]);
  }

  function setName(id: number, name: string) {
    const s = byId(id);
    if (s) s.name = name;
  }

  function applyNames(names: Map<number, string>) {
    pushHistory();
    for (const s of sprites.value) {
      const n = names.get(s.id);
      if (n !== undefined) s.name = n;
    }
  }

  function clearNames() {
    pushHistory();
    for (const s of sprites.value) s.name = '';
  }

  // ── output layout ──────────────────────────────────────────────────────────
  function setSkip(ids: number[], value: boolean) {
    pushHistory();
    for (const id of ids) {
      const s = byId(id);
      if (s) s.skip = value;
    }
  }

  function toggleSkip(id: number) {
    const s = byId(id);
    if (s) setSkip([id], !s.skip);
  }

  function unskipAll() {
    setSkip(
      sprites.value.filter((s) => s.skip).map((s) => s.id),
      false
    );
  }

  /** Adds (or with a negative delta removes) empty cells before a sprite. */
  function shiftGap(id: number, delta: number) {
    const s = byId(id);
    if (!s) return;
    pushHistory();
    s.gapBefore = Math.max(0, (s.gapBefore ?? 0) + delta);
  }

  function toggleBreak(id: number) {
    const s = byId(id);
    if (!s) return;
    pushHistory();
    s.breakBefore = !s.breakBefore;
  }

  function resetLayout() {
    pushHistory();
    for (const s of sprites.value) {
      s.gapBefore = 0;
      s.breakBefore = false;
    }
  }

  const exported = computed(() => sprites.value.filter((s) => !s.skip));
  /** Sheet plan for any subset of sprites, in the current layout. */
  function planFor(list: Sprite[]): SheetPlan {
    const o = exportOptions.value;
    if (o.layout !== 'anims') return planSheet(list, o.layout, o.columns);
    // Nothing to group by yet (a fresh sheet): fall back to the source rows.
    if (!animations.value.length) return planSheet(list, 'rows', o.columns);
    const allowed = new Set(list.map((s) => s.id));
    const byIdMap = new Map(list.map((s) => [s.id, s]));
    const used = new Set<number>();
    const items: PlanItem[] = [];
    const take = (s: Sprite, first: boolean) => {
      used.add(s.id);
      items.push({ ...s, breakBefore: first || s.breakBefore });
    };
    for (const a of animations.value) {
      let first = true;
      for (const id of a.frames) {
        if (!allowed.has(id) || used.has(id)) continue;
        take(byIdMap.get(id)!, first);
        first = false;
      }
    }
    // Sprites outside animations follow, keeping their source rows.
    let prevRow: number | null = null;
    for (const s of list) {
      if (used.has(s.id)) continue;
      take(s, s.row !== prevRow);
      prevRow = s.row;
    }
    return planSheet(items, 'grid', Infinity);
  }

  const sheetPlan = computed(() => planFor(exported.value));

  // ── selection ──────────────────────────────────────────────────────────────
  function selectOnly(id: number) {
    selected.value = new Set([id]);
  }

  function toggleSelect(id: number) {
    const next = new Set(selected.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selected.value = next;
  }

  function selectAll() {
    selected.value = new Set(sprites.value.map((s) => s.id));
  }

  function clearSelection() {
    if (selected.value.size) selected.value = new Set();
  }

  function selectRect(r: Rect, additive: boolean) {
    const next = additive ? new Set(selected.value) : new Set<number>();
    for (const s of sprites.value) {
      if (
        s.x < r.x + r.w &&
        s.x + s.w > r.x &&
        s.y < r.y + r.h &&
        s.y + s.h > r.y
      ) {
        next.add(s.id);
      }
    }
    selected.value = next;
  }

  function reveal(id: number) {
    revealRequest.value = { id, seq: (revealRequest.value?.seq ?? 0) + 1 };
  }

  // ── animations ─────────────────────────────────────────────────────────────
  function addAnimation(frames: number[], name?: string) {
    if (!frames.length) return null;
    const anim: SpriteAnimation = {
      id: animSeq++,
      name: name ?? `anim_${animations.value.length + 1}`,
      frames,
      fps: 10,
      loop: 'loop',
      align: animPrefs.value.align,
      nudge: {},
    };
    animations.value.push(anim);
    return anim;
  }

  function addAnimationFromSelection() {
    return addAnimation(
      sprites.value.filter((s) => selected.value.has(s.id)).map((s) => s.id)
    );
  }

  /** One animation per row: generated sheets usually put a cycle on a row.
   *  Sprites already in an animation are left alone. */
  function addAnimationsFromRows() {
    const used = new Set(animations.value.flatMap((a) => a.frames));
    const made: SpriteAnimation[] = [];
    for (let r = 0; r < rowCount.value; r++) {
      const row = sprites.value.filter((s) => s.row === r && !used.has(s.id));
      if (row.length < 2) continue;
      const base = commonPrefix(row.map((s) => s.name)).replace(/[\s_-]+$/, '');
      const anim = addAnimation(
        row.map((s) => s.id),
        base || `row_${r + 1}`
      );
      if (anim) made.push(anim);
    }
    return made;
  }

  function animById(id: number) {
    return animations.value.find((a) => a.id === id);
  }

  function removeAnimation(id: number) {
    animations.value = animations.value.filter((a) => a.id !== id);
  }

  function selectAnimationFrames(id: number) {
    const anim = animById(id);
    if (anim) selected.value = new Set(anim.frames);
  }

  function moveFrame(id: number, from: number, to: number) {
    const anim = animById(id);
    if (!anim || from === to) return;
    const [f] = anim.frames.splice(from, 1);
    anim.frames.splice(to, 0, f);
  }

  function removeFrame(id: number, index: number) {
    const anim = animById(id);
    if (anim) anim.frames.splice(index, 1);
  }

  /** Appends the selected sprites in reading order, skipping ones already in. */
  function addSelectedFrames(id: number) {
    const anim = animById(id);
    if (!anim) return;
    for (const s of sprites.value) {
      if (selected.value.has(s.id) && !anim.frames.includes(s.id)) {
        anim.frames.push(s.id);
      }
    }
  }

  function nudgeFrame(id: number, spriteId: number, dx: number, dy: number) {
    const anim = animById(id);
    if (!anim) return;
    const cur = anim.nudge[spriteId] ?? { x: 0, y: 0 };
    anim.nudge[spriteId] = { x: cur.x + dx, y: cur.y + dy };
  }

  function resetNudge(id: number, spriteId?: number) {
    const anim = animById(id);
    if (!anim) return;
    if (spriteId === undefined) anim.nudge = {};
    else delete anim.nudge[spriteId];
  }

  // ── output frames ──────────────────────────────────────────────────────────
  // Extraction is the expensive part (a pixel loop per sprite), and most
  // changes touch one box or only the frame layout, so extracted sprites are
  // cached by everything they depend on.
  const extractCache = new Map<string, Extracted>();

  // Registration is not free either; alignments are cached by the frames'
  // extraction keys and the mode.
  const alignCache = new Map<string, Shift[]>();

  /**
   * Animations become layout units (one scale, frames lined up); every other
   * sprite is a unit of its own. A sprite in two animations follows the first.
   */
  function buildUnits(list: Extracted[], keyOf: string[]): Unit[] {
    const index = new Map(sprites.value.map((s, i) => [s.id, i]));
    const taken = new Set<number>();
    const units: Unit[] = [];
    for (const a of animations.value) {
      if (a.align === 'none') continue;
      const members: number[] = [];
      for (const id of a.frames) {
        const i = index.get(id);
        if (i === undefined || taken.has(i)) continue;
        taken.add(i);
        members.push(i);
      }
      if (!members.length) continue;
      const key = `${a.align}|${members.map((i) => keyOf[i]).join(';')}`;
      let shifts = alignCache.get(key);
      if (!shifts) {
        if (alignCache.size > 200) alignCache.clear();
        shifts = alignFrames(
          members.map((i) => list[i]),
          members.map((i) => sprites.value[i].row),
          a.align
        );
        alignCache.set(key, shifts);
      }
      units.push({
        members,
        shifts: shifts.map((sh, j) => {
          const n = a.nudge[sprites.value[members[j]].id];
          return n ? { x: sh.x + n.x, y: sh.y + n.y } : sh;
        }),
      });
    }
    sprites.value.forEach((_, i) => {
      if (!taken.has(i)) units.push({ members: [i], shifts: [{ x: 0, y: 0 }] });
    });
    return units;
  }

  const frames = computed<Frames | null>(() => {
    const an = analysis.value;
    if (!an) return null;
    const o = output.value;
    const clean = {
      removeBg: o.removeBg,
      isolate: o.isolate,
      soften: o.soften,
      trim: o.trim,
    };
    const flags = `${+o.removeBg}${+o.isolate}${+o.soften}${+o.trim}`;
    const keyOf: string[] = [];
    const list = sprites.value.map((s, i) => {
      const key = `${an.version}|${s.x},${s.y},${s.w},${s.h}|${s.owned ? s.owned.join(',') : '*'}|${flags}`;
      keyOf[i] = key;
      let ext = extractCache.get(key);
      if (!ext) {
        if (extractCache.size > EXTRACT_CACHE_LIMIT) extractCache.clear();
        ext = extractSprite(an, s, clean);
        extractCache.set(key, ext);
      }
      return ext;
    });
    const kept = sprites.value.map((s) => !s.skip);
    const layout = layoutFrames(
      list,
      o,
      buildUnits(list, keyOf),
      kept.includes(true) ? kept : undefined
    );
    const byIdMap = new Map<number, FrameItem>();
    sprites.value.forEach((s, i) =>
      byIdMap.set(s.id, { ext: list[i], place: layout.places[i] })
    );
    const bg = an.background;
    return markRaw({
      width: layout.width,
      height: layout.height,
      smooth: o.smooth,
      background:
        !o.removeBg && bg.kind === 'color' ? rgbToHex(bg.colors[0]) : null,
      byId: byIdMap,
    });
  });

  // ── reset ──────────────────────────────────────────────────────────────────
  function reset() {
    if (imageSrc.value) URL.revokeObjectURL(imageSrc.value);
    imageName.value = '';
    imageSrc.value = '';
    imageWidth.value = 0;
    imageHeight.value = 0;
    source.value = null;
    analysis.value = null;
    error.value = '';
    method.value = 'auto';
    bgOverride.value = null;
    sprites.value = [];
    selected.value = new Set();
    hovered.value = null;
    animations.value = [];
    view.value = 'source';
    extractCache.clear();
    alignCache.clear();
    clearHistory();
  }

  return {
    imageName,
    imageSrc,
    imageWidth,
    imageHeight,
    analysis,
    busy,
    error,
    detect,
    method,
    bgOverride,
    grid,
    showMask,
    output,
    exportOptions,
    animPrefs,
    view,
    sprites,
    exported,
    sheetPlan,
    planFor,
    selected,
    hovered,
    revealRequest,
    tool,
    showNames,
    animations,
    rowCount,
    backgroundColors,
    canUndo,
    canRedo,
    frames,
    loadImage,
    redetect,
    setBackground,
    undo,
    redo,
    removeSelected,
    mergeSelected,
    addBox,
    beginEdit,
    setRect,
    finishEdit,
    setName,
    applyNames,
    clearNames,
    setSkip,
    toggleSkip,
    unskipAll,
    shiftGap,
    toggleBreak,
    resetLayout,
    selectOnly,
    toggleSelect,
    selectAll,
    clearSelection,
    selectRect,
    reveal,
    addAnimationFromSelection,
    addAnimationsFromRows,
    removeAnimation,
    selectAnimationFrames,
    moveFrame,
    removeFrame,
    addSelectedFrames,
    nudgeFrame,
    resetNudge,
    reset,
  };
});

function commonPrefix(names: string[]): string {
  if (!names.length || names.some((n) => !n)) return '';
  let p = names[0];
  for (const n of names) {
    while (!n.startsWith(p)) p = p.slice(0, -1);
  }
  return p;
}
