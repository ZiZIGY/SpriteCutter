import { watch, nextTick, type Ref } from 'vue';
import { useResizeObserver, useRafFn } from '@vueuse/core';

import { useRigStore } from '@/stores/rigStore';
import {
  boneSegment,
  poseTransforms,
  restTransforms,
} from '@/utils/rig/skeleton';
import { getWeight } from '@/utils/rig/weights';
import { drawWarpedMesh } from '@/utils/rig/drawWarped';

/** Maps a 0..1 weight to a blue→red heat colour. */
function heatColor(weight: number, alpha: number): string {
  const hue = (1 - Math.min(1, Math.max(0, weight))) * 240;
  return `hsla(${hue}, 90%, 55%, ${alpha})`;
}

export interface RigRendererHandles {
  /** Decoded pixels of the whole sheet, for mesh generation. */
  getImageData: () => { data: Uint8ClampedArray; width: number } | null;
  /** Bone being dragged out, in sprite-local coords, while creating. */
  pendingBone: Ref<{
    x: number;
    y: number;
    tipX: number;
    tipY: number;
  } | null>;
  brushPosition: Ref<{ x: number; y: number } | null>;
  snapTarget: Ref<{ x: number; y: number } | null>;
  hoverBoneId: Ref<number | null>;
  isGrabbing: Ref<boolean>;
}

