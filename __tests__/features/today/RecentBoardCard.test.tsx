import { render, screen, fireEvent } from '@testing-library/react-native';

import { ThemeWrapper } from '../../helpers/theme';
import { RecentBoardCard } from '../../../src/features/today/components/RecentBoardCard';

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (k: string, o?: any) => (o?.count != null ? `${k}:${o.count}` : k) }),
}));

const board = (over: Partial<any> = {}) => ({
  id: 'b1',
  title: 'Commercial',
  color: '#0082c9',
  shared: true,
  ...over,
});

it('paints the edge with the board colour and marks a shared board', () => {
  const { rerender } = render(<RecentBoardCard board={board() as any} onPress={jest.fn()} />, {
    wrapper: ThemeWrapper,
  });
  expect(screen.getByTestId('recent-edge-b1')).toHaveStyle({ backgroundColor: '#0082c9' });
  expect(screen.getByText('boards.shared')).toBeTruthy();

  rerender(<RecentBoardCard board={board({ shared: false }) as any} onPress={jest.fn()} />);
  expect(screen.queryByText('boards.shared')).toBeNull();
});

it('reports its id on press, as an accessible button labelled with the board title', () => {
  const onPress = jest.fn();
  render(<RecentBoardCard board={board() as any} onPress={onPress} />, { wrapper: ThemeWrapper });
  const card = screen.getByLabelText('Commercial');
  expect(card.props.accessibilityRole).toBe('button');

  fireEvent.press(card);
  expect(onPress).toHaveBeenCalledWith('b1');
});

it('shows progress, overdue count and last update only when stats are given', () => {
  const stats = { doneCount: 3, totalCount: 8, overdueCount: 2, lastModified: Date.now() - 60_000 };
  const { rerender } = render(<RecentBoardCard board={board() as any} onPress={jest.fn()} />, {
    wrapper: ThemeWrapper,
  });
  expect(screen.queryByTestId('recent-progress')).toBeNull();

  rerender(<RecentBoardCard board={board() as any} onPress={jest.fn()} stats={stats} />);
  expect(screen.getByTestId('recent-progress')).toHaveTextContent('today.recentProgress');
  expect(screen.getByText('today.overdueBanner:2')).toBeTruthy();
  expect(screen.getByText('boards.updated')).toBeTruthy();

  rerender(<RecentBoardCard board={board() as any} onPress={jest.fn()} stats={{ ...stats, overdueCount: 0 }} />);
  expect(screen.queryByTestId('recent-overdue')).toBeNull();
});
