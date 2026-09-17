import { render, screen, fireEvent } from '@testing-library/react-native';
import { getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { ThemeWrapper } from '../../helpers/theme';
import { StackColumn } from '../../../src/features/board/components/StackColumn';
import { DragProvider } from '../../../src/features/board/dnd/DragContext';

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (k: string, o?: any) => (o?.count != null ? `${k}:${o.count}` : k) }),
}));

const tile = (id: string, title: string) => ({
  card: { id, title, color: null, duedate: null, attachmentCount: 0, commentsCount: 0, doneAt: null },
  labels: [],
  assignees: [],
});

const props = (over: Partial<any> = {}) => ({
  stack: { id: 's1', title: 'En cours' },
  cards: [tile('c1', 'Alpha'), tile('c2', 'Beta')],
  width: 320,
  onCardPress: jest.fn(),
  onAddCard: jest.fn(),
  ...over,
});

it('shows the stack title and its card count', () => {
  render(<StackColumn {...(props() as any)} />, { wrapper: ThemeWrapper });
  expect(screen.getByText('En cours')).toBeTruthy();
  expect(screen.getByText('board.cardCount:2')).toBeTruthy();
});

it('renders a tile per card', () => {
  render(<StackColumn {...(props() as any)} />, { wrapper: ThemeWrapper });
  expect(screen.getByText('Alpha')).toBeTruthy();
  expect(screen.getByText('Beta')).toBeTruthy();
});

it('says so when a list is empty instead of showing a blank column', () => {
  render(<StackColumn {...(props({ cards: [] }) as any)} />, { wrapper: ThemeWrapper });
  expect(screen.getByText('board.emptyList')).toBeTruthy();
});

it('passes the pressed card up by id', () => {
  const p = props();
  render(<StackColumn {...(p as any)} />, { wrapper: ThemeWrapper });
  fireEvent.press(screen.getByText('Beta'));
  expect(p.onCardPress).toHaveBeenCalledWith('c2');
});

it('offers an add-card affordance that reports its stack', () => {
  const p = props();
  render(<StackColumn {...(p as any)} />, { wrapper: ThemeWrapper });
  fireEvent.press(screen.getByText('board.addCard'));
  expect(p.onAddCard).toHaveBeenCalledWith('s1');
});

// The column must be exactly one page wide or the board's paging desynchronizes.
it('takes the width it is given', () => {
  render(<StackColumn {...(props({ width: 280 }) as any)} />, { wrapper: ThemeWrapper });
  expect(screen.getByTestId('stack-column')).toHaveStyle({ width: 280 });
});

it('wraps each tile in a draggable card when draggable', () => {
  render(
    <DragProvider enabled onDrop={jest.fn()}>
      <StackColumn {...(props({ draggable: true }) as any)} />
    </DragProvider>,
    { wrapper: ThemeWrapper },
  );
  expect(getByGestureTestId('drag-c1')).toBeTruthy();
  expect(getByGestureTestId('drag-c2')).toBeTruthy();
});

it('renders plain, non-draggable tiles when draggable is not set', () => {
  render(<StackColumn {...(props() as any)} />, { wrapper: ThemeWrapper });
  expect(() => getByGestureTestId('drag-c1')).toThrow();
});
