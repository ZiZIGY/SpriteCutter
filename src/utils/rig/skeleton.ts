// Bone hierarchy math: local transforms → world poses → skinning matrices.

export interface Bone {
  id: number;
  name: string;
  parentId: number | null;
  /** Rest position of the bone's origin, in sprite-local pixels. */
  x: number;
  y: number;
  /** Rest rotation in radians, relative to the parent bone. */
  rotation: number;
  /** Bone length in px; drawn as the shaft toward its tip. */
  length: number;
  /** Pose deltas applied on top of the rest transform. */
  poseRotation: number;
  poseX: number;
  poseY: number;
  poseScale: number;
  physics: BonePhysics | null;
}

export interface BonePhysics {
  enabled: boolean;
  /** How strongly the bone springs back to its rest angle. */
  stiffness: number;
  /** Velocity decay per step; higher settles faster. */
  damping: number;
  /** Downward pull, in radians of torque scale. */
  gravity: number;
  /** How much parent motion drags the bone along. */
  inertia: number;
}

export const defaultPhysics: BonePhysics = {
  enabled: true,
  stiffness: 0.35,
  damping: 0.6,
  gravity: 0.15,
  inertia: 0.85,
};

/** 2×3 affine matrix, row-major: [a, b, c, d, tx, ty]. */
export type Mat2x3 = [number, number, number, number, number, number];

export const identity: Mat2x3 = [1, 0, 0, 1, 0, 0];

export function multiply(m: Mat2x3, n: Mat2x3): Mat2x3 {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function compose(
  x: number,
  y: number,
  rotation: number,
  scale = 1
): Mat2x3 {
  const cos = Math.cos(rotation) * scale;
  const sin = Math.sin(rotation) * scale;
  return [cos, sin, -sin, cos, x, y];
}

export function invert(m: Mat2x3): Mat2x3 {
  const det = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(det) < 1e-9) return identity;
  const inv = 1 / det;
  const a = m[3] * inv;
  const b = -m[1] * inv;
  const c = -m[2] * inv;
  const d = m[0] * inv;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}

export function applyMat(
  m: Mat2x3,
  x: number,
  y: number
): { x: number; y: number } {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

/**
 * Orders bones parents-first so a single forward pass can accumulate world
 * transforms. Cycles and orphaned parents are dropped defensively.
 */
export function topologicalOrder(bones: Bone[]): Bone[] {
  const byId = new Map(bones.map((b) => [b.id, b]));
  const ordered: Bone[] = [];
  const state = new Map<number, 'visiting' | 'done'>();

  const visit = (bone: Bone) => {
    const status = state.get(bone.id);
    if (status === 'done' || status === 'visiting') return;
    state.set(bone.id, 'visiting');
    if (bone.parentId !== null) {
      const parent = byId.get(bone.parentId);
      if (parent) visit(parent);
    }
    state.set(bone.id, 'done');
    ordered.push(bone);
  };

  for (const bone of bones) visit(bone);
  return ordered;
}

/** World transform of each bone at rest (pose deltas ignored). */
export function restTransforms(bones: Bone[]): Map<number, Mat2x3> {
  const world = new Map<number, Mat2x3>();
  for (const bone of topologicalOrder(bones)) {
    const local = compose(bone.x, bone.y, bone.rotation);
    const parent =
      bone.parentId !== null ? world.get(bone.parentId) : undefined;
    world.set(bone.id, parent ? multiply(parent, local) : local);
  }
  return world;
}

/** World transform of each bone in its current pose. */
export function poseTransforms(bones: Bone[]): Map<number, Mat2x3> {
  const world = new Map<number, Mat2x3>();
  for (const bone of topologicalOrder(bones)) {
    const local = compose(
      bone.x + bone.poseX,
      bone.y + bone.poseY,
      bone.rotation + bone.poseRotation,
      bone.poseScale
    );
    const parent =
      bone.parentId !== null ? world.get(bone.parentId) : undefined;
    world.set(bone.id, parent ? multiply(parent, local) : local);
  }
  return world;
}

/**
 * Skinning matrix per bone: undo the rest pose, then apply the current one.
 * A vertex is deformed by blending these by its weights (linear blend skinning).
 */
export function skinningMatrices(bones: Bone[]): Map<number, Mat2x3> {
  const rest = restTransforms(bones);
  const pose = poseTransforms(bones);
  const result = new Map<number, Mat2x3>();
  for (const bone of bones) {
    const r = rest.get(bone.id) ?? identity;
    const p = pose.get(bone.id) ?? identity;
    result.set(bone.id, multiply(p, invert(r)));
  }
  return result;
}

/** World-space rest endpoints of a bone, for hit-testing and drawing. */
export function boneSegment(
  bone: Bone,
  transforms: Map<number, Mat2x3>
): { start: { x: number; y: number }; end: { x: number; y: number } } {
  const m = transforms.get(bone.id) ?? identity;
  return {
    start: applyMat(m, 0, 0),
    end: applyMat(m, bone.length, 0),
  };
}
