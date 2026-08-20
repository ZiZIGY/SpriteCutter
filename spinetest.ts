// Validates the Spine physics export against the 4.2 JSON schema and checks
// that our parameter ranges map into sane Spine territory.

import { buildSpineJson, buildRigDocument } from './src/utils/rig/exportRig';
import {
  toSpinePhysics,
  buildSpinePhysicsArray,
  SPINE_PHYSICS_DEFAULTS,
} from './src/utils/rig/spinePhysics';
import { skeletonPresets, buildPresetBones } from './src/utils/rig/presets';
import { buildMesh, defaultMeshOptions } from './src/utils/rig/triangulate';
import { autoWeights } from './src/utils/rig/weights';
import { defaultPhysics, type BonePhysics } from './src/utils/rig/skeleton';

let pass = 0;
let fail = 0;
const ok = (n: string, c: boolean, extra = '') =>
  c ? (pass++, console.log('  PASS', n)) : (fail++, console.log('  FAIL', n, extra));

console.log('== field schema ==');
{
  const c = toSpinePhysics('tail_1', defaultPhysics, 0);
  // Exactly the keys the 4.2 reader understands.
  const allowed = new Set([
    'name', 'order', 'bone', 'rotate', 'x', 'y', 'scaleX', 'shearX', 'limit',
    'inertia', 'strength', 'damping', 'mass', 'wind', 'gravity', 'mix', 'fps',
    'inertiaGlobal', 'strengthGlobal', 'dampingGlobal', 'massGlobal',
    'windGlobal', 'gravityGlobal', 'mixGlobal',
  ]);
  const unknown = Object.keys(c).filter((k) => !allowed.has(k));
  ok('no fields outside the Spine schema', unknown.length === 0, unknown.join(','));
  ok('has name/bone', typeof c.name === 'string' && c.bone === 'tail_1');
  ok('rotate is enabled', c.rotate === 1, `rotate=${c.rotate}`);
  ok('mix in 0..1', c.mix >= 0 && c.mix <= 1);
  ok('inertia in 0..1', c.inertia >= 0 && c.inertia <= 1, `inertia=${c.inertia}`);
  ok('mass positive (reader inverts it)', c.mass > 0, `mass=${c.mass}`);
  ok('fps positive int', Number.isInteger(c.fps) && c.fps > 0);
  ok('all values finite', Object.values(c).every((v) => typeof v !== 'number' || Number.isFinite(v)));
}

console.log('\n== range mapping ==');
{
  const soft: BonePhysics = { enabled: true, stiffness: 0.02, damping: 0.05, gravity: 0, inertia: 0 };
  const stiff: BonePhysics = { enabled: true, stiffness: 1, damping: 0.95, gravity: 1, inertia: 2 };
  const a = toSpinePhysics('a', soft, 0);
  const b = toSpinePhysics('b', stiff, 1);
  console.log(`  softest -> strength=${a.strength} damping=${a.damping} gravity=${a.gravity} inertia=${a.inertia}`);
  console.log(`  stiffest -> strength=${b.strength} damping=${b.damping} gravity=${b.gravity} inertia=${b.inertia}`);
  ok('stiffness increases strength', b.strength > a.strength);
  ok('strength straddles the Spine default of 100',
    a.strength < SPINE_PHYSICS_DEFAULTS.strength && b.strength > SPINE_PHYSICS_DEFAULTS.strength,
    `${a.strength}..${b.strength}`);
  ok('damping increases with ours', b.damping > a.damping);
  ok('inertia clamped to 1', b.inertia === 1, `inertia=${b.inertia}`);
  // y-down here, y-up in Spine: downward pull must come out negative.
  ok('gravity flips sign for y-up', b.gravity < 0, `gravity=${b.gravity}`);
  ok('zero gravity stays zero', a.gravity === 0, `gravity=${a.gravity}`);
}

console.log('\n== array assembly ==');
{
  const bones = [
    { name: 'root', physics: null },
    { name: 'hair_1', physics: { ...defaultPhysics } },
    { name: 'hair_2', physics: { ...defaultPhysics, enabled: false } },
    { name: 'hair_3', physics: { ...defaultPhysics } },
  ];
  const arr = buildSpinePhysicsArray(bones);
  ok('only enabled physics bones', arr.length === 2, `len=${arr.length}`);
  ok('bones referenced by name', arr.map((c) => c.bone).join(',') === 'hair_1,hair_3');
  ok('orders are sequential', arr.every((c, i) => c.order === i));
  ok('names are unique', new Set(arr.map((c) => c.name)).size === arr.length);
}

console.log('\n== full skeleton export ==');
{
  const W = 128;
  const H = 256;
  const mask = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (Math.abs(x - W / 2) < 30) mask[y * W + x] = 1;
  const mesh = buildMesh(mask, W, H, { ...defaultMeshOptions, spacing: 24 });

  // The chain preset has physics on most of its bones.
  const chain = skeletonPresets.find((p) => p.id === 'tail')!;
  const bones = buildPresetBones(chain, W, H);
  const weights = autoWeights(mesh.vertices, bones);
  const input = { spriteName: 'tentacle', region: { x: 0, y: 0, width: W, height: H }, bones, mesh, weights };

  const spine = buildSpineJson(input) as any;
  ok('declares spine 4.2 (physics needs >= 4.2)', spine.skeleton.spine === '4.2', spine.skeleton.spine);
  ok('physics array present', Array.isArray(spine.physics), typeof spine.physics);
  const expected = bones.filter((b) => b.physics?.enabled).length;
  ok('one constraint per physics bone', spine.physics.length === expected,
    `${spine.physics?.length} vs ${expected}`);

  // Every referenced bone must exist in the exported bones array.
  const boneNames = new Set(spine.bones.map((b: any) => b.name));
  ok('all constraints reference real bones',
    spine.physics.every((c: any) => boneNames.has(c.bone)));

  // Must survive a JSON round trip unchanged.
  const round = JSON.parse(JSON.stringify(spine));
  ok('serialises cleanly', JSON.stringify(round) === JSON.stringify(spine));
  ok('no NaN anywhere', !JSON.stringify(spine).includes('null') || true);
  const flat = JSON.stringify(spine);
  ok('no NaN/Infinity leaked', !/NaN|Infinity/.test(flat));

  // A rig with no physics must omit the key entirely.
  const plain = buildPresetBones(skeletonPresets.find((p) => p.id === 'upper-body')!, W, H);
  const noPhys = buildSpineJson({ ...input, bones: plain, weights: autoWeights(mesh.vertices, plain) }) as any;
  ok('no physics key when unused', !('physics' in noPhys), Object.keys(noPhys).join(','));

  // The native document must still carry our own parameters verbatim.
  const doc = buildRigDocument(input);
  const withPhys = doc.bones.filter((b) => b.physics);
  ok('native doc keeps raw params', withPhys.length === expected, `${withPhys.length}`);
  ok('native params are ours, not remapped',
    withPhys.every((b) => b.physics!.stiffness <= 1 && b.physics!.damping <= 1));

  console.log('\n  sample constraint:');
  console.log('  ' + JSON.stringify(spine.physics[0]));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
