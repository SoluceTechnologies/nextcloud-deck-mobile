import { targetAt } from '../../../../src/features/board/dnd/dragController';

const frame = {
  stackIds: ['s1', 's2'], geometry: { gap: 12, columnWidth: 350, columnCount: 2 }, scrollX: 0, listTopY: 200,
  registry: {
    s1: { scrollY: 0, tiles: [{ cardId: 'a', y: 0, height: 80 }, { cardId: 'b', y: 88, height: 80 }] },
    s2: { scrollY: 100, tiles: [{ cardId: 'c', y: 0, height: 80 }] },
  },
};

it('targets the column under the finger and the slot under the finger', () => {
  expect(targetAt(100, 210, 'x', frame)).toEqual({ stackId: 's1', index: 0 });
  expect(targetAt(100, 260, 'x', frame)).toEqual({ stackId: 's1', index: 1 });
});
it('adds the target column\'s own scroll offset', () => {
  expect(targetAt(400, 210, 'x', frame)).toEqual({ stackId: 's2', index: 1 });   // local y 110 > c's midpoint 40
});
it('excludes the dragged card from its own column', () => {
  expect(targetAt(100, 400, 'b', frame)).toEqual({ stackId: 's1', index: 1 });
});
it('falls back to an empty column when it has no layout yet', () => {
  expect(targetAt(400, 210, 'x', { ...frame, registry: { s1: frame.registry.s1 } })).toEqual({ stackId: 's2', index: 0 });
});
it('is null when there are no columns', () => {
  expect(targetAt(100, 210, 'x', { ...frame, stackIds: [], geometry: { ...frame.geometry, columnCount: 0 } })).toBeNull();
});
