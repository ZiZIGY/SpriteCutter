import { computed, ref, shallowRef } from 'vue';

import { defineStore } from 'pinia';

import {
  autoWeights,
  deform,
  emptyWeights,
  getWeight,
  setWeight,
  defaultAutoWeightOptions,
  type AutoWeightOptions,
  type OccluderMask,
  type Weights,
} from '@/utils/rig/weights';
import {
  boneSegment,
  defaultPhysics,
  restTransforms,
  skinningMatrices,
  type Bone,
} from '@/utils/rig/skeleton';
import {
  buildMesh,
  defaultMeshOptions,
  type Mesh,
  type MeshOptions,
} from '@/utils/rig/triangulate';
import { alphaMask } from '@/utils/rig/contour';
import {
  buildPresetBones,
  skeletonPresets,
  type SkeletonPreset,
} from '@/utils/rig/presets';
import {
  applyImpulse,
  applyImpulseAt,
  createPhysicsState,
  resetPhysicsState,
  stepPhysics,
} from '@/utils/rig/physics';
import {
  buildChain,
  defaultIkOptions,
  pickBoneByShaft,
  solveIk,
} from '@/utils/rig/ik';

/** Which rigging stage the editor is in; drives canvas interaction. */
export type RigStage = 'bones' | 'mesh' | 'weights' | 'pose';

