// Where each frame lands on the output sheet. Shared by the result preview and
// the export, so what the preview shows is exactly what gets written.

export type SheetLayout = 'rows' | 'grid';

export interface PlanItem {
  id: number;
  /** Row in the source image. */
  row: number;
  /** Empty cells to leave before this sprite. */
  gapBefore?: number;
  /** Start a new output row at this sprite. */
  breakBefore?: boolean;
}

export interface SheetCell {
  col: number;
  row: number;
  /** Sprite id, or null for an empty cell. */
  id: number | null;
  /** Sprite the cell belongs to (for an empty cell: the one it precedes). */
  owner: number;
}

export interface SheetPlan {
  cols: number;
  rows: number;
  cells: SheetCell[];
}

/**
 * 'rows' keeps the source rows (a cycle drawn on one row stays one row);
 * 'grid' fills rows of `columns` cells. Empty cells and forced breaks apply
 * in both.
 */
export function planSheet(
  items: PlanItem[],
  layout: SheetLayout,
  columns: number
): SheetPlan {
  const wrap = layout === 'grid' ? Math.max(1, Math.round(columns)) : Infinity;
  const cells: SheetCell[] = [];
  let col = 0;
  let row = 0;
  let prevRow: number | null = null;

  const place = (id: number | null, owner: number) => {
    if (col >= wrap) {
      row++;
      col = 0;
    }
    cells.push({ col, row, id, owner });
    col++;
  };

  for (const it of items) {
    const sourceBreak = layout === 'rows' && prevRow !== null && it.row !== prevRow;
    if ((sourceBreak || it.breakBefore) && col > 0) {
      row++;
      col = 0;
    }
    prevRow = it.row;
    for (let g = 0; g < (it.gapBefore ?? 0); g++) place(null, it.id);
    place(it.id, it.id);
  }

  let cols = 0;
  for (const c of cells) cols = Math.max(cols, c.col + 1);
  return { cols, rows: cells.length ? row + 1 : 0, cells };
}

export interface SheetGeometry {
  width: number;
  height: number;
  /** Top-left of a cell, in sheet pixels. */
  at(cell: SheetCell): { x: number; y: number };
}

export function sheetGeometry(
  plan: SheetPlan,
  frameW: number,
  frameH: number,
  gap: number
): SheetGeometry {
  const g = Math.max(0, Math.round(gap));
  return {
    width: plan.cols ? plan.cols * frameW + (plan.cols - 1) * g : 0,
    height: plan.rows ? plan.rows * frameH + (plan.rows - 1) * g : 0,
    at: (cell) => ({ x: cell.col * (frameW + g), y: cell.row * (frameH + g) }),
  };
}
