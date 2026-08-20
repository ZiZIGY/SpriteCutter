<script setup lang="ts">
  import { computed, ref } from 'vue';
  import JSZip from 'jszip';

  import { useRigStore } from '@/stores/rigStore';
  import { downloadBlob, downloadJSON } from '@/utils/download';
  import { buildRigDocument, buildSpineJson } from '@/utils/rig/exportRig';
  import { buildGodotScene, godotSpringScript } from '@/utils/rig/exportGodot';
  import {
    unityImporterScript,
    unitySpringScript,
  } from '@/utils/rig/exportUnity';

  const rig = useRigStore();
  const busy = ref(false);

  const ready = computed(() => !!rig.mesh && rig.bones.length > 0);
  const physicsCount = computed(
    () => rig.bones.filter((b) => b.physics?.enabled).length
  );

  function exportInput() {
    return {
      spriteName: rig.spriteName,
      region: { ...rig.region },
      bones: rig.bones,
      mesh: rig.mesh!,
      weights: rig.weights,
    };
  }

  function exportNative() {
    if (!ready.value) return;
    downloadJSON(buildRigDocument(exportInput()), `${rig.spriteName}_rig`);
  }

  function exportSpine() {
    if (!ready.value) return;
    downloadJSON(buildSpineJson(exportInput()), `${rig.spriteName}_spine`);
  }

  /** Everything at once: the rig plus per-engine scaffolding and a README. */
  async function exportBundle() {
    if (!ready.value) return;
    busy.value = true;
    try {
      const input = exportInput();
      const name = rig.spriteName;
      const zip = new JSZip();

      zip.file(`${name}_rig.json`, JSON.stringify(buildRigDocument(input), null, 2));

      const spine = zip.folder('spine')!;
      spine.file(
        `${name}.json`,
        JSON.stringify(buildSpineJson(input), null, 2)
      );

      const godot = zip.folder('godot')!;
      godot.file(`${name}.tscn`, buildGodotScene(input));
      godot.file('spring_bones.gd', godotSpringScript());

      const unity = zip.folder('unity')!;
      unity.file('Editor/SpriteCutterRigImporter.cs', unityImporterScript());
      unity.file('SpriteCutterSpringBone.cs', unitySpringScript());
      unity.file(`${name}_rig.json`, JSON.stringify(buildRigDocument(input), null, 2));

      zip.file('README.md', readme(name));

      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(blob, `${name}_rig_bundle.zip`);
    } finally {
      busy.value = false;
    }
  }

  function readme(name: string): string {
    return `# ${name} — риг из SpriteCutter

Кости, сетка и веса скиннинга. Ниже — что куда.

## spine/${name}.json

Spine 4.2. Кости, взвешенный меш и **физика как настоящие physics constraints**
(\`physics\` в JSON: inertia / strength / damping / gravity / mix).
Читается официальными spine-runtime под Unity, Godot, Unreal, PixiJS, Phaser,
LibGDX и другие. Это самый переносимый вариант — физика работает без доработок.

Нужна текстура спрайта рядом с JSON и \`.atlas\` (или загрузка меша напрямую
через рантайм).

## godot/${name}.tscn

Готовая сцена Godot 4: \`Skeleton2D\` + \`Bone2D\` + скиннованный \`Polygon2D\`
(polygon / uv / polygons / bones с весами на вершину).

Положи текстуру по пути из \`ext_resource\` в начале файла и поправь путь, если
он другой. У Godot нет встроенной 2D-пружины, поэтому параметры лежат в
\`metadata/physics_*\` на костях — навесь \`spring_bones.gd\` на \`Skeleton2D\`,
и вторичная анимация заработает так же, как в редакторе.

## unity/

У Unity риг хранится **внутри** ассета спрайта и пишется только через
editor-API, текстового формата нет. Поэтому здесь не «готовый ассет», а импортёр:

1. \`Editor/SpriteCutterRigImporter.cs\` — положи в папку \`Editor\`.
   Нужен пакет \`com.unity.2d.animation\`.
2. Выдели текстуру спрайта в Project, затем
   **Window > SpriteCutter > Apply Rig JSON**, укажи \`${name}_rig.json\`.
3. Навесь на спрайт в сцене компонент \`SpriteSkin\`.
4. Для физики — \`SpriteCutterSpringBone.cs\` на нужные кости.

## ${name}_rig.json

Нейтральный формат: кости с иерархией, меш с UV, веса и наши параметры пружин
как есть. Из него сделан импортёр Unity; удобен и для своего движка.

Оси: у нас Y вниз, у Spine и Unity — вверх. В соответствующих экспортах
вертикаль уже инвертирована.
`;
  }
</script>

<template>
  <VAlert
    v-if="!ready"
    type="info"
    variant="tonal"
    density="compact"
    class="text-caption"
  >
    Готовый риг (кости + сетка) можно выгрузить в JSON.
  </VAlert>

  <template v-else>
    <VBtn
      color="primary"
      variant="flat"
      block
      prependIcon="mdi-folder-zip"
      :loading="busy"
      class="mb-2"
      @click="exportBundle"
    >
      Всё сразу (zip)
    </VBtn>
    <p class="text-caption text-disabled mb-3">
      Spine + Godot-сцена + импортёр Unity + README.
    </p>

    <VDivider class="my-3" />

    <VBtn
      variant="tonal"
      block
      prependIcon="mdi-export"
      class="mb-2"
      @click="exportSpine"
    >
      Только Spine JSON
    </VBtn>
    <VBtn
      variant="tonal"
      block
      prependIcon="mdi-code-json"
      class="mb-3"
      @click="exportNative"
    >
      Только свой формат
    </VBtn>

    <VAlert
      v-if="physicsCount"
      type="success"
      variant="tonal"
      density="compact"
      class="text-caption"
    >
      Физика ({{ physicsCount }}
      {{ physicsCount === 1 ? 'кость' : 'костей' }}) уедет в Spine как
      physics constraints. Для Godot и Unity в архиве лежат скрипты-пружины.
    </VAlert>
    <p
      v-else
      class="text-caption text-disabled"
    >
      Ни у одной кости нет физики — экспортируются только кости, сетка и веса.
    </p>
  </template>
</template>
