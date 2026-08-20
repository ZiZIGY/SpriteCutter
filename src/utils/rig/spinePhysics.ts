// Maps our spring parameters onto Spine 4.2 physics constraints.
//
// Our solver and Spine's are the same family (a damped spring pulling a bone
// back toward its setup pose, disturbed by parent motion and gravity), but the
// parameter ranges and conventions differ. Verified against the 4.2 runtime:
//
//   spine-runtimes/4.2 spine-csharp/src/SkeletonJson.cs, "physics" array
//     rotate    GetFloat(..., 0)        which property the constraint drives, 0..1
//     inertia   GetFloat(..., 1)        how much bone motion feeds the offset
//     strength  GetFloat(..., 100)      springiness back to the setup pose
//     damping   GetFloat(..., 1)        velocity decay, higher damps more
//     mass      GetFloat(..., 1)        stored as massInverse = 1 / mass
//     wind      GetFloat(..., 0)        constant force along world X
//     gravity   GetFloat(..., 0)        constant force along world Y
//     mix       GetFloat(..., 1)        constraint influence, 0..1
//     limit     GetFloat(..., 5000)     scaled by the skeleton scale
//     fps       GetInt(..., 60)         becomes step = 1 / fps
//
// Two conventions matter for correctness:
//   * Spine is y-up, we are y-down, so gravity flips sign.
//   * `rotate: 1` is what makes the constraint drive bone rotation at all;
//     leaving it 0 would export a constraint that does nothing.

import type { BonePhysics } from './skeleton';

/** One entry of the Spine `physics` array. */
export interface SpinePhysicsConstraint {
  name: string;
  order: number;
  bone: string;
  /** 0..1 — drive the bone's rotation. */
  rotate: number;
  inertia: number;
  strength: number;
  damping: number;
  mass: number;
  gravity: number;
  wind: number;
  mix: number;
  fps: number;
}

/** Spine's own defaults, so we only emit values that differ meaningfully. */
export const SPINE_PHYSICS_DEFAULTS = {
  inertia: 1,
  strength: 100,
  damping: 1,
  mass: 1,
  wind: 0,
  gravity: 0,
  mix: 1,
  fps: 60,
} as const;

/**
 * Converts one bone's spring settings into a Spine physics constraint.
 *
 * The ranges are rescaled rather than copied:
 *  - our `stiffness` is 0.02..1 of a per-step pull; Spine's `strength` is an
 *    absolute springiness centred on 100, so it is scaled up.
 *  - our `damping` is a per-step decay fraction (0..1, higher settles faster);
 *    Spine's `damping` is a coefficient where 1 is the neutral default, so the
 *    fraction is remapped onto a band around 1.
 *  - our `gravity` is a unitless torque scale; Spine's is a world-space force
 *    along +Y, and Spine is y-up, hence the negation.
 */
export function toSpinePhysics(
  boneName: string,
  physics: BonePhysics,
  order: number
): SpinePhysicsConstraint {
  return {
    name: `${boneName}_physics`,
    order,
    bone: boneName,
    // Without this the constraint exists but drives nothing.
    rotate: 1,
    // Both are "how much parent motion is transferred"; ours goes to 2, Spine
    // treats 1 as full transfer, so clamp rather than exceed it.
    inertia: clamp(physics.inertia, 0, 1),
    strength: round(physics.stiffness * 200, 2),
    // 0.05..0.95 of ours maps onto roughly 0.1..2 of Spine's coefficient.
    damping: round(0.1 + physics.damping * 2, 3),
    mass: 1,
    // y-down here, y-up in Spine.
    gravity: round(-physics.gravity * 100, 2),
    wind: 0,
    mix: 1,
    fps: 60,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/**
 * Builds the whole `physics` array for a skeleton. Bones without physics are
 * skipped, so a rig with no springs exports no array at all.
 */
export function buildSpinePhysicsArray(
  bones: { name: string; physics: BonePhysics | null }[]
): SpinePhysicsConstraint[] {
  const constraints: SpinePhysicsConstraint[] = [];
  for (const bone of bones) {
    if (!bone.physics?.enabled) continue;
    constraints.push(toSpinePhysics(bone.name, bone.physics, constraints.length));
  }
  return constraints;
}
