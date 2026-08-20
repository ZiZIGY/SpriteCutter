// Ready-made skeletons, scaled to fit the sprite being rigged.
//
// Positions are expressed in a normalised 0..1 space over the sprite bounds
// (x from left, y from top), then scaled to pixels. Proportions follow the
// standard ~7.5-heads-tall figure, so the preset lands close enough on most
// character art that the user only has to nudge joints.

import { defaultPhysics, type Bone } from './skeleton';

interface PresetBone {
  name: string;
  parent: string | null;
  /** Joint position in normalised sprite space. */
  x: number;
  y: number;
  /** Tip position in normalised sprite space; defines length and rotation. */
  tipX: number;
  tipY: number;
  /** Springy secondary motion, for hair and similar. */
  physics?: boolean;
}

export interface SkeletonPreset {
  id: string;
  label: string;
  description: string;
  icon: string;
  bones: PresetBone[];
}

/**
 * Humanoid facing the viewer. Left/right are the character's own sides, so
 * `arm_l` sits on the viewer's right — the convention Spine and Unity use.
 */
const humanoid: SkeletonPreset = {
  id: 'humanoid',
  label: 'Человек',
  description: 'Полный скелет: таз, позвоночник, голова, руки и ноги',
  icon: 'mdi-human',
  bones: [
    // Spine chain, built upward from the pelvis.
    { name: 'pelvis', parent: null, x: 0.5, y: 0.55, tipX: 0.5, tipY: 0.45 },
    { name: 'spine', parent: 'pelvis', x: 0.5, y: 0.45, tipX: 0.5, tipY: 0.32 },
    { name: 'chest', parent: 'spine', x: 0.5, y: 0.32, tipX: 0.5, tipY: 0.22 },
    { name: 'neck', parent: 'chest', x: 0.5, y: 0.22, tipX: 0.5, tipY: 0.17 },
    { name: 'head', parent: 'neck', x: 0.5, y: 0.17, tipX: 0.5, tipY: 0.04 },

    // Arms. Shoulders sit just below the neck joint, at the chest's top.
    { name: 'shoulder_l', parent: 'chest', x: 0.5, y: 0.24, tipX: 0.38, tipY: 0.26 },
    { name: 'arm_l', parent: 'shoulder_l', x: 0.38, y: 0.26, tipX: 0.3, tipY: 0.4 },
    { name: 'forearm_l', parent: 'arm_l', x: 0.3, y: 0.4, tipX: 0.26, tipY: 0.54 },
    { name: 'hand_l', parent: 'forearm_l', x: 0.26, y: 0.54, tipX: 0.24, tipY: 0.6 },

    { name: 'shoulder_r', parent: 'chest', x: 0.5, y: 0.24, tipX: 0.62, tipY: 0.26 },
    { name: 'arm_r', parent: 'shoulder_r', x: 0.62, y: 0.26, tipX: 0.7, tipY: 0.4 },
    { name: 'forearm_r', parent: 'arm_r', x: 0.7, y: 0.4, tipX: 0.74, tipY: 0.54 },
    { name: 'hand_r', parent: 'forearm_r', x: 0.74, y: 0.54, tipX: 0.76, tipY: 0.6 },

    // Legs hang off the pelvis joint, not its tip, so they start at the hips.
    { name: 'thigh_l', parent: 'pelvis', x: 0.43, y: 0.56, tipX: 0.41, tipY: 0.74 },
    { name: 'shin_l', parent: 'thigh_l', x: 0.41, y: 0.74, tipX: 0.4, tipY: 0.92 },
    { name: 'foot_l', parent: 'shin_l', x: 0.4, y: 0.92, tipX: 0.45, tipY: 0.98 },

    { name: 'thigh_r', parent: 'pelvis', x: 0.57, y: 0.56, tipX: 0.59, tipY: 0.74 },
    { name: 'shin_r', parent: 'thigh_r', x: 0.59, y: 0.74, tipX: 0.6, tipY: 0.92 },
    { name: 'foot_r', parent: 'shin_r', x: 0.6, y: 0.92, tipX: 0.55, tipY: 0.98 },
  ],
};

/** Torso-and-head only: for busts, portraits, and UI characters. */
const upperBody: SkeletonPreset = {
  id: 'upper-body',
  label: 'Верх тела',
  description: 'Торс, голова и руки — без ног',
  icon: 'mdi-account',
  bones: [
    { name: 'root', parent: null, x: 0.5, y: 0.9, tipX: 0.5, tipY: 0.62 },
    { name: 'chest', parent: 'root', x: 0.5, y: 0.62, tipX: 0.5, tipY: 0.4 },
    { name: 'neck', parent: 'chest', x: 0.5, y: 0.4, tipX: 0.5, tipY: 0.3 },
    { name: 'head', parent: 'neck', x: 0.5, y: 0.3, tipX: 0.5, tipY: 0.08 },
    { name: 'shoulder_l', parent: 'chest', x: 0.5, y: 0.44, tipX: 0.34, tipY: 0.48 },
    { name: 'arm_l', parent: 'shoulder_l', x: 0.34, y: 0.48, tipX: 0.24, tipY: 0.72 },
    { name: 'shoulder_r', parent: 'chest', x: 0.5, y: 0.44, tipX: 0.66, tipY: 0.48 },
    { name: 'arm_r', parent: 'shoulder_r', x: 0.66, y: 0.48, tipX: 0.76, tipY: 0.72 },
  ],
};

