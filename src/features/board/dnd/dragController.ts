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

/**
 * The one drag-time computation that must run on the UI thread with no JS
 * round trip (spec §7.4): given where the finger is right now, which column
 * is it over, and which slot in that column's own (possibly scrolled) tile
 * layout. Pure and worklet-safe — every input is plain data already sitting
 * in shared values, nothing here reaches back into React or the database.
 */
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