export function useRigRenderer(
  viewportRef: Ref<HTMLDivElement | null>,
  canvasRef: Ref<HTMLCanvasElement | null>,
  zoom: Ref<number>,
  panX: Ref<number>,
  panY: Ref<number>,
  imageSrc: Ref<string>,
  handles: RigRendererHandles,
  onImageLoaded: () => void
) {
  const rig = useRigStore();

  let imgEl: HTMLImageElement | null = null;
  // Warped drawing blits the texture once per triangle, so the source is cut
  // down to just the rigged sprite instead of re-sampling the whole sheet.
  // Declared before the watch below, which clears them on load.
  let regionCanvas: HTMLCanvasElement | null = null;
  let regionKey = '';
  // Offscreen copy of the sheet, kept so mesh generation can read pixels
  // without re-decoding the image on every rebuild.
  let pixelCanvas: HTMLCanvasElement | null = null;
  let pixelData: Uint8ClampedArray | null = null;

  watch(
    imageSrc,
    (src) => {
      imgEl = null;
      pixelData = null;
      regionCanvas = null;
      regionKey = '';
      if (!src) return;
      const img = new Image();
      img.onload = () => {
        imgEl = img;
        pixelCanvas = document.createElement('canvas');
        pixelCanvas.width = img.naturalWidth;
        pixelCanvas.height = img.naturalHeight;
        const pctx = pixelCanvas.getContext('2d', { willReadFrequently: true })!;
        pctx.drawImage(img, 0, 0);
        pixelData = pctx.getImageData(
          0,
          0,
          img.naturalWidth,
          img.naturalHeight
        ).data;
        nextTick(onImageLoaded);
      };
      img.src = src;
    },
    { immediate: true }
  );

  handles.getImageData = () =>
    pixelData && imgEl ? { data: pixelData, width: imgEl.naturalWidth } : null;

  function regionTexture(): HTMLCanvasElement | null {
    const r = rig.region;
    if (!imgEl || !r.width || !r.height) return null;
    const key = `${r.x}_${r.y}_${r.width}_${r.height}`;
    if (regionCanvas && regionKey === key) return regionCanvas;
    const cv = regionCanvas ?? document.createElement('canvas');
    cv.width = r.width;
    cv.height = r.height;
    const cctx = cv.getContext('2d')!;
    cctx.clearRect(0, 0, r.width, r.height);
    cctx.drawImage(
      imgEl,
      r.x,
      r.y,
      r.width,
      r.height,
      0,
      0,
      r.width,
      r.height
    );
    regionCanvas = cv;
    regionKey = key;
    return cv;
  }

  function resizeCanvas() {
    const viewport = viewportRef.value;
    const canvas = canvasRef.value;
    if (!viewport || !canvas) return;
    canvas.width = viewport.clientWidth;
    canvas.height = viewport.clientHeight;
  }
  useResizeObserver(viewportRef, resizeCanvas);

  let lastTime = performance.now();

  function render() {
    const canvas = canvasRef.value;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!imgEl?.complete) return;

    const now = performance.now();
    const delta = (now - lastTime) / 1000;
    lastTime = now;

    // Physics advances the pose, so it must run before deformation.
    rig.advancePhysics(delta);
    if (rig.mesh) rig.updateDeformed();

    const region = rig.region;
    const lw = 1 / zoom.value;

    ctx.save();
    ctx.translate(panX.value, panY.value);
    ctx.scale(zoom.value, zoom.value);
    ctx.imageSmoothingEnabled = zoom.value < 1;

    const mesh = rig.mesh;
    // Only the pose stage deforms; editing stages always show the rest shape.
    const posed =
      rig.stage === 'pose' &&
      !!mesh &&
      rig.deformed.length === mesh.vertices.length;
    const positions = posed ? rig.deformed : mesh?.vertices;

    // The sprite follows the mesh by drawing each triangle with the affine
    // transform from its rest to its posed position. Without a mesh, or when
    // the texture is hidden, fall back to the plain region blit.
    const warp = posed && rig.showTexture && !!mesh && !!positions;

    if (warp) {
      const texture = regionTexture();
      // The region canvas is already cropped, so it needs no source offset.
      if (texture) drawWarpedMesh(ctx, texture, mesh!, positions!, 0, 0);
    } else if (region.width && region.height && rig.showTexture) {
      ctx.drawImage(
        imgEl,
        region.x,
        region.y,
        region.width,
        region.height,
        0,
        0,
        region.width,
        region.height
      );
    }

    if (region.width && region.height && !posed) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.lineWidth = lw;
      ctx.strokeRect(0, 0, region.width, region.height);
    }

    if (rig.showMesh && mesh && positions && positions.length) {
      drawMesh(ctx, mesh, positions, lw);
    }

    if (rig.showBones) drawBones(ctx, lw);
    else if (rig.stage === 'pose') drawGrabHint(ctx, lw);

    // Brush ring follows the cursor while painting weights.
    const brush = handles.brushPosition.value;
    if (rig.stage === 'weights' && brush && rig.selectedBoneId !== null) {
      ctx.beginPath();
      ctx.arc(brush.x, brush.y, rig.brushRadius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.lineWidth = lw * 1.5;
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawMesh(
    ctx: CanvasRenderingContext2D,
    mesh: NonNullable<typeof rig.mesh>,
    positions: Float32Array,
    lw: number
  ) {
    const heatBone =
      rig.stage === 'weights' && rig.showWeightHeatmap
        ? rig.selectedBoneId
        : null;

    // Filled triangles tinted by weight, so influence is readable at a glance.
    if (heatBone !== null) {
      for (let t = 0; t < mesh.triangles.length; t += 3) {
        const ia = mesh.triangles[t];
        const ib = mesh.triangles[t + 1];
        const ic = mesh.triangles[t + 2];
        const avg =
          (getWeight(rig.weights, ia, heatBone) +
            getWeight(rig.weights, ib, heatBone) +
            getWeight(rig.weights, ic, heatBone)) /
          3;
        if (avg <= 0.001) continue;
        ctx.beginPath();
        ctx.moveTo(positions[ia * 2], positions[ia * 2 + 1]);
        ctx.lineTo(positions[ib * 2], positions[ib * 2 + 1]);
        ctx.lineTo(positions[ic * 2], positions[ic * 2 + 1]);
        ctx.closePath();
        ctx.fillStyle = heatColor(avg, 0.45 * avg + 0.12);
        ctx.fill();
      }
    }

    // Wireframe.
    ctx.beginPath();
    for (let t = 0; t < mesh.triangles.length; t += 3) {
      const ia = mesh.triangles[t];
      const ib = mesh.triangles[t + 1];
      const ic = mesh.triangles[t + 2];
      ctx.moveTo(positions[ia * 2], positions[ia * 2 + 1]);
      ctx.lineTo(positions[ib * 2], positions[ib * 2 + 1]);
      ctx.lineTo(positions[ic * 2], positions[ic * 2 + 1]);
      ctx.closePath();
    }
    ctx.strokeStyle = 'rgba(96, 196, 255, 0.5)';
    ctx.lineWidth = lw;
    ctx.stroke();

    // Vertices: contour points brighter than interior ones.
    const dotRadius = 2.2 / zoom.value;
    for (let v = 0; v < positions.length / 2; v++) {
      const isContour = v < mesh.contourCount;
      ctx.beginPath();
      ctx.arc(positions[v * 2], positions[v * 2 + 1], dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = isContour
        ? 'rgba(255, 214, 102, 0.95)'
        : 'rgba(150, 220, 255, 0.7)';
      ctx.fill();
    }
  }

  /**
   * With bones hidden, the pose stage still needs to show what is grabbable —
   * otherwise dragging feels like guesswork. Draws just the hovered bone.
   */
  function drawGrabHint(ctx: CanvasRenderingContext2D, lw: number) {
    const id = handles.hoverBoneId.value;
    if (id === null) return;
    const bone = rig.bones.find((b) => b.id === id);
    if (!bone) return;
    const { start, end } = boneSegment(bone, stageTransforms());
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.strokeStyle = handles.isGrabbing.value
      ? 'rgba(255, 138, 101, 0.95)'
      : 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = lw * 3;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  /**
   * Bones must be drawn in the same space as the sprite. Only the pose stage
   * deforms the image, so elsewhere the bones show their rest layout — drawing
   * them posed there made them drift away from an undeformed sprite whenever
   * physics was left running.
   */
  function stageTransforms() {
    return rig.stage === 'pose'
      ? poseTransforms(rig.bones)
      : restTransforms(rig.bones);
  }

  function drawBones(ctx: CanvasRenderingContext2D, lw: number) {
    if (!rig.bones.length) return;
    const transforms = stageTransforms();

    for (const bone of rig.bones) {
      const { start, end } = boneSegment(bone, transforms);
      const isSelected = bone.id === rig.selectedBoneId;
      const isHovered = bone.id === handles.hoverBoneId.value;
      const hasPhysics = !!bone.physics?.enabled;

      const color = isSelected
        ? 'rgba(255, 138, 101, 0.98)'
        : isHovered
          ? 'rgba(255, 224, 130, 0.95)'
          : hasPhysics
            ? 'rgba(129, 199, 132, 0.9)'
            : 'rgba(255, 255, 255, 0.8)';

      // Tapered shaft: a triangle from the joint toward the tip reads as a
      // bone and shows its direction.
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const halfWidth = Math.max(2.5, bone.length * 0.07) / 1;
      const nx = Math.cos(angle + Math.PI / 2) * halfWidth;
      const ny = Math.sin(angle + Math.PI / 2) * halfWidth;

      ctx.beginPath();
      ctx.moveTo(start.x + nx, start.y + ny);
      ctx.lineTo(end.x, end.y);
      ctx.lineTo(start.x - nx, start.y - ny);
      ctx.closePath();
      ctx.fillStyle = color.replace(/[\d.]+\)$/, '0.3)');
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = lw * 1.5;
      ctx.stroke();

      // Joint handle.
      ctx.beginPath();
      ctx.arc(start.x, start.y, (isSelected ? 5 : 4) / zoom.value, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.lineWidth = lw;
      ctx.stroke();

      // Tip handle: the rotation grip.
      ctx.beginPath();
      ctx.arc(end.x, end.y, 3 / zoom.value, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.stroke();
    }

    // Detached children: a dashed link from the parent tip to the child joint
    // makes an unintended gap obvious instead of looking like a stray bone.
    const byId = new Map(rig.bones.map((b) => [b.id, b]));
    for (const bone of rig.bones) {
      if (bone.parentId === null) continue;
      const parent = byId.get(bone.parentId);
      if (!parent) continue;
      const childStart = boneSegment(bone, transforms).start;
      const parentEnd = boneSegment(parent, transforms).end;
      const gap = Math.hypot(
        childStart.x - parentEnd.x,
        childStart.y - parentEnd.y
      );
      if (gap <= 0.5) continue;
      ctx.beginPath();
      ctx.moveTo(parentEnd.x, parentEnd.y);
      ctx.lineTo(childStart.x, childStart.y);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = lw;
      ctx.setLineDash([3 / zoom.value, 3 / zoom.value]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Snap target under the cursor: a ring showing where the joint will land.
    const snap = handles.snapTarget.value;
    if (snap && rig.stage === 'bones') {
      ctx.beginPath();
      ctx.arc(snap.x, snap.y, 7 / zoom.value, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(129, 199, 132, 0.95)';
      ctx.lineWidth = lw * 2;
      ctx.stroke();
    }

    // Ghost of the bone currently being dragged out.
    const pending = handles.pendingBone.value;
    if (pending) {
      ctx.beginPath();
      ctx.moveTo(pending.x, pending.y);
      ctx.lineTo(pending.tipX, pending.tipY);
      ctx.strokeStyle = 'rgba(255, 138, 101, 0.9)';
      ctx.lineWidth = lw * 2;
      ctx.setLineDash([5 / zoom.value, 3 / zoom.value]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  useRafFn(render);
}
