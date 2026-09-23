import { ref, type Ref } from 'vue';

export function useCanvasCamera(
  viewportRef: Ref<HTMLDivElement | null>,
  canvasRef: Ref<HTMLCanvasElement | null>,
  getImageWidth: () => number,
  getImageHeight: () => number
) {
  const zoom = ref(1);
  const panX = ref(0);
  const panY = ref(0);

  function fitToScreen() {
    const viewport = viewportRef.value;
    if (!viewport || !getImageWidth() || !getImageHeight()) return;
    const fitZoom =
      Math.min(
        viewport.clientWidth / getImageWidth(),
        viewport.clientHeight / getImageHeight()
      ) * 0.92;
    zoom.value = fitZoom;
    panX.value = (viewport.clientWidth - getImageWidth() * fitZoom) / 2;
    panY.value = (viewport.clientHeight - getImageHeight() * fitZoom) / 2;
  }

  function adjustZoom(factor: number) {
    const viewport = viewportRef.value!;
    const cx = viewport.clientWidth / 2;
    const cy = viewport.clientHeight / 2;
    const newZoom = Math.max(0.04, Math.min(32, zoom.value * factor));
    panX.value = cx - (cx - panX.value) * (newZoom / zoom.value);
    panY.value = cy - (cy - panY.value) * (newZoom / zoom.value);
    zoom.value = newZoom;
  }

  /** Pans (never zooms) so the rect is on screen; no-op when already visible. */
  function reveal(r: { x: number; y: number; w: number; h: number }) {
    const viewport = viewportRef.value;
    if (!viewport) return;
    const sx = panX.value + r.x * zoom.value;
    const sy = panY.value + r.y * zoom.value;
    const sw = r.w * zoom.value;
    const sh = r.h * zoom.value;
    const margin = 24;
    if (
      sx >= margin &&
      sy >= margin &&
      sx + sw <= viewport.clientWidth - margin &&
      sy + sh <= viewport.clientHeight - margin
    ) {
      return;
    }
    panX.value = viewport.clientWidth / 2 - (r.x + r.w / 2) * zoom.value;
    panY.value = viewport.clientHeight / 2 - (r.y + r.h / 2) * zoom.value;
  }

  function onWheel(e: WheelEvent) {
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const rect = canvasRef.value!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const newZoom = Math.max(0.04, Math.min(32, zoom.value * factor));
    panX.value = mx - (mx - panX.value) * (newZoom / zoom.value);
    panY.value = my - (my - panY.value) * (newZoom / zoom.value);
    zoom.value = newZoom;
  }

  return { zoom, panX, panY, fitToScreen, adjustZoom, reveal, onWheel };
}
