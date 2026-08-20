// Spring physics for secondary bone motion (hair, tails, cloth, capes).
//
// Each physics-enabled bone gets a damped angular spring: it lags behind its
// parent's motion, overshoots, and settles back toward its rest angle. This is
// the same model Spine's physics constraints use — cheap, stable, and driven
// entirely by the parent transform, so no collision solver is needed.

import {
  poseTransforms,
  topologicalOrder,
  type Bone,
} from './skeleton';

/** Mutable per-bone simulation state, keyed by bone id. */
export interface PhysicsState {
  /** Current angular velocity, radians per step. */
  velocity: Map<number, number>;
  /** Parent world position on the previous step, to derive drag. */
  lastParentX: Map<number, number>;
  lastParentY: Map<number, number>;
}

export function createPhysicsState(): PhysicsState {
  return {
    velocity: new Map(),
    lastParentX: new Map(),
    lastParentY: new Map(),
  };
}

export function resetPhysicsState(state: PhysicsState): void {
  state.velocity.clear();
  state.lastParentX.clear();
  state.lastParentY.clear();
}

/** Fixed simulation step, in seconds. */
const FIXED_STEP = 1 / 60;
/** Cap on catch-up steps so a long stall cannot freeze the UI. */
const MAX_STEPS = 4;

/**
 * Advances the spring simulation, writing the result into each bone's
 * `poseRotation`. `deltaSeconds` is real elapsed time; it is consumed in fixed
 * steps so behaviour stays identical regardless of frame rate.
 *
 * Returns the leftover accumulator the caller should carry into the next call.
 */
export function stepPhysics(
  bones: Bone[],
  state: PhysicsState,
  deltaSeconds: number,
  accumulator = 0
): number {
  const active = bones.filter((b) => b.physics?.enabled);
  if (!active.length) return 0;

  let time = accumulator + Math.min(deltaSeconds, 0.25);
  let steps = 0;
  while (time >= FIXED_STEP && steps < MAX_STEPS) {
    simulateStep(bones, active, state);
    time -= FIXED_STEP;
    steps++;
  }
  // Drop the backlog if we hit the cap, rather than accumulating debt forever.
  return steps >= MAX_STEPS ? 0 : time;
}

function simulateStep(
  bones: Bone[],
  active: Bone[],
  state: PhysicsState
): void {
  const byId = new Map(bones.map((b) => [b.id, b]));
  const ordered = topologicalOrder(active);

  // World transforms reflect the poses set so far this step, so a chain of
  // physics bones propagates motion from parent to child. Recomputed once per
  // bone in hierarchy order, since solving a bone changes its children.
  let world = poseTransforms(bones);

  for (const bone of ordered) {
    const physics = bone.physics!;
    const parent = bone.parentId !== null ? byId.get(bone.parentId) : undefined;

    // Drag: how far the parent origin moved since the last step.
    let dragTorque = 0;
    if (parent) {
      const m = world.get(parent.id);
      if (m) {
        const px = m[4];
        const py = m[5];
        const lastX = state.lastParentX.get(bone.id);
        const lastY = state.lastParentY.get(bone.id);
        if (lastX !== undefined && lastY !== undefined) {
          const moveX = px - lastX;
          const moveY = py - lastY;
          // Motion perpendicular to the bone shaft is what swings it. The bone
          // points along +x in its own frame, so rotate the world delta back.
          const boneAngle = Math.atan2(m[1], m[0]) + bone.rotation + bone.poseRotation;
          const perpendicular =
            -moveX * Math.sin(boneAngle) + moveY * Math.cos(boneAngle);
          dragTorque = -perpendicular * physics.inertia * 0.05;
        }
        state.lastParentX.set(bone.id, px);
        state.lastParentY.set(bone.id, py);
      }
    }

    // Gravity pulls the bone tip toward world +y, strongest when horizontal.
    const m = world.get(bone.id);
    const worldAngle = m ? Math.atan2(m[1], m[0]) : 0;
    const gravityTorque = Math.cos(worldAngle) * physics.gravity * 0.6;

    // Damped angular spring toward the rest angle (poseRotation === 0).
    const spring = -bone.poseRotation * physics.stiffness;
    const velocity = state.velocity.get(bone.id) ?? 0;
    const acceleration = spring + gravityTorque + dragTorque;

    let next = (velocity + acceleration) * (1 - physics.damping);
    if (!Number.isFinite(next)) next = 0;
    // Clamp so an extreme parameter combination cannot spin a bone wildly.
    next = Math.max(-1, Math.min(1, next));

    state.velocity.set(bone.id, next);
    bone.poseRotation = Math.max(
      -Math.PI,
      Math.min(Math.PI, bone.poseRotation + next)
    );

    // Refresh transforms so this bone's children see the updated pose.
    world = poseTransforms(bones);
  }
}

/**
 * Adds angular velocity to one bone and its descendants, scaled down with
 * depth. Used when the user flicks or pokes a bone: the whole sub-chain reacts
 * rather than just the bone under the cursor.
 */
export function applyImpulseAt(
  bones: Bone[],
  state: PhysicsState,
  boneId: number,
  strength: number
): void {
  // Depth of each bone below the impulse origin; -1 means unrelated.
  const depth = new Map<number, number>([[boneId, 0]]);
  for (const bone of topologicalOrder(bones)) {
    if (depth.has(bone.id)) continue;
    if (bone.parentId === null) continue;
    const parentDepth = depth.get(bone.parentId);
    if (parentDepth !== undefined) depth.set(bone.id, parentDepth + 1);
  }

  for (const [id, d] of depth) {
    const bone = bones.find((b) => b.id === id);
    if (!bone?.physics?.enabled) continue;
    // Falloff keeps the origin snappy while the tail trails behind.
    const scaled = strength / (1 + d * 0.6);
    state.velocity.set(id, (state.velocity.get(id) ?? 0) + scaled);
  }
}

/**
 * Nudges every physics bone with an impulse — useful for a "poke" button that
 * demonstrates the spring settings without needing an animation.
 */
export function applyImpulse(
  bones: Bone[],
  state: PhysicsState,
  strength = 0.25
): void {
  for (const bone of bones) {
    if (!bone.physics?.enabled) continue;
    const current = state.velocity.get(bone.id) ?? 0;
    state.velocity.set(bone.id, current + strength);
  }
}