/** A hanging chain with physics on: cloth, tails, hair, rope, banners. */
const tail: SkeletonPreset = {
  id: 'tail',
  label: 'Цепочка (физика)',
  description: '5 костей сверху вниз с включённой пружинной физикой',
  icon: 'mdi-waves',
  bones: [
    { name: 'chain_1', parent: null, x: 0.5, y: 0.06, tipX: 0.5, tipY: 0.25 },
    { name: 'chain_2', parent: 'chain_1', x: 0.5, y: 0.25, tipX: 0.5, tipY: 0.44, physics: true },
    { name: 'chain_3', parent: 'chain_2', x: 0.5, y: 0.44, tipX: 0.5, tipY: 0.63, physics: true },
    { name: 'chain_4', parent: 'chain_3', x: 0.5, y: 0.63, tipX: 0.5, tipY: 0.82, physics: true },
    { name: 'chain_5', parent: 'chain_4', x: 0.5, y: 0.82, tipX: 0.5, tipY: 0.98, physics: true },
  ],
};

/** Quadruped side view: spine along the body, four legs, head and tail. */
const quadruped: SkeletonPreset = {
  id: 'quadruped',
  label: 'Животное (вид сбоку)',
  description: 'Позвоночник, четыре ноги, голова и хвост',
  icon: 'mdi-dog-side',
  bones: [
    { name: 'spine', parent: null, x: 0.7, y: 0.42, tipX: 0.38, tipY: 0.4 },
    { name: 'neck', parent: 'spine', x: 0.38, y: 0.4, tipX: 0.26, tipY: 0.3 },
    { name: 'head', parent: 'neck', x: 0.26, y: 0.3, tipX: 0.12, tipY: 0.28 },
    { name: 'tail_1', parent: 'spine', x: 0.7, y: 0.42, tipX: 0.82, tipY: 0.36 },
    { name: 'tail_2', parent: 'tail_1', x: 0.82, y: 0.36, tipX: 0.94, tipY: 0.28, physics: true },
    { name: 'leg_front_upper', parent: 'spine', x: 0.36, y: 0.46, tipX: 0.34, tipY: 0.7 },
    { name: 'leg_front_lower', parent: 'leg_front_upper', x: 0.34, y: 0.7, tipX: 0.33, tipY: 0.95 },
    { name: 'leg_back_upper', parent: 'spine', x: 0.68, y: 0.46, tipX: 0.7, tipY: 0.7 },
    { name: 'leg_back_lower', parent: 'leg_back_upper', x: 0.7, y: 0.7, tipX: 0.71, tipY: 0.95 },
  ],
};

export const skeletonPresets: SkeletonPreset[] = [
  humanoid,
  upperBody,
  quadruped,
  tail,
];

/**
 * Instantiates a preset as real bones sized to `width`×`height`.
 *
 * Positions are converted to each bone's parent-local frame, matching what
 * `restTransforms` expects: a bone's own transform is relative to its parent's
 * frame, so the chain composes without gaps.
 */
export function buildPresetBones(
  preset: SkeletonPreset,
  width: number,
  height: number,
  startId = 1
): Bone[] {
  // World-space joint and tip of each preset bone, in pixels.
  const world = new Map<
    string,
    { x: number; y: number; tipX: number; tipY: number; angle: number }
  >();
  for (const pb of preset.bones) {
    const x = pb.x * width;
    const y = pb.y * height;
    const tipX = pb.tipX * width;
    const tipY = pb.tipY * height;
    world.set(pb.name, {
      x,
      y,
      tipX,
      tipY,
      angle: Math.atan2(tipY - y, tipX - x),
    });
  }

  const idByName = new Map<string, number>();
  preset.bones.forEach((pb, i) => idByName.set(pb.name, startId + i));

  return preset.bones.map((pb, i) => {
    const w = world.get(pb.name)!;
    const parentWorld = pb.parent ? world.get(pb.parent) : undefined;

    // Express the joint and rotation relative to the parent's frame.
    let localX = w.x;
    let localY = w.y;
    let rotation = w.angle;
    if (parentWorld) {
      const dx = w.x - parentWorld.x;
      const dy = w.y - parentWorld.y;
      const cos = Math.cos(-parentWorld.angle);
      const sin = Math.sin(-parentWorld.angle);
      localX = dx * cos - dy * sin;
      localY = dx * sin + dy * cos;
      rotation = w.angle - parentWorld.angle;
    }

    return {
      id: startId + i,
      name: pb.name,
      parentId: pb.parent ? (idByName.get(pb.parent) ?? null) : null,
      x: localX,
      y: localY,
      rotation,
      length: Math.hypot(w.tipX - w.x, w.tipY - w.y),
      poseRotation: 0,
      poseX: 0,
      poseY: 0,
      poseScale: 1,
      physics: pb.physics ? { ...defaultPhysics } : null,
    } satisfies Bone;
  });
}
