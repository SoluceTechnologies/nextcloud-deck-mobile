import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { DragProvider } from '../../../../src/features/board/dnd/DragContext';
import { StackSlot } from '../../../../src/features/board/dnd/StackSlot';

it.each([
  ['moved left', 2, 0, { left: 0, right: 200 }],
  ['moved right', 0, 2, { left: 200, right: 0 }],
  ['never moved', 1, 1, { left: 0, right: 0 }],
])('keeps a list that %s tappable where it is drawn', (_case, index, anchor, hitSlop) => {
  render(
    <DragProvider enabled onDrop={jest.fn()}>
      <StackSlot stackId="s1" index={index} anchor={anchor} step={100}>
        <Text>List</Text>
      </StackSlot>
    </DragProvider>,
  );
  expect(screen.getByTestId('stack-slot').props.hitSlop).toEqual(hitSlop);
});

it('lets touches through its own shifted area', () => {
  render(
    <DragProvider enabled onDrop={jest.fn()}>
      <StackSlot stackId="s1" index={1} anchor={0} step={100}>
        <Text>List</Text>
      </StackSlot>
    </DragProvider>,
  );
  expect(screen.getByTestId('stack-slot').props.pointerEvents).toBe('box-none');
});
