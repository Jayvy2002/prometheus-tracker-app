import type { DashboardWidget } from './types';

const COLS = 3;

export function spanOf(size: DashboardWidget['size']): number {
  return size === 'small' ? 1 : size === 'medium' ? 2 : 3;
}

export interface PlacedWidget extends DashboardWidget {
  row: number;
  col: number;
}


export function canPlace(
  occupied: Set<string>,
  row: number,
  col: number,
  span: number,
): boolean {
  if (col < 0 || col + span > COLS) return false;
  if (row < 0) return false;
  for (let c = col; c < col + span; c++) {
    if (occupied.has(`${row},${c}`)) return false;
  }
  return true;
}

function findNextFreeSlot(occupied: Set<string>, span: number): { row: number; col: number } {
  for (let r = 0; r < 100; r++) {
    for (let c = 0; c <= COLS - span; c++) {
      if (canPlace(occupied, r, c, span)) return { row: r, col: c };
    }
  }
  return { row: 0, col: 0 };
}

export function autoLayout(widgets: DashboardWidget[]): PlacedWidget[] {
  const placed: PlacedWidget[] = [];
  const occupied = new Set<string>();

  for (const w of widgets) {
    const span = spanOf(w.size);

    if (w.row !== undefined && w.col !== undefined && canPlace(occupied, w.row, w.col, span)) {
      const pw: PlacedWidget = { ...w, row: w.row, col: w.col };
      placed.push(pw);
      for (let c = pw.col; c < pw.col + span; c++) {
        occupied.add(`${pw.row},${c}`);
      }
    } else {
      const slot = findNextFreeSlot(occupied, span);
      const pw: PlacedWidget = { ...w, row: slot.row, col: slot.col };
      placed.push(pw);
      for (let c = pw.col; c < pw.col + span; c++) {
        occupied.add(`${pw.row},${c}`);
      }
    }
  }

  return placed;
}

export function findDropTarget(
  placed: PlacedWidget[],
  dragId: string,
  gridRect: DOMRect,
  cellWidth: number,
  rowHeight: number,
  gap: number,
  cursorX: number,
  cursorY: number,
  dragSpan: number,
): { row: number; col: number } | null {
  const relX = cursorX - gridRect.left;
  const relY = cursorY - gridRect.top;

  const col = Math.floor(relX / (cellWidth + gap));
  const row = Math.floor(relY / (rowHeight + gap));

  const clampedCol = Math.max(0, Math.min(COLS - dragSpan, col));
  const clampedRow = Math.max(0, row);

  return { row: clampedRow, col: clampedCol };
}

export function maxRow(placed: PlacedWidget[]): number {
  let max = 0;
  for (const w of placed) {
    if (w.row + 1 > max) max = w.row + 1;
  }
  return max;
}

export function layoutWithDragPreview(
  widgets: DashboardWidget[],
  dragId: string,
  targetRow: number,
  targetCol: number,
): PlacedWidget[] {
  const dragWidget = widgets.find(w => w.id === dragId);
  if (!dragWidget) return autoLayout(widgets);

  const dragSpan = spanOf(dragWidget.size);

  const basePlaced = autoLayout(widgets.filter(w => w.id !== dragId));

  const result: PlacedWidget[] = [];

  const clampedCol = Math.max(0, Math.min(COLS - dragSpan, targetCol));
  const clampedRow = Math.max(0, targetRow);

  const dragPlaced: PlacedWidget = { ...dragWidget, row: clampedRow, col: clampedCol };

  const occupied = new Set<string>();
  for (let c = clampedCol; c < clampedCol + dragSpan; c++) {
    occupied.add(`${clampedRow},${c}`);
  }
  result.push(dragPlaced);

  const others = [...basePlaced].sort((a, b) =>
    a.row !== b.row ? a.row - b.row : a.col - b.col
  );

  for (const w of others) {
    const span = spanOf(w.size);

    if (canPlace(occupied, w.row, w.col, span)) {
      result.push({ ...w });
      for (let c = w.col; c < w.col + span; c++) {
        occupied.add(`${w.row},${c}`);
      }
      continue;
    }

    const placed = tryPushWidget(w, span, occupied, clampedRow);
    result.push(placed);
    for (let c = placed.col; c < placed.col + span; c++) {
      occupied.add(`${placed.row},${c}`);
    }
  }

  return result;
}

function tryPushWidget(
  w: PlacedWidget,
  span: number,
  occupied: Set<string>,
  dragRow: number,
): PlacedWidget {
  const candidates: Array<{ row: number; col: number; priority: number }> = [];

  for (let c = 0; c <= COLS - span; c++) {
    if (c !== w.col && canPlace(occupied, w.row, c, span)) {
      const dist = Math.abs(c - w.col);
      candidates.push({ row: w.row, col: c, priority: dist });
    }
  }

  const nextRow = w.row >= dragRow ? w.row + 1 : w.row - 1;
  if (nextRow >= 0) {
    for (let c = 0; c <= COLS - span; c++) {
      if (canPlace(occupied, nextRow, c, span)) {
        const dist = Math.abs(c - w.col) + 10;
        candidates.push({ row: nextRow, col: c, priority: dist });
      }
    }
  }

  const downRow = w.row + 1;
  for (let c = 0; c <= COLS - span; c++) {
    if (canPlace(occupied, downRow, c, span)) {
      const dist = Math.abs(c - w.col) + 20;
      candidates.push({ row: downRow, col: c, priority: dist });
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => a.priority - b.priority);
    return { ...w, row: candidates[0].row, col: candidates[0].col };
  }

  const slot = findNextFreeSlot(occupied, span);
  return { ...w, row: slot.row, col: slot.col };
}
