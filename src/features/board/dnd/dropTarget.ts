export type ColumnGeometry = { gap: number; columnWidth: number; columnCount: number };
export type TileLayout = { cardId: string; y: number; height: number };

export function columnIndexAt(absoluteX: number, scrollX: number, geometry: ColumnGeometry): number | null {
  'worklet';
  if (geometry.columnCount === 0) return null;
  const contentX = absoluteX + scrollX - geometry.gap;
  const raw = Math.floor(contentX / (geometry.columnWidth + geometry.gap));
  return Math.min(geometry.columnCount - 1, Math.max(0, raw));
}

export function stackTileLayouts(
  cardIds: string[],
  heights: ReadonlyMap<string, number>,
  padding: number,
  gap: number,
): TileLayout[] {
  const known = cardIds.map((id) => heights.get(id)).filter((h): h is number => h !== undefined);
  const fallback = known.length > 0 ? known.reduce((sum, h) => sum + h, 0) / known.length : 0;
  const tiles: TileLayout[] = [];
  let y = padding;
  for (const cardId of cardIds) {
    const height = heights.get(cardId) ?? fallback;
    tiles.push({ cardId, y, height });
    y += height + gap;
  }
  return tiles;
}

export function insertionIndexAt(localY: number, tiles: TileLayout[], draggedId: string): number {
  'worklet';
  let index = 0;
  for (const tile of tiles) {
    if (tile.cardId === draggedId) continue;
    if (localY > tile.y + tile.height / 2) index += 1;
  }
  return index;
}

export function orderFor(index: number, orders: number[]): { local: number; remote: number } {
  'worklet';
  if (orders.length === 0) return { local: 0, remote: 0 };
  if (index <= 0) return { local: orders[0] - 1, remote: 0 };
  if (index >= orders.length) return { local: orders[orders.length - 1] + 1, remote: orders.length };
  return { local: (orders[index - 1] + orders[index]) / 2, remote: index };
}

export function edgeDirection(position: number, size: number, edge: number): -1 | 0 | 1 {
  'worklet';
  if (position < edge) return -1;
  if (position > size - edge) return 1;
  return 0;
}
