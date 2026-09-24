import { columnIndexAt, edgeDirection, insertionIndexAt, orderFor } from '../../../../src/features/board/dnd/dropTarget';

const g = { gap: 12, columnWidth: 350, columnCount: 3 };   // columns at content x 12, 374, 736

describe('columnIndexAt', () => {
  it('finds the column under the finger with no scroll', () => {
    expect(columnIndexAt(100, 0, g)).toBe(0);
    expect(columnIndexAt(400, 0, g)).toBe(1);
  });
  it('accounts for the horizontal scroll offset', () => {
    expect(columnIndexAt(100, 362, g)).toBe(1);   // content x 462 → column 1
  });
  it('clamps to the first and last column', () => {
    expect(columnIndexAt(-50, 0, g)).toBe(0);
    expect(columnIndexAt(2000, 0, g)).toBe(2);
  });
  it('treats the gap as belonging to the column on its left', () => {
    expect(columnIndexAt(365, 0, g)).toBe(0);     // in the gap between 0 and 1
  });
  it('returns null when there are no columns', () => {
    expect(columnIndexAt(100, 0, { ...g, columnCount: 0 })).toBeNull();
  });
});

describe('insertionIndexAt', () => {
  const tiles = [
    { cardId: 'a', y: 0, height: 80 }, { cardId: 'b', y: 88, height: 80 }, { cardId: 'c', y: 176, height: 80 },
  ];
  it('inserts before the first tile above its midpoint', () => { expect(insertionIndexAt(10, tiles, 'x')).toBe(0); });
  it('inserts after a tile once past its midpoint', () => { expect(insertionIndexAt(50, tiles, 'x')).toBe(1); });
  it('inserts at the end below the last tile', () => { expect(insertionIndexAt(500, tiles, 'x')).toBe(3); });
  it('ignores the dragged tile itself', () => {
    expect(insertionIndexAt(500, tiles, 'c')).toBe(2);        // only a and b count
    expect(insertionIndexAt(130, tiles, 'b')).toBe(1);        // past a's midpoint, b excluded, before c's midpoint
  });
  it('is zero for an empty column', () => { expect(insertionIndexAt(40, [], 'x')).toBe(0); });
});

describe('orderFor', () => {
  it('goes before the first card', () => { expect(orderFor(0, [3, 5, 9])).toEqual({ local: 2, remote: 0 }); });
  it('goes between two cards', () => { expect(orderFor(1, [3, 5, 9])).toEqual({ local: 4, remote: 1 }); });
  it('goes after the last card', () => { expect(orderFor(3, [3, 5, 9])).toEqual({ local: 10, remote: 3 }); });
  it('is zero in an empty column', () => { expect(orderFor(0, [])).toEqual({ local: 0, remote: 0 }); });
  it('still separates adjacent integer orders', () => { expect(orderFor(1, [3, 4]).local).toBeGreaterThan(3); expect(orderFor(1, [3, 4]).local).toBeLessThan(4); });
});

describe('edgeDirection', () => {
  it('reports the start edge, the end edge, and the middle', () => {
    expect(edgeDirection(10, 400, 48)).toBe(-1);
    expect(edgeDirection(380, 400, 48)).toBe(1);
    expect(edgeDirection(200, 400, 48)).toBe(0);
  });
});
