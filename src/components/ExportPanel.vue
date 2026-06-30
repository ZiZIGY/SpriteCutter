<script setup lang="ts">
  import { ref, computed } from 'vue';
  import { useSpriteStore } from '@/stores/spriteStore';

  const store = useSpriteStore();
  const loading = ref<'single' | 'sheet' | 'full' | 'json' | null>(null);

  const exportAll = ref(false);

  const cellsToExport = computed(() => {
    if (exportAll.value) return store.activeCells;
    return store.activeCells.filter((cell) =>
      store.selectedCells.has(`${cell.col}_${cell.row}`)
    );
  });

  const exportCount = computed(() => cellsToExport.value.length);

  async function loadImg(): Promise<HTMLImageElement> {
    const img = new Image();
    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.src = store.imageSrc;
    });
    return img;
  }

  function downloadCanvas(canvas: HTMLCanvasElement, name: string) {
    const anchor = document.createElement('a');
    anchor.href = canvas.toDataURL(`image/${store.exportFormat}`);
    anchor.download = `${name}.${store.exportFormat}`;
    anchor.click();
  }

  function downloadJSON(data: unknown, name: string) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `${name}.json`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  async function exportSingle() {
    loading.value = 'single';
    const img = await loadImg();
    const cells = cellsToExport.value;
    for (const cell of cells) {
      const offset = store.getCellOffset(cell.col, cell.row);
      const canvas = document.createElement('canvas');
      canvas.width = cell.width;
      canvas.height = cell.height;
      canvas.getContext('2d')!.drawImage(
        img,
        cell.x + offset.x, cell.y + offset.y, cell.width, cell.height,
        0, 0, cell.width, cell.height
      );
      downloadCanvas(
        canvas,
        `sprite_${String(cell.row).padStart(2, '0')}_${String(cell.col).padStart(2, '0')}`
      );
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    loading.value = null;
  }

  async function exportSheet() {
    loading.value = 'sheet';
    const cells = cellsToExport.value;
    if (!cells.length) { loading.value = null; return; }

    const gap = store.exportGap;
    const img = await loadImg();
    const maxCol = Math.max(...cells.map((cell) => cell.col));
    const maxRow = Math.max(...cells.map((cell) => cell.row));
    const cellWidth = Math.max(...cells.map((cell) => cell.width));
    const cellHeight = Math.max(...cells.map((cell) => cell.height));

    const canvas = document.createElement('canvas');
    canvas.width = (maxCol + 1) * cellWidth + maxCol * gap;
    canvas.height = (maxRow + 1) * cellHeight + maxRow * gap;

    const ctx = canvas.getContext('2d')!;
    for (const cell of cells) {
      const offset = store.getCellOffset(cell.col, cell.row);
      ctx.drawImage(
        img,
        cell.x + offset.x, cell.y + offset.y, cell.width, cell.height,
        cell.col * (cellWidth + gap), cell.row * (cellHeight + gap), cell.width, cell.height
      );
    }
    downloadCanvas(canvas, 'spritesheet');
    loading.value = null;
  }

  async function exportFullSheet() {
    loading.value = 'full';
    const cells = store.activeCells;
    if (!cells.length) { loading.value = null; return; }

    const gap = store.exportGap;
    const img = await loadImg();
    const maxCol = Math.max(...cells.map((cell) => cell.col));
    const maxRow = Math.max(...cells.map((cell) => cell.row));
    const cellWidth = Math.max(...cells.map((cell) => cell.width));
    const cellHeight = Math.max(...cells.map((cell) => cell.height));

    const canvas = document.createElement('canvas');
    canvas.width = (maxCol + 1) * cellWidth + maxCol * gap;
    canvas.height = (maxRow + 1) * cellHeight + maxRow * gap;

    const ctx = canvas.getContext('2d')!;
    for (const cell of cells) {
      const offset = store.getCellOffset(cell.col, cell.row);
      ctx.drawImage(
        img,
        cell.x + offset.x, cell.y + offset.y, cell.width, cell.height,
        cell.col * (cellWidth + gap), cell.row * (cellHeight + gap), cell.width, cell.height
      );
    }
    downloadCanvas(canvas, 'spritesheet_full');
    loading.value = null;
  }

  // Экспорт JSON в формате TexturePacker Hash (совместим с Phaser, PixiJS, Unity)
  function exportJSON() {
    loading.value = 'json';

    const cells = cellsToExport.value;
    if (!cells.length) { loading.value = null; return; }

    const imageName = store.imageFile?.name ?? 'spritesheet.png';
    const gap = store.exportGap;
    const maxCol = Math.max(...cells.map((c) => c.col));
    const maxRow = Math.max(...cells.map((c) => c.row));
    const cellW = Math.max(...cells.map((c) => c.width));
    const cellH = Math.max(...cells.map((c) => c.height));

    // frames: ключ → данные спрайта (TexturePacker JSON Hash)
    const frames: Record<string, object> = {};
    for (const cell of cells) {
      const offset = store.getCellOffset(cell.col, cell.row);
      const key = `sprite_${String(cell.row).padStart(2, '0')}_${String(cell.col).padStart(2, '0')}`;

      // destX/Y — позиция в собранном листе (при экспорте "Собрать в лист")
      const destX = cell.col * (cellW + gap);
      const destY = cell.row * (cellH + gap);

      frames[key] = {
        // frame — координаты в собранном листе
        frame: { x: destX, y: destY, w: cell.width, h: cell.height },
        // sourceFrame — координаты в оригинальном изображении (с учётом смещения)
        sourceFrame: {
          x: cell.x + offset.x,
          y: cell.y + offset.y,
          w: cell.width,
          h: cell.height,
        },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: cell.width, h: cell.height },
        sourceSize: { w: cell.width, h: cell.height },
        // grid position для удобства
        col: cell.col,
        row: cell.row,
      };
    }

    const sheetW = (maxCol + 1) * cellW + maxCol * gap;
    const sheetH = (maxRow + 1) * cellH + maxRow * gap;

    const atlas = {
      frames,
      meta: {
        app: 'SpriteCutter',
        image: imageName,
        sourceImage: {
          w: store.imageWidth,
          h: store.imageHeight,
        },
        size: { w: sheetW, h: sheetH },
        scale: 1,
        format: store.exportFormat.toUpperCase(),
        grid: {
          mode: store.gridMode,
          cellWidth: cellW,
          cellHeight: cellH,
          gap: gap,
        },
      },
    };

    const baseName = imageName.replace(/\.[^.]+$/, '');
    downloadJSON(atlas, `${baseName}_atlas`);
    loading.value = null;
  }
