import { computed, ref, type Ref } from 'vue';
import { onKeyStroke } from '@vueuse/core';

import { useRigStore } from '@/stores/rigStore';
import {
  applyMat,
  boneSegment,
  invert,
  poseTransforms,
  restTransforms,
  type Bone,
} from '@/utils/rig/skeleton';

/** Screen-space pick radius for bone handles, in px. */
const HANDLE_PICK_PX = 10;
/** Minimum drag before a click becomes a new bone, in screen px. */
const MIN_BONE_DRAG_PX = 6;
/** Radius within which a new bone's joint snaps onto an existing tip, in px. */
const SNAP_PX = 14;

type DragKind = 'create' | 'joint' | 'tip' | 'paint' | 'grab' | null;

/** How close to a bone shaft a grab must start, in screen px. */
const GRAB_PICK_PX = 22;
/** Screen px of drag velocity that maps to one unit of flick impulse. */
const FLICK_SCALE = 0.006;

export function useRigPointer(
  viewportRef: Ref<HTMLDivElement | null>,
  canvasRef: Ref<HTMLCanvasElement | null>,
  zoom: Ref<number>,
  panX: Ref<number>,
  panY: Ref<number>
) {
  const rig = useRigStore();

  const spaceHeld = ref(false);
  const isPanning = ref(false);
  const pendingBone = ref<{
    x: number;
    y: number;
    tipX: number;
    tipY: number;
  } | null>(null);
  const brushPosition = ref<{ x: number; y: number } | null>(null);
  /** Tip the cursor is hovering near, highlighted as a snap target. */
  const snapTarget = ref<{ x: number; y: number } | null>(null);
  /** Bone the cursor is over in the pose stage, highlighted as grabbable. */
  const hoverBoneId = ref<number | null>(null);

  // Reactive so the cursor and renderer can respond to an active drag.
  const dragState = ref<DragKind>(null);
  let dragBoneId: number | null = null;
  let paintAdditive = true;
  /** Bone whose tip the pending bone snapped to, if any. */
  let snappedParentId: number | null = null;
  /** Active grab: which bone, and where along its shaft the cursor took hold. */
  let grabBoneId: number | null = null;
  let grabOffset = 0;
  /** Recent pointer velocity in world units, for release flicks. */
  let velX = 0;
  let velY = 0;
  let lastX = 0;
  let lastY = 0;
  let downX = 0;
  let downY = 0;

  function screenToWorld(screenX: number, screenY: number) {
    const rect = canvasRef.value!.getBoundingClientRect();
    return {
      x: (screenX - rect.left - panX.value) / zoom.value,
      y: (screenY - rect.top - panY.value) / zoom.value,
    };
  }

  /** Finds a bone handle under the cursor; tips take priority over joints. */
  function pickHandle(
    worldX: number,
    worldY: number
  ): { bone: Bone; part: 'joint' | 'tip' } | null {
    const transforms =
      rig.stage === 'pose' ? poseTransforms(rig.bones) : restTransforms(rig.bones);
    const threshold = HANDLE_PICK_PX / zoom.value;
    let closest: { bone: Bone; part: 'joint' | 'tip'; dist: number } | null =
      null;

    for (const bone of rig.bones) {
      const { start, end } = boneSegment(bone, transforms);
      const tipDist = Math.hypot(end.x - worldX, end.y - worldY);
      const jointDist = Math.hypot(start.x - worldX, start.y - worldY);
      if (tipDist <= threshold && (!closest || tipDist < closest.dist))
        closest = { bone, part: 'tip', dist: tipDist };
      if (jointDist <= threshold && (!closest || jointDist < closest.dist))
        closest = { bone, part: 'joint', dist: jointDist };
    }
    return closest ? { bone: closest.bone, part: closest.part } : null;
  }

  function onPointerDown(e: PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    viewportRef.value?.focus();
    lastX = e.clientX;
    lastY = e.clientY;
    downX = e.clientX;
    downY = e.clientY;

    // Middle mouse or space+drag always pans, in every stage.
    if (e.button === 1 || (e.button === 0 && spaceHeld.value)) {
      isPanning.value = true;
      e.preventDefault();
      return;
    }

    const { x: wx, y: wy } = screenToWorld(e.clientX, e.clientY);

    if (rig.stage === 'weights') {
      if (rig.selectedBoneId === null) return;
      dragState.value = 'paint';
      // Right button erases weight instead of adding it.
      paintAdditive = e.button !== 2;
      rig.paintWeights(wx, wy, rig.selectedBoneId, paintAdditive);
      e.preventDefault();
      return;
    }

    // Right-click in the pose stage pokes the bone under the cursor, which is
    // the quickest way to feel the spring settings.
    if (rig.stage === 'pose' && e.button === 2) {
      const shaft = rig.pickShaft(wx, wy, GRAB_PICK_PX / zoom.value);
      if (shaft) {
        rig.selectedBoneId = shaft.bone.id;
        rig.pokeBone(shaft.bone.id, 0.6);
      }
      e.preventDefault();
      return;
    }

    if (e.button !== 0) return;

    const hit = pickHandle(wx, wy);
    if (hit) {
      rig.selectedBoneId = hit.bone.id;
      dragState.value = hit.part;
      dragBoneId = hit.bone.id;
      e.preventDefault();
      return;
    }

    // In the pose stage, grabbing anywhere on a bone drags it with IK, so the
    // character can be pulled around directly instead of only by tip handles.
    if (rig.stage === 'pose') {
      const shaft = rig.pickShaft(wx, wy, GRAB_PICK_PX / zoom.value);
      if (shaft) {
        rig.selectedBoneId = shaft.bone.id;
        grabBoneId = shaft.bone.id;
        grabOffset = shaft.offset;
        dragState.value = 'grab';
        velX = 0;
        velY = 0;
        e.preventDefault();
        return;
      }
    }

    // Bone creation only in the bones stage; elsewhere a miss just deselects.
    if (rig.stage === 'bones') {
      // Snap the new joint onto a nearby tip so chains connect with no gap,
      // and make that bone the parent regardless of what was selected.
      const snap = rig.findSnapTip(wx, wy, SNAP_PX / zoom.value);
      snappedParentId = snap ? snap.boneId : null;
      const startX = snap ? snap.x : wx;
      const startY = snap ? snap.y : wy;
      pendingBone.value = { x: startX, y: startY, tipX: wx, tipY: wy };
      dragState.value = 'create';
    } else {
      rig.selectedBoneId = null;
    }
  }

  function onPointerMove(e: PointerEvent) {
    const deltaX = e.clientX - lastX;
    const deltaY = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;

    const { x: wx, y: wy } = screenToWorld(e.clientX, e.clientY);
    if (rig.stage === 'weights') brushPosition.value = { x: wx, y: wy };

    // Preview the snap target while hovering, so the connection is predictable.
    if (rig.stage === 'bones' && !dragState.value) {
      const snap = rig.findSnapTip(wx, wy, SNAP_PX / zoom.value);
      snapTarget.value = snap ? { x: snap.x, y: snap.y } : null;
    }

    // Highlight what a grab would take hold of.
    if (rig.stage === 'pose' && !dragState.value) {
      const shaft = rig.pickShaft(wx, wy, GRAB_PICK_PX / zoom.value);
      hoverBoneId.value = shaft ? shaft.bone.id : null;
    }

    if (e.buttons === 4 && !isPanning.value) isPanning.value = true;
    if (isPanning.value) {
      panX.value += deltaX;
      panY.value += deltaY;
      return;
    }

    if (!dragState.value) return;

    if (dragState.value === 'create' && pendingBone.value) {
      pendingBone.value = { ...pendingBone.value, tipX: wx, tipY: wy };
      return;
    }

    if (dragState.value === 'paint' && rig.selectedBoneId !== null) {
      rig.paintWeights(wx, wy, rig.selectedBoneId, paintAdditive);
      return;
    }

    if (dragState.value === 'grab' && grabBoneId !== null) {
      // Exponential moving average smooths jitter so the release flick
      // reflects the gesture rather than the last single event.
      velX = velX * 0.7 + deltaX * 0.3;
      velY = velY * 0.7 + deltaY * 0.3;
      rig.dragBoneTo(grabBoneId, grabOffset, wx, wy);
      return;
    }

    const bone = rig.bones.find((b) => b.id === dragBoneId);
    if (!bone) return;

    if (dragState.value === 'joint') {
      // Move the joint in the parent's frame so the hierarchy stays consistent.
      const parent =
        bone.parentId !== null
          ? rig.bones.find((b) => b.id === bone.parentId)
          : null;
      if (!parent) {
        bone.x += deltaX / zoom.value;
        bone.y += deltaY / zoom.value;
      } else {
        const transforms = restTransforms(rig.bones);
        const parentMat = transforms.get(parent.id);
        if (parentMat) {
          const inv = invert(parentMat);
          // Transform the delta as a direction, not a point.
          const origin = applyMat(inv, 0, 0);
          const moved = applyMat(inv, deltaX / zoom.value, deltaY / zoom.value);
          bone.x += moved.x - origin.x;
          bone.y += moved.y - origin.y;
        }
      }
      return;
    }

    if (dragState.value === 'tip') {
      // Dragging the tip rotates the bone and sets its length. In pose mode it
      // writes poseRotation so the rest shape is preserved.
      const transforms =
        rig.stage === 'pose' ? poseTransforms(rig.bones) : restTransforms(rig.bones);
      const { start } = boneSegment(bone, transforms);
      const worldAngle = Math.atan2(wy - start.y, wx - start.x);
      const mat = transforms.get(bone.id);
      const currentWorld = mat ? Math.atan2(mat[1], mat[0]) : 0;
      const delta = normalizeAngle(worldAngle - currentWorld);

      if (rig.stage === 'pose') {
        bone.poseRotation = normalizeAngle(bone.poseRotation + delta);
      } else {
        bone.rotation = normalizeAngle(bone.rotation + delta);
        bone.length = Math.max(4, Math.hypot(wx - start.x, wy - start.y));
      }
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (dragState.value === 'create' && pendingBone.value) {
      const dragged = Math.hypot(e.clientX - downX, e.clientY - downY);
      const p = pendingBone.value;
      if (dragged >= MIN_BONE_DRAG_PX) {
        // A snapped tip wins as the parent; otherwise the selected bone is the
        // parent, which is how chains get built by successive drags.
        rig.addBone(
          p.x,
          p.y,
          p.tipX,
          p.tipY,
          snappedParentId ?? rig.selectedBoneId
        );
      }
      pendingBone.value = null;
      snappedParentId = null;
    }

    // Releasing a grab throws the sub-chain, so a flick keeps swinging.
    if (dragState.value === 'grab' && grabBoneId !== null) {
      const speed = Math.hypot(velX, velY);
      if (speed > 1) {
        // Sign follows the tangential direction so the swing matches the throw.
        const sign = velX >= 0 ? 1 : -1;
        rig.pokeBone(grabBoneId, sign * Math.min(1.5, speed * FLICK_SCALE));
      }
      grabBoneId = null;
      velX = 0;
      velY = 0;
    }

    dragState.value = null;
    dragBoneId = null;
    isPanning.value = false;
  }

  function onPointerLeave() {
    brushPosition.value = null;
    snapTarget.value = null;
    hoverBoneId.value = null;
  }

  /** Wraps an angle into (-π, π] so repeated drags cannot accumulate turns. */
  function normalizeAngle(angle: number): number {
    let a = angle;
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  onKeyStroke(
    ' ',
    (e) => {
      spaceHeld.value = true;
      e.preventDefault();
    },
    { target: viewportRef }
  );
  onKeyStroke(
    ' ',
    () => {
      spaceHeld.value = false;
      isPanning.value = false;
    },
    { target: viewportRef, eventName: 'keyup' }
  );
  onKeyStroke(
    ['Delete', 'Backspace'],
    () => {
      if (rig.selectedBoneId !== null && rig.stage === 'bones')
        rig.removeBone(rig.selectedBoneId);
    },
    { target: viewportRef }
  );

  /** True while a bone is being dragged, for cursor and render feedback. */
  const isGrabbing = computed(() => dragState.value === 'grab');

  const cursorClass = computed(() => ({
    'cursor-grab':
      (spaceHeld.value && !isPanning.value) ||
      (rig.stage === 'pose' && hoverBoneId.value !== null && !dragState.value),
    'cursor-grabbing': isPanning.value || dragState.value === 'grab',
    'cursor-crosshair':
      !spaceHeld.value &&
      !isPanning.value &&
      !dragState.value &&
      !(rig.stage === 'pose' && hoverBoneId.value !== null),
  }));

  return {
    spaceHeld,
    isPanning,
    pendingBone,
    brushPosition,
    snapTarget,
    hoverBoneId,
    isGrabbing,
    cursorClass,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerLeave,
  };
}
