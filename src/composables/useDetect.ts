import { ref, watch, type Ref } from 'vue';
import { useSpriteStore } from '@/stores/spriteStore';
import { autoDetect } from './useAutoDetect';
import { sampleBgHex } from '@/utils/image';

type PendingGrid = {
  cellWidth: number;
  cellHeight: number;
  offsetX: number;
  offsetY: number;
  gapX: number;
  gapY: number;
};

const waitFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

export function useDetect(pending: Ref<PendingGrid>) {
  const store = useSpriteStore();

  const bgColor = ref('#000000');
  const bgTolerance = ref(30);
  const bgPickerOpen = ref(false);
  const detecting = ref(false);
  const detectFailed = ref(false);

  let bgSamplePromise: Promise<void> | null = null;

  // Auto-detect on image load. imageSrc is set before the image dimensions
  // (they arrive in img.onload), so wait until src AND both sizes are ready.
  watch(
    () => [store.imageSrc, store.imageWidth, store.imageHeight] as const,
    ([src, w, h]) => {
      if (!src || !w || !h) {
        bgSamplePromise = null;
        return;
      }
      bgSamplePromise = sampleBgHex(src, w, h)
        .then((hex) => {
          bgColor.value = hex;
        })
        .catch(() => {
          bgColor.value = '#000000';
        });
      detect(true);
    },
    { immediate: true }
  );

  async function detect(silent = false) {
    if (!store.imageSrc) return;
    detecting.value = true;
    detectFailed.value = false;
    try {
      if (bgSamplePromise) await bgSamplePromise;

      const result = await autoDetect(
        store.imageSrc,
        store.imageWidth,
        store.imageHeight,
        bgColor.value,
        bgTolerance.value
      );
      if (!result) {
        if (!silent) detectFailed.value = true;
        return;
      }

      pending.value.cellWidth = result.cellWidth;
      pending.value.cellHeight = result.cellHeight;
      pending.value.offsetX = result.offsetX;
      pending.value.offsetY = result.offsetY;
      pending.value.gapX = result.gapX;
      pending.value.gapY = result.gapY;

      store.isApplying = true;
      await waitFrame();
      store.cellWidth = result.cellWidth;
      store.cellHeight = result.cellHeight;
      store.offsetX = result.offsetX;
      store.offsetY = result.offsetY;
      store.gapX = result.gapX;
      store.gapY = result.gapY;
      store.selectedCells.clear();
      await waitFrame();
      store.isApplying = false;

      store.resetCellOffsets();
      for (const [key, offset] of Object.entries(result.cellOffsets)) {
        const [col, row] = key.split('_').map(Number);
        store.setCellOffset(col, row, offset);
      }
    } finally {
      detecting.value = false;
    }
  }

  return {
    bgColor,
    bgTolerance,
    bgPickerOpen,
    detecting,
    detectFailed,
    detect,
  };
}
