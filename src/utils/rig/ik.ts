// Inverse kinematics for dragging: given a target point, rotate a chain of
// bones so the end effector reaches it.
//
// Uses CCD (cyclic coordinate descent): walk from the tip toward the root,
// rotating each bone to aim its end at the target, and repeat. It is iterative
// rather than closed-form, which makes it trivial to cap at any chain length
// and to stop early once close enough — ideal for interactive dragging.

import {
  applyMat,
  poseTransforms,
  type Bone,
  type Mat2x3,
} from './skeleton';

/** Wraps an angle into (-π, π]. */
function normalizeAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export interface IkOptions {
  /** Max CCD passes over the chain. */
  iterations: number;
  /** Stop once the effector is within this many px of the target. */
  tolerance: number;
  /**
   * Per-bone limit on how far one solve may rotate a bone, in radians. Keeps
   * a fast drag from snapping the chain into a wild pose.
   */
  maxStep: number;
}

export const defaultIkOptions: IkOptions = {
  iterations: 12,
  tolerance: 0.5,
  maxStep: 0.35,
};

/**
 * Builds the chain from `boneId` up toward the root, tip-first, at most
 * `depth` bones long. Stops early at a bone whose parent is missing.
 */
export function buildChain(
  bones: Bone[],
  boneId: number,
  depth: number
): Bone[] {
  const byId = new Map(bones.map((b) => [b.id, b]));
  const chain: Bone[] = [];
  let cursor: number | null = boneId;
  while (cursor !== null && chain.length < depth) {
    const bone = byId.get(cursor);
    if (!bone) break;
    chain.push(bone);
    cursor = bone.parentId;
  }
  return chain;
}

/**
 * Rotates `chain` (tip-first) so that the point `localOffset` along the first
 * bone reaches `targetX/targetY` in world space. Mutates `poseRotation`.
 *
 * `localOffset` lets the caller grab anywhere along the bone — passing the
 * bone's length grabs its tip, half its length grabs the middle.
 *
 * Returns the final distance from effector to target.
 */
export function solveIk(
  allBones: Bone[],
  chain: Bone[],
  targetX: number,
  targetY: number,
  localOffset: number,
  options: IkOptions = defaultIkOptions
): number {
  if (!chain.length) return Infinity;

  const effector = chain[0];
  let transforms: Map<number, Mat2x3> = poseTransforms(allBones);

  const effectorPos = () => {
    const m = transforms.get(effector.id);
    return m ? applyMat(m, localOffset, 0) : { x: 0, y: 0 };
  };

  let dist = Infinity;
  for (let iter = 0; iter < options.iterations; iter++) {
    for (const bone of chain) {
      const pivotMat = transforms.get(bone.id);
      if (!pivotMat) continue;
      // The bone rotates about its own origin.
      const pivot = applyMat(pivotMat, 0, 0);
      const eff = effectorPos();

      const toEff = Math.atan2(eff.y - pivot.y, eff.x - pivot.x);
      const toTarget = Math.atan2(targetY - pivot.y, targetX - pivot.x);
      let delta = normalizeAngle(toTarget - toEff);

      // Clamp per-step rotation so the pose stays smooth under fast drags.
      if (delta > options.maxStep) delta = options.maxStep;
      else if (delta < -options.maxStep) delta = -options.maxStep;

      bone.poseRotation = normalizeAngle(bone.poseRotation + delta);
      // Children moved, so refresh before handling the next bone up.
      transforms = poseTransforms(allBones);
    }

    const eff = effectorPos();
    dist = Math.hypot(eff.x - targetX, eff.y - targetY);
    if (dist <= options.tolerance) break;
  }

  return dist;
}

/**
 * Finds the bone whose shaft is closest to a point, for grab-the-mesh dragging.
 * Returns the bone plus how far along its shaft the point projects, so the
 * caller can grab that exact spot rather than always the tip.
 */
export function pickBoneByShaft(
  bones: Bone[],
  worldX: number,
  worldY: number,
  maxDistance: number
): { bone: Bone; offset: number; distance: number } | null {
  const transforms = poseTransforms(bones);
  let best: { bone: Bone; offset: number; distance: number } | null = null;

  for (const bone of bones) {
    const m = transforms.get(bone.id);
    if (!m) continue;
    const start = applyMat(m, 0, 0);
    const end = applyMat(m, bone.length, 0);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lenSq = dx * dx + dy * dy;

    let t = 0;
    if (lenSq > 1e-9)
      t = Math.max(
        0,
        Math.min(1, ((worldX - start.x) * dx + (worldY - start.y) * dy) / lenSq)
      );
    const px = start.x + t * dx;
    const py = start.y + t * dy;
    const distance = Math.hypot(worldX - px, worldY - py);

    if (distance <= maxDistance && (!best || distance < best.distance))
      best = { bone, offset: t * bone.length, distance };
  }

  return best;
}
