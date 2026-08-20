// Rig serialisation: a portable JSON document plus a Spine-flavoured variant
// that game engines and importers can consume directly.

import type { Bone } from './skeleton';
import type { Mesh } from './triangulate';
import type { Weights } from './weights';
import { buildSpinePhysicsArray } from './spinePhysics';

export interface RigDocument {
  format: 'sprite-cutter-rig';
  version: 1;
  sprite: {
    name: string;
    /** Source rect of the sprite inside the sheet, in pixels. */
    x: number;
    y: number;
    width: number;
    height: number;
  };
  bones: {
    name: string;
    parent: string | null;
    x: number;
    y: number;
    rotation: number;
    length: number;
    physics: Bone['physics'];
  }[];
  mesh: {
    /** Vertex positions in sprite-local pixels, flat [x, y, …]. */
    vertices: number[];
    /** Triangle indices, flat triples. */
    triangles: number[];
    /** Normalised UVs, flat [u, v, …]. */
    uvs: number[];
    contourCount: number;
  };
  /** Per-vertex influences: [boneCount, boneIndex, weight, …] per vertex. */
  skinning: number[][];
}

/** Builds normalised UVs from sprite-local vertex positions. */
function buildUVs(
  vertices: Float32Array,
  width: number,
  height: number
): number[] {
  const uvs: number[] = [];
  for (let i = 0; i < vertices.length; i += 2) {
    uvs.push(vertices[i] / width, vertices[i + 1] / height);
  }
  return uvs;
}

export interface RigExportInput {
  spriteName: string;
  region: { x: number; y: number; width: number; height: number };
  bones: Bone[];
  mesh: Mesh;
  weights: Weights;
}

export function buildRigDocument(input: RigExportInput): RigDocument {
  const { spriteName, region, bones, mesh, weights } = input;
  const nameById = new Map(bones.map((b) => [b.id, b.name]));
  const indexById = new Map(bones.map((b, i) => [b.id, i]));

  const skinning: number[][] = [];
  const vertexCount = mesh.vertices.length / 2;
  for (let v = 0; v < vertexCount; v++) {
    const base = v * weights.maxInfluences;
    const entry: number[] = [];
    let count = 0;
    for (let i = 0; i < weights.maxInfluences; i++) {
      const boneId = weights.boneIds[base + i];
      if (boneId === -1) continue;
      const index = indexById.get(boneId);
      if (index === undefined) continue;
      entry.push(index, weights.values[base + i]);
      count++;
    }
    skinning.push([count, ...entry]);
  }

  return {
    format: 'sprite-cutter-rig',
    version: 1,
    sprite: { name: spriteName, ...region },
    bones: bones.map((b) => ({
      name: b.name,
      parent: b.parentId !== null ? nameById.get(b.parentId) ?? null : null,
      x: b.x,
      y: b.y,
      // Degrees are friendlier for hand-editing and match Spine's convention.
      rotation: (b.rotation * 180) / Math.PI,
      length: b.length,
      physics: b.physics,
    })),
    mesh: {
      vertices: Array.from(mesh.vertices),
      triangles: Array.from(mesh.triangles),
      uvs: buildUVs(mesh.vertices, region.width, region.height),
      contourCount: mesh.contourCount,
    },
    skinning,
  };
}

/**
 * Spine-style JSON. Spine uses a y-up coordinate system with the origin at the
 * setup-pose root, so vertical values are flipped relative to our y-down canvas
 * space. Weighted mesh vertices are encoded as
 * `[boneCount, boneIndex, x, y, weight, …]` in bone-local space.
 */
export function buildSpineJson(input: RigExportInput): unknown {
  const { spriteName, region, bones, mesh, weights } = input;
  const nameById = new Map(bones.map((b) => [b.id, b.name]));
  const indexById = new Map(bones.map((b, i) => [b.id, i]));
  const height = region.height;

  const spineBones = [
    { name: 'root' },
    ...bones.map((b) => ({
      name: b.name,
      parent: b.parentId !== null ? nameById.get(b.parentId) ?? 'root' : 'root',
      x: b.x,
      y: -b.y,
      rotation: (-b.rotation * 180) / Math.PI,
      length: b.length,
    })),
  ];

  // Spine wants each weighted vertex in the local space of every bone that
  // influences it, so precompute rest-space offsets per influence.
  const vertexData: number[] = [];
  const vertexCount = mesh.vertices.length / 2;
  for (let v = 0; v < vertexCount; v++) {
    const vx = mesh.vertices[v * 2];
    const vy = height - mesh.vertices[v * 2 + 1];
    const base = v * weights.maxInfluences;
    const influences: { index: number; weight: number; bone: Bone }[] = [];
    for (let i = 0; i < weights.maxInfluences; i++) {
      const boneId = weights.boneIds[base + i];
      if (boneId === -1) continue;
      const index = indexById.get(boneId);
      const bone = bones.find((b) => b.id === boneId);
      if (index === undefined || !bone) continue;
      influences.push({ index: index + 1, weight: weights.values[base + i], bone });
    }
    vertexData.push(influences.length);
    for (const inf of influences) {
      vertexData.push(
        inf.index,
        vx - inf.bone.x,
        vy - (height - inf.bone.y),
        inf.weight
      );
    }
  }

  const uvs = buildUVs(mesh.vertices, region.width, region.height);

  // Spring settings become real Spine physics constraints, so the secondary
  // motion set up here actually runs in any engine using a spine-runtime.
  const physics = buildSpinePhysicsArray(bones);

  return {
    skeleton: {
      hash: `sprite-cutter-${spriteName}`,
      spine: '4.2',
      x: 0,
      y: 0,
      width: region.width,
      height: region.height,
      images: './',
    },
    bones: spineBones,
    slots: [{ name: spriteName, bone: 'root', attachment: spriteName }],
    skins: [
      {
        name: 'default',
        attachments: {
          [spriteName]: {
            [spriteName]: {
              type: 'mesh',
              uvs,
              triangles: Array.from(mesh.triangles),
              vertices: vertexData,
              hull: mesh.contourCount,
              width: region.width,
              height: region.height,
            },
          },
        },
      },
    ],
    // Omitted entirely when no bone has physics, keeping the file clean.
    ...(physics.length ? { physics } : {}),
    animations: { idle: {} },
  };
}
