import { computed, ref } from 'vue';
import JSZip from 'jszip';

import { useSpriteStore, type Sprite } from '@/stores/spriteStore';
import { canvasToBlob, downloadBlob } from '@/utils/download';
import { paintFrame } from '@/utils/render/frames';
import {
  planSheet,
  sheetGeometry,
  type SheetGeometry,
  type SheetPlan,
} from '@/utils/render/sheet';

interface FrameTag {
  name: string;
  from: number;
  to: number;
  direction: string;
}

interface Sheet {
  plan: SheetPlan;
  geo: SheetGeometry;
  /** Sheet cells holding a sprite, in export order. */
  placed: { sprite: Sprite; x: number; y: number }[];
}

function sanitize(name: string): string {
  return name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ');
}

// "walk_1", "walk_2" → "walk"
function animBaseName(frameName: string): string {
  return frameName.replace(/[ _-]*\d+$/, '') || frameName;
}

export function useExport() {
  const store = useSpriteStore();
  const busy = ref<'bundle' | 'files' | 'sheet' | 'atlas' | null>(null);
  const onlySelected = ref(false);

  /** Sprites that go out: skipped ones never do. */
  const list = computed(() =>
    onlySelected.value && store.selected.size
      ? store.exported.filter((s) => store.selected.has(s.id))
      : store.exported
  );

  const baseName = computed(
    () => sanitize(store.imageName.replace(/\.[^.]+$/, '')) || 'sprites'
  );

  /** Sprite names as file names: sanitized, defaulted, unique ignoring case. */
  function fileNames(sprites: Sprite[]): Map<number, string> {
    const used = new Set<string>();
    const out = new Map<number, string>();
    for (const s of sprites) {
      const index = store.sprites.indexOf(s);
      const base =
        sanitize(s.name) || `sprite_${String(index + 1).padStart(2, '0')}`;
      let name = base;
      let k = 2;
      while (used.has(name.toLowerCase())) name = `${base}_${k++}`;
      used.add(name.toLowerCase());
      out.set(s.id, name);
    }
    return out;
  }

  function frameCanvas(s: Sprite): HTMLCanvasElement {
    const f = store.frames!;
    const canvas = document.createElement('canvas');
    canvas.width = f.width;
    canvas.height = f.height;
    const item = f.byId.get(s.id);
    if (item) paintFrame(canvas.getContext('2d')!, f, item);
    return canvas;
  }

  function buildSheet(sprites: Sprite[]): Sheet {
    const f = store.frames!;
    const o = store.exportOptions;
    const plan = planSheet(sprites, o.layout, o.columns);
    const geo = sheetGeometry(plan, f.width, f.height, o.gap);
    const byId = new Map(sprites.map((s) => [s.id, s]));
    const placed = plan.cells
      .filter((c) => c.id !== null)
      .map((c) => ({ sprite: byId.get(c.id!)!, ...geo.at(c) }));
    return { plan, geo, placed };
  }

  function sheetCanvas(sheet: Sheet) {
    const f = store.frames!;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, sheet.geo.width);
    canvas.height = Math.max(1, sheet.geo.height);
    const ctx = canvas.getContext('2d')!;
    for (const p of sheet.placed) {
      const item = f.byId.get(p.sprite.id);
      if (item) paintFrame(ctx, f, item, p.x, p.y);
    }
    return canvas;
  }

  /** TexturePacker "JSON Hash" — read by Phaser, PixiJS, Unity importers. */
  function buildAtlas(sheet: Sheet, names: Map<number, string>) {
    const f = store.frames!;
    const anchorBottom = store.output.anchor === 'bottom';
    const order = sheet.placed.map((p) => p.sprite);
    const indexById = new Map(order.map((s, i) => [s.id, i]));
    const ordered = order.map((s) => names.get(s.id)!);

    // Animations defined in the app win; otherwise consecutive frames that
    // share a base name ("walk_1", "walk_2") become one.
    const durations = new Map<string, number>();
    const animations: Record<string, string[]> = {};
    const frameTags: FrameTag[] = [];
    if (store.animations.length) {
      for (const anim of store.animations) {
        const ids = anim.frames.filter((id) => indexById.has(id));
        if (!ids.length) continue;
        const frameNames = ids.map((id) => names.get(id)!);
        animations[anim.name] = frameNames;
        const idx = ids.map((id) => indexById.get(id)!);
        frameTags.push({
          name: anim.name,
          from: Math.min(...idx),
          to: Math.max(...idx),
          direction: 'forward',
        });
        const ms = Math.round(1000 / Math.max(1, anim.fps));
        for (const n of frameNames) durations.set(n, ms);
      }
    } else {
      let start = 0;
      for (let i = 1; i <= ordered.length; i++) {
        if (i < ordered.length && animBaseName(ordered[i]) === animBaseName(ordered[start])) continue;
        if (i - start >= 2) {
          const name = animBaseName(ordered[start]);
          animations[name] = (animations[name] ?? []).concat(ordered.slice(start, i));
          frameTags.push({ name, from: start, to: i - 1, direction: 'forward' });
        }
        start = i;
      }
    }

    const frames: Record<string, object> = {};
    for (const p of sheet.placed) {
      const name = names.get(p.sprite.id)!;
      const item = f.byId.get(p.sprite.id);
      const place = item?.place;
      frames[name] = {
        frame: { x: p.x, y: p.y, w: f.width, h: f.height },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: f.width, h: f.height },
        sourceSize: { w: f.width, h: f.height },
        pivot: {
          x: 0.5,
          y: anchorBottom && place ? (place.dy + place.dh) / f.height : 0.5,
        },
        duration: durations.get(name) ?? 100,
        // Where the sprite was cut from in the original image.
        source: item
          ? { x: item.ext.x, y: item.ext.y, w: item.ext.w, h: item.ext.h }
          : null,
        row: p.sprite.row,
      };
    }

    return {
      frames,
      animations,
      meta: {
        app: 'SpriteCutter',
        image: `${baseName.value}.${store.exportOptions.format}`,
        format: 'RGBA8888',
        size: { w: sheet.geo.width, h: sheet.geo.height },
        scale: 1,
        frameSize: { w: f.width, h: f.height },
        sourceImage: {
          name: store.imageName,
          w: store.imageWidth,
          h: store.imageHeight,
        },
        frameTags,
      },
    };
  }

  async function run(kind: NonNullable<typeof busy.value>, job: () => Promise<void>) {
    if (!list.value.length || !store.frames || busy.value) return;
    busy.value = kind;
    try {
      await job();
    } finally {
      busy.value = null;
    }
  }

  async function addFrames(zip: JSZip, folder: string) {
    const fmt = store.exportOptions.format;
    const names = fileNames(list.value);
    for (const s of list.value) {
      zip.file(`${folder}${names.get(s.id)}.${fmt}`, await canvasToBlob(frameCanvas(s), fmt));
    }
  }

  /** Sprites, sheet and atlas in one archive. */
  const exportBundle = () =>
    run('bundle', async () => {
      const zip = new JSZip();
      const fmt = store.exportOptions.format;
      await addFrames(zip, 'sprites/');
      const sheet = buildSheet(list.value);
      zip.file(`${baseName.value}.${fmt}`, await canvasToBlob(sheetCanvas(sheet), fmt));
      zip.file(
        `${baseName.value}.json`,
        JSON.stringify(buildAtlas(sheet, fileNames(list.value)), null, 2)
      );
      downloadBlob(await zip.generateAsync({ type: 'blob' }), `${baseName.value}.zip`);
    });

  const exportFiles = () =>
    run('files', async () => {
      const zip = new JSZip();
      await addFrames(zip, '');
      downloadBlob(
        await zip.generateAsync({ type: 'blob' }),
        `${baseName.value}_sprites.zip`
      );
    });

  const exportSheet = () =>
    run('sheet', async () => {
      const fmt = store.exportOptions.format;
      const canvas = sheetCanvas(buildSheet(list.value));
      downloadBlob(await canvasToBlob(canvas, fmt), `${baseName.value}.${fmt}`);
    });

  const exportAtlas = () =>
    run('atlas', async () => {
      const atlas = buildAtlas(buildSheet(list.value), fileNames(list.value));
      downloadBlob(
        new Blob([JSON.stringify(atlas, null, 2)], { type: 'application/json' }),
        `${baseName.value}.json`
      );
    });

  const sheetSize = computed(() => {
    const f = store.frames;
    if (!list.value.length || !f) return null;
    const o = store.exportOptions;
    return sheetGeometry(planSheet(list.value, o.layout, o.columns), f.width, f.height, o.gap);
  });

  return {
    busy,
    onlySelected,
    list,
    sheetSize,
    exportBundle,
    exportFiles,
    exportSheet,
    exportAtlas,
  };
}