/** Region of the sheet being rigged, in image pixels. */
export interface RigRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const useRigStore = defineStore('rig', () => {
  const stage = ref<RigStage>('bones');

  // ── source sprite ──────────────────────────────────────────────────────────
  /** Cell key ("col_row") of the sprite being rigged, or null for the sheet. */
  const sourceCellKey = ref<string | null>(null);
  const region = ref<RigRegion>({ x: 0, y: 0, width: 0, height: 0 });
  const spriteName = ref('sprite');

  // ── bones ──────────────────────────────────────────────────────────────────
  const bones = ref<Bone[]>([]);
  const selectedBoneId = ref<number | null>(null);
  let boneIdSeq = 1;

  const selectedBone = computed(
    () => bones.value.find((b) => b.id === selectedBoneId.value) ?? null
  );

  /** Bones in parent-first order paired with their depth, for tree rendering. */
  const boneTree = computed(() => {
    const childrenOf = new Map<number | null, Bone[]>();
    for (const bone of bones.value) {
      const list = childrenOf.get(bone.parentId) ?? [];
      list.push(bone);
      childrenOf.set(bone.parentId, list);
    }
    const rows: { bone: Bone; depth: number }[] = [];
    const walk = (parentId: number | null, depth: number) => {
      for (const bone of childrenOf.get(parentId) ?? []) {
        rows.push({ bone, depth });
        walk(bone.id, depth + 1);
      }
    };
    walk(null, 0);
    return rows;
  });

  /**
   * World-space joint/tip positions of every bone, for snapping and picking.
   * Uses rest transforms since bone editing always happens in the rest pose.
   */
  function boneAnchors(): {
    boneId: number;
    part: 'joint' | 'tip';
    x: number;
    y: number;
  }[] {
    const transforms = restTransforms(bones.value);
    const anchors: {
      boneId: number;
      part: 'joint' | 'tip';
      x: number;
      y: number;
    }[] = [];
    for (const bone of bones.value) {
      const { start, end } = boneSegment(bone, transforms);
      anchors.push({ boneId: bone.id, part: 'joint', x: start.x, y: start.y });
      anchors.push({ boneId: bone.id, part: 'tip', x: end.x, y: end.y });
    }
    return anchors;
  }

  /**
   * Nearest bone tip within `radius` of a point — the snap target that makes a
   * new bone continue an existing chain with no gap.
   */
  function findSnapTip(
    x: number,
    y: number,
    radius: number
  ): { boneId: number; x: number; y: number } | null {
    let best: { boneId: number; x: number; y: number; dist: number } | null =
      null;
    for (const anchor of boneAnchors()) {
      if (anchor.part !== 'tip') continue;
      const dist = Math.hypot(anchor.x - x, anchor.y - y);
      if (dist <= radius && (!best || dist < best.dist))
        best = { boneId: anchor.boneId, x: anchor.x, y: anchor.y, dist };
    }
    return best ? { boneId: best.boneId, x: best.x, y: best.y } : null;
  }

  function addBone(
    x: number,
    y: number,
    tipX: number,
    tipY: number,
    parentId: number | null = null
  ): Bone {
    const parent = parentId !== null
      ? bones.value.find((b) => b.id === parentId) ?? null
      : null;

    // Bone transforms are relative to the parent, so convert the world-space
    // click into the parent's frame.
    let localX = x;
    let localY = y;
    let parentWorldRotation = 0;
    if (parent) {
      const transforms = restTransforms(bones.value);
      const { start } = boneSegment(parent, transforms);
      const m = transforms.get(parent.id);
      parentWorldRotation = m ? Math.atan2(m[1], m[0]) : 0;
      const dx = x - start.x;
      const dy = y - start.y;
      const cos = Math.cos(-parentWorldRotation);
      const sin = Math.sin(-parentWorldRotation);
      localX = dx * cos - dy * sin;
      localY = dx * sin + dy * cos;
    }

    const length = Math.hypot(tipX - x, tipY - y);
    const worldRotation = Math.atan2(tipY - y, tipX - x);

    const bone: Bone = {
      id: boneIdSeq++,
      name: `bone_${bones.value.length + 1}`,
      parentId,
      x: localX,
      y: localY,
      rotation: worldRotation - parentWorldRotation,
      length,
      poseRotation: 0,
      poseX: 0,
      poseY: 0,
      poseScale: 1,
      physics: null,
    };
    bones.value.push(bone);
    selectedBoneId.value = bone.id;
    return bone;
  }

  /**
   * Replaces the skeleton with a preset scaled to the sprite. Bones land in a
   * sensible default pose that the user then drags into place, which is far
   * quicker than drawing twenty bones by hand.
   */
  function applyPreset(preset: SkeletonPreset) {
    const r = region.value;
    if (!r.width || !r.height) return;
    const next = buildPresetBones(preset, r.width, r.height, boneIdSeq);
    boneIdSeq += next.length;
    bones.value = next;
    selectedBoneId.value = next[0]?.id ?? null;
    resetPhysicsState(physicsState);
    // Weights refer to the bones that just went away.
    if (mesh.value) computeAutoWeights();
  }

  /** Adds a bone continuing from `parentId`'s tip, so the chain has no gap. */
  function extendBone(parentId: number, length?: number): Bone | null {
    const parent = bones.value.find((b) => b.id === parentId);
    if (!parent) return null;
    const transforms = restTransforms(bones.value);
    const { end } = boneSegment(parent, transforms);
    const mat = transforms.get(parent.id);
    const angle = mat ? Math.atan2(mat[1], mat[0]) : 0;
    const len = length ?? parent.length;
    return addBone(
      end.x,
      end.y,
      end.x + Math.cos(angle) * len,
      end.y + Math.sin(angle) * len,
      parentId
    );
  }

  /** Removes a bone; its children are re-parented to its parent. */
  function removeBone(id: number) {
    const bone = bones.value.find((b) => b.id === id);
    if (!bone) return;
    for (const child of bones.value) {
      if (child.parentId === id) child.parentId = bone.parentId;
    }
    bones.value = bones.value.filter((b) => b.id !== id);
    if (selectedBoneId.value === id) selectedBoneId.value = null;
    dropWeightsForBone(id);
  }

  function renameBone(id: number, name: string) {
    const bone = bones.value.find((b) => b.id === id);
    const trimmed = name.trim();
    if (bone && trimmed) bone.name = trimmed;
  }

  function setBoneParent(id: number, parentId: number | null) {
    const bone = bones.value.find((b) => b.id === id);
    if (!bone || id === parentId) return;
    // Refuse a re-parent that would create a cycle.
    let cursor = parentId;
    while (cursor !== null) {
      if (cursor === id) return;
      cursor = bones.value.find((b) => b.id === cursor)?.parentId ?? null;
    }
    bone.parentId = parentId;
  }

  function clearBones() {
    bones.value = [];
    selectedBoneId.value = null;
    weights.value = emptyWeights(mesh.value ? mesh.value.vertices.length / 2 : 0);
  }

  // ── physics ────────────────────────────────────────────────────────────────
  const physicsState = createPhysicsState();
  const physicsRunning = ref(false);
  let physicsAccumulator = 0;

  function toggleBonePhysics(id: number, enabled: boolean) {
    const bone = bones.value.find((b) => b.id === id);
    if (!bone) return;
    bone.physics = enabled ? { ...defaultPhysics } : null;
    if (!enabled) {
      bone.poseRotation = 0;
      physicsState.velocity.delete(id);
    }
  }

  function advancePhysics(deltaSeconds: number) {
    // Physics only simulates in the pose stage. Elsewhere the sprite is drawn
    // undeformed, so letting the sim keep mutating poseRotation would make the
    // bones drift out of sync with the image the user is editing.
    if (!physicsRunning.value || stage.value !== 'pose') return;
    physicsAccumulator = stepPhysics(
      bones.value,
      physicsState,
      deltaSeconds,
      physicsAccumulator
    );
  }

  /** How many bones up the hierarchy a drag is allowed to rotate. */
  const ikChainDepth = ref(3);
  /** Grab strength for pokes/flicks, scaling the impulse the mouse imparts. */
  const flickStrength = ref(1);

  /**
   * Drags the point `offset` along `boneId` toward a world position, rotating
   * that bone and up to `ikChainDepth - 1` ancestors. This is what makes the
   * character feel physically grabbable.
   */
  function dragBoneTo(
    boneId: number,
    offset: number,
    worldX: number,
    worldY: number
  ) {
    const chain = buildChain(bones.value, boneId, ikChainDepth.value);
    if (!chain.length) return;
    solveIk(bones.value, chain, worldX, worldY, offset, defaultIkOptions);
  }

  /** Nearest bone shaft to a point, for grab-anywhere dragging. */
  function pickShaft(worldX: number, worldY: number, maxDistance: number) {
    return pickBoneByShaft(bones.value, worldX, worldY, maxDistance);
  }

  /** Impulse on one bone and its descendants — a poke or a release-flick. */
  function pokeBone(boneId: number, strength: number) {
    applyImpulseAt(
      bones.value,
      physicsState,
      boneId,
      strength * flickStrength.value
    );
  }

  function pokePhysics(strength = 0.3) {
    applyImpulse(bones.value, physicsState, strength);
  }

  function resetPose() {
    for (const bone of bones.value) {
      bone.poseRotation = 0;
      bone.poseX = 0;
      bone.poseY = 0;
      bone.poseScale = 1;
    }
    resetPhysicsState(physicsState);
    physicsAccumulator = 0;
  }

  // ── mesh ───────────────────────────────────────────────────────────────────
  // shallowRef: these hold typed arrays that are replaced wholesale, never
  // mutated field-by-field, so deep reactivity would only cost us traversals.
  const mesh = shallowRef<Mesh | null>(null);
  /** Silhouette of the current sprite, captured when the mesh is built. */
  let occluder: OccluderMask | null = null;
  const meshOptions = ref<MeshOptions>({ ...defaultMeshOptions });
  const isGeneratingMesh = ref(false);

  /**
   * Regenerates the mesh from the sprite's alpha channel. Needs the decoded
   * pixels, which the caller supplies since only the canvas layer has them.
   */
  function generateMesh(
    data: Uint8ClampedArray,
    imageWidth: number
  ): Mesh | null {
    const r = region.value;
    if (!r.width || !r.height) return null;
    isGeneratingMesh.value = true;
    try {
      const maskData = alphaMask(data, imageWidth, r, meshOptions.value.alphaThreshold);
      // Retained so auto-weighting can tell solid sprite from holes.
      occluder = { mask: maskData, width: r.width, height: r.height };
      const built = buildMesh(maskData, r.width, r.height, meshOptions.value);
      mesh.value = built;
      // Existing weights no longer match the new vertex count.
      weights.value = emptyWeights(built.vertices.length / 2);
      deformed.value = new Float32Array(built.vertices.length);
      return built;
    } finally {
      isGeneratingMesh.value = false;
    }
  }

  /**
   * Bumped to request a rebuild. The canvas owns the decoded pixels, so it
   * watches this and calls `generateMesh`, keeping the sidebar decoupled from
   * the canvas component across the router-view boundary.
   */
  const meshRequestId = ref(0);
  function requestMesh() {
    meshRequestId.value++;
  }

  function clearMesh() {
    mesh.value = null;
    occluder = null;
    weights.value = emptyWeights(0);
    deformed.value = new Float32Array();
  }

  const vertexCount = computed(() =>
    mesh.value ? mesh.value.vertices.length / 2 : 0
  );
  const triangleCount = computed(() =>
    mesh.value ? mesh.value.triangles.length / 3 : 0
  );

  // ── weights ────────────────────────────────────────────────────────────────
  const weights = shallowRef<Weights>(emptyWeights(0));
  const autoWeightOptions = ref<AutoWeightOptions>({
    ...defaultAutoWeightOptions,
  });
  /** Weight-painting brush, in sprite pixels / influence per stroke. */
  /** Whether auto-weights refuse to cross empty space. */
  const respectSilhouette = ref(true);
  const brushRadius = ref(28);
  const brushStrength = ref(0.5);
  /** Highlights one bone's influence as a heat map over the mesh. */
  const showWeightHeatmap = ref(true);

  function computeAutoWeights() {
    if (!mesh.value || !bones.value.length) return;
    weights.value = autoWeights(
      mesh.value.vertices,
      bones.value,
      autoWeightOptions.value,
      // Passing the silhouette stops a bone in a hole (inside a curled
      // tentacle, between the legs) from grabbing vertices across the gap.
      respectSilhouette.value && occluder ? occluder : undefined
    );
  }

  function dropWeightsForBone(boneId: number) {
    const w = weights.value;
    if (!w.vertexCount) return;
    for (let v = 0; v < w.vertexCount; v++) {
      if (getWeight(w, v, boneId) > 0) setWeight(w, v, boneId, 0);
    }
    // shallowRef holds typed arrays mutated in place; re-assign to notify.
    weights.value = { ...w };
  }

  /**
   * Paints influence for `boneId` over vertices within `radius` of the point,
   * falling off toward the brush edge. `additive` false erases instead.
   */
  function paintWeights(
    worldX: number,
    worldY: number,
    boneId: number,
    additive: boolean
  ) {
    const m = mesh.value;
    const w = weights.value;
    if (!m || !w.vertexCount) return;
    const radius = brushRadius.value;
    let touched = false;

    for (let v = 0; v < w.vertexCount; v++) {
      const dx = m.vertices[v * 2] - worldX;
      const dy = m.vertices[v * 2 + 1] - worldY;
      const dist = Math.hypot(dx, dy);
      if (dist > radius) continue;
      const falloff = 1 - dist / radius;
      const delta = brushStrength.value * falloff * (additive ? 1 : -1);
      const current = getWeight(w, v, boneId);
      setWeight(w, v, boneId, current + delta);
      touched = true;
    }
    if (touched) weights.value = { ...w };
  }

  function normalizeAllWeights() {
    const w = weights.value;
    for (let v = 0; v < w.vertexCount; v++) {
      const base = v * w.maxInfluences;
      let total = 0;
      for (let i = 0; i < w.maxInfluences; i++) {
        if (w.boneIds[base + i] !== -1) total += w.values[base + i];
      }
      if (total <= 0) continue;
      for (let i = 0; i < w.maxInfluences; i++) {
        if (w.boneIds[base + i] !== -1) w.values[base + i] /= total;
      }
    }
    weights.value = { ...w };
  }

  /**
   * Bones that hold no influence anywhere on the mesh. Usually a bone drawn
   * over empty space — inside a curled tentacle, off the sprite — which will
   * appear to do nothing when posed.
   */
  const inertBoneIds = computed(() => {
    const w = weights.value;
    if (!w.vertexCount || !bones.value.length) return new Set<number>();
    const owning = new Set<number>();
    for (let v = 0; v < w.vertexCount; v++) {
      const base = v * w.maxInfluences;
      for (let i = 0; i < w.maxInfluences; i++) {
        if (w.boneIds[base + i] !== -1 && w.values[base + i] > 0.001)
          owning.add(w.boneIds[base + i]);
      }
    }
    return new Set(
      bones.value.filter((b) => !owning.has(b.id)).map((b) => b.id)
    );
  });

  /** Fraction of vertices bound to at least one bone — a rig-health signal. */
  const boundVertexRatio = computed(() => {
    const w = weights.value;
    if (!w.vertexCount) return 0;
    let bound = 0;
    for (let v = 0; v < w.vertexCount; v++) {
      const base = v * w.maxInfluences;
      for (let i = 0; i < w.maxInfluences; i++) {
        if (w.boneIds[base + i] !== -1 && w.values[base + i] > 0) {
          bound++;
          break;
        }
      }
    }
    return bound / w.vertexCount;
  });

  // ── overlay visibility ─────────────────────────────────────────────────────
  // Editing stages need the bones and wireframe visible; the pose stage is a
  // preview, so there they default off and the user can switch them back on.
  const showBones = ref(true);
  const showMesh = ref(true);
  /** Draws the sprite warped onto the deformed mesh, not just the flat rect. */
  const showTexture = ref(true);

  /** Overlay defaults per stage, applied when the user switches stage. */
  function applyStageDefaults(next: RigStage) {
    const preview = next === 'pose';
    showBones.value = !preview;
    showMesh.value = !preview;
    // Editing stages work on the rest shape, so drop any physics pose on the
    // way out; otherwise bones would sit in a sagged pose over a rest sprite.
    if (!preview) resetPose();
  }

  // ── deformation ────────────────────────────────────────────────────────────
  const deformed = shallowRef<Float32Array>(new Float32Array());

  /** Recomputes skinned vertex positions for the current pose. */
  function updateDeformed() {
    const m = mesh.value;
    if (!m || !m.vertices.length) return;
    if (deformed.value.length !== m.vertices.length)
      deformed.value = new Float32Array(m.vertices.length);
    deform(
      m.vertices,
      weights.value,
      skinningMatrices(bones.value),
      deformed.value
    );
  }

  // ── setup / teardown ───────────────────────────────────────────────────────
  function setSource(
    cellKey: string | null,
    nextRegion: RigRegion,
    name: string
  ) {
    const changed =
      sourceCellKey.value !== cellKey ||
      region.value.x !== nextRegion.x ||
      region.value.y !== nextRegion.y ||
      region.value.width !== nextRegion.width ||
      region.value.height !== nextRegion.height;
    sourceCellKey.value = cellKey;
    region.value = { ...nextRegion };
    spriteName.value = name || 'sprite';
    // The old mesh and bones are meaningless in a different sprite's space.
    if (changed) {
      clearMesh();
      bones.value = [];
      selectedBoneId.value = null;
      resetPhysicsState(physicsState);
    }
  }

  const hasRig = computed(() => bones.value.length > 0 && !!mesh.value);

  function reset() {
    stage.value = 'bones';
    sourceCellKey.value = null;
    region.value = { x: 0, y: 0, width: 0, height: 0 };
    bones.value = [];
    selectedBoneId.value = null;
    clearMesh();
    physicsRunning.value = false;
    resetPhysicsState(physicsState);
    physicsAccumulator = 0;
  }

  return {
    stage,
    sourceCellKey,
    region,
    spriteName,
    bones,
    selectedBoneId,
    selectedBone,
    boneTree,
    boneAnchors,
    findSnapTip,
    addBone,
    applyPreset,
    extendBone,
    skeletonPresets,
    removeBone,
    renameBone,
    setBoneParent,
    clearBones,
    physicsRunning,
    ikChainDepth,
    flickStrength,
    dragBoneTo,
    pickShaft,
    pokeBone,
    toggleBonePhysics,
    advancePhysics,
    pokePhysics,
    resetPose,
    mesh,
    meshOptions,
    isGeneratingMesh,
    generateMesh,
    meshRequestId,
    requestMesh,
    clearMesh,
    vertexCount,
    triangleCount,
    weights,
    autoWeightOptions,
    respectSilhouette,
    brushRadius,
    brushStrength,
    showWeightHeatmap,
    computeAutoWeights,
    paintWeights,
    normalizeAllWeights,
    boundVertexRatio,
    inertBoneIds,
    deformed,
    updateDeformed,
    showBones,
    showMesh,
    showTexture,
    applyStageDefaults,
    setSource,
    hasRig,
    reset,
  };
});
