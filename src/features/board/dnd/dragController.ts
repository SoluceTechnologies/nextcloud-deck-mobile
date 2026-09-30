import { columnIndexAt, insertionIndexAt, type ColumnGeometry, type TileLayout } from './dropTarget';

export type ColumnState = { scrollY: number; tiles: TileLayout[] };
export type DragRegistry = Record<string, ColumnState>;
export type DragFrame = {
  stackIds: string[];
  geometry: ColumnGeometry;
  scrollX: number;
  listTopY: number;
  registry: DragRegistry;
};
export type DragTarget = { stackId: string; index: number };
export type DropResult = { cardId: string; fromStackId: string; toStackId: string; index: number };

export function targetAt(
  absoluteX: number,
  absoluteY: number,
  draggedId: string,
  frame: DragFrame,
): DragTarget | null {
  'worklet';
  const columnIndex = columnIndexAt(absoluteX, frame.scrollX, frame.geometry);
  if (columnIndex === null) return null;

  const stackId = frame.stackIds[columnIndex];
  const column = frame.registry[stackId];
  const localY = absoluteY - frame.listTopY + (column?.scrollY ?? 0);
  const index = insertionIndexAt(localY, column?.tiles ?? [], draggedId);
  return { stackId, index };
}

export function headerIndexAt(absoluteX: number, absoluteY: number, frame: DragFrame): number | null {
  'worklet';
  if (absoluteY >= frame.listTopY) return null;
  const { gap, columnWidth, columnCount } = frame.geometry;
  const contentX = absoluteX + frame.scrollX - gap;
  if (contentX < 0) return null;
  const index = Math.floor(contentX / (columnWidth + gap));
  if (index >= columnCount || contentX - index * (columnWidth + gap) > columnWidth) return null;
  return index;
}
