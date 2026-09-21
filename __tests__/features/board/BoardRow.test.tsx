import { render, screen, fireEvent } from '@testing-library/react-native';

import { ThemeWrapper } from '../../helpers/theme';
import { BoardRow } from '../../../src/features/board/components/BoardRow';

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (k: string, o?: any) => (o?.when ? `${k}:${o.when}` : k) }),
}));

const summary = (over: Partial<any> = {}) => ({
  board: { id: 'b1', title: 'Commercial', color: '#0082c9', lastModified: 1757000000, ...over },
  doneCount: 0,
  totalCount: 17,
  shared: true,
  ...(over.summary ?? {}),
});

it('shows the title and the done/total ratio', () => {
  render(<BoardRow summary={summary() as never} onPress={jest.fn()} onLongPress={jest.fn()} />, {
    wrapper: ThemeWrapper,
  });
  expect(screen.getByText('Commercial')).toBeTruthy();
  expect(screen.getByText('0/17')).toBeTruthy();
});

it('marks a shared board and leaves a private one unmarked', () => {
  const { rerender } = render(
    <BoardRow summary={summary() as never} onPress={jest.fn()} onLongPress={jest.fn()} />,
    { wrapper: ThemeWrapper },
  );
  expect(screen.getByText('boards.shared')).toBeTruthy();

  rerender(
    <BoardRow
      summary={{ ...summary(), shared: false } as never}
      onPress={jest.fn()}
      onLongPress={jest.fn()}
    />,
  );
  expect(screen.queryByText('boards.shared')).toBeNull();
});

it('calls onPress when tapped and onLongPress when held', () => {
  const onPress = jest.fn();
  const onLongPress = jest.fn();
  render(<BoardRow summary={summary() as never} onPress={onPress} onLongPress={onLongPress} />, {
    wrapper: ThemeWrapper,
  });

  fireEvent.press(screen.getByText('Commercial'));
  expect(onPress).toHaveBeenCalledTimes(1);

  fireEvent(screen.getByText('Commercial'), 'longPress');
  expect(onLongPress).toHaveBeenCalledTimes(1);
});

// The coloured edge is the board's only identity signal in a long list.
it('paints the leading edge with the board colour', () => {
  render(<BoardRow summary={summary() as never} onPress={jest.fn()} onLongPress={jest.fn()} />, {
    wrapper: ThemeWrapper,
  });
  expect(screen.getByTestId('board-edge')).toHaveStyle({ backgroundColor: '#0082c9' });
});

it('falls back to a neutral edge when the board has no colour', () => {
  render(
    <BoardRow
      summary={summary({ color: null }) as never}
      onPress={jest.fn()}
      onLongPress={jest.fn()}
    />,
    { wrapper: ThemeWrapper },
  );
  expect(screen.getByTestId('board-edge')).toBeTruthy();
});

// POST /boards does not echo a lastModified back, so a board created here
// carries 0 until the next board-list pass fetches it. Formatting that gave
// "Updated 57 years ago" — the unix epoch — on a board nobody had touched.
it('omits the update time on a board that has never synced', () => {
  render(
    <BoardRow summary={summary({ lastModified: 0 }) as never} onPress={jest.fn()} onLongPress={jest.fn()} />,
    { wrapper: ThemeWrapper },
  );
  expect(screen.queryByTestId('board-updated')).toBeNull();
});

it('shows the update time once the board has a server timestamp', () => {
  render(<BoardRow summary={summary() as never} onPress={jest.fn()} onLongPress={jest.fn()} />, {
    wrapper: ThemeWrapper,
  });
  expect(screen.getByTestId('board-updated')).toBeTruthy();
});