</script>

<template>
  <p class="field-label">Формат и зазор</p>
  <div class="two-col mb-3">
    <VSelect
      v-model="store.exportFormat"
      :items="['png', 'webp']"
      density="compact"
      variant="outlined"
      hideDetails
    />
    <VNumberInput
      v-model="store.exportGap"
      controlVariant="stacked"
      density="compact"
      variant="outlined"
      hideDetails
      :min="0"
    />
  </div>

  <VDivider class="my-4" />

  <VCheckbox
    v-model="exportAll"
    density="compact"
    hideDetails
    color="primary"
    class="mb-1 ml-n1"
  >
    <template #label>
      <span class="text-body-2 ml-2">Экспортировать все ячейки</span>
    </template>
  </VCheckbox>

  <p class="text-caption text-disabled mb-3">
    {{ exportAll ? 'Все' : 'Выбранные' }}: {{ exportCount }} из
    {{ store.activeCells.length }}
  </p>

  <template v-if="!exportAll">
    <p class="field-label">Выделение</p>
    <div class="two-col mb-4">
      <VBtn size="small" variant="tonal" @click="store.selectAll()">
        <VIcon start size="15">mdi-checkbox-multiple-marked-outline</VIcon>
        Все
      </VBtn>
      <VBtn
        size="small"
        variant="tonal"
        :disabled="store.selectedCells.size === 0"
        @click="store.deselectAll()"
      >
        <VIcon start size="15">mdi-checkbox-multiple-blank-outline</VIcon>
        Сброс
      </VBtn>
    </div>
  </template>

  <p class="field-label">Скачать</p>
  <div class="export-btns">
    <VBtn
      color="primary"
      size="small"
      block
      prependIcon="mdi-download-multiple"
      :disabled="exportCount === 0"
      :loading="loading === 'single'"
      @click="exportSingle"
    >
      По одному ({{ exportCount }})
    </VBtn>

    <VBtn
      color="secondary"
      size="small"
      block
      prependIcon="mdi-view-grid-plus"
      :disabled="exportCount === 0"
      :loading="loading === 'sheet'"
      @click="exportSheet"
    >
      Собрать в лист
    </VBtn>

    <VBtn
      variant="outlined"
      size="small"
      block
      prependIcon="mdi-image-edit-outline"
      :disabled="!store.imageSrc"
      :loading="loading === 'full'"
      @click="exportFullSheet"
    >
      Весь лист (без линий)
    </VBtn>
  </div>

  <VDivider class="my-3" />

  <p class="field-label">Атлас</p>
  <VBtn
    variant="tonal"
    color="success"
    size="small"
    block
    prependIcon="mdi-code-json"
    :disabled="exportCount === 0"
    :loading="loading === 'json'"
    @click="exportJSON"
  >
    Экспорт JSON ({{ exportCount }})
  </VBtn>

  <VAlert
    type="info"
    variant="tonal"
    density="compact"
    rounded="lg"
    class="mt-3 text-caption"
  >
    Формат TexturePacker Hash — совместим с Phaser, PixiJS, Unity
  </VAlert>

  <VDivider class="my-3" />
  <p class="text-caption text-medium-emphasis">
    <VIcon size="13" class="mr-1">mdi-information-outline</VIcon>
    Линии сетки не попадают в экспорт — только пиксели оригинала
  </p>
</template>

<style scoped>
  .two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .field-label {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.45);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 6px;
    margin-top: 0;
  }
  .export-btns {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
</style>
