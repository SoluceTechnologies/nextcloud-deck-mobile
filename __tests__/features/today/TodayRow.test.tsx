import { render, screen, fireEvent } from '@testing-library/react-native';

import { ThemeWrapper } from '../../helpers/theme';
import { TodayRow } from '../../../src/features/today/components/TodayRow';
import { formatRelative } from '../../../src/utils/relativeTime';
import { lightTheme } from '../../../src/theme';

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (k: string, o?: any) => (o?.count != null ? `${k}:${o.count}` : k) }),
}));

const DAY_MS = 24 * 60 * 60 * 1000;

const item = (over: Partial<any> = {}) => ({
  id: 'c1',
  title: 'Payer le loyer',
  duedate: Date.now() - 2 * DAY_MS,
  boardTitle: 'Finance & Juridique',
  stackTitle: 'En cours',
  assigneeName: null as string | null,
  ...over,
});

const renderRow = (itemOver: Partial<any> = {}) => {
  const onToggleDone = jest.fn();
  const onOpen = jest.fn();
  render(
    <TodayRow item={item(itemOver) as any} onToggleDone={onToggleDone} onOpen={onOpen} />,
    { wrapper: ThemeWrapper },
  );
  return { onToggleDone, onOpen };
};

it('shows the title, the board and list, and the relative due', () => {
  const due = Date.now() - 2 * DAY_MS;
  renderRow({ duedate: due });
  expect(screen.getByText('Payer le loyer')).toBeTruthy();
  expect(screen.getByText(formatRelative(due))).toBeTruthy();
  expect(screen.getByText(/Finance & Juridique › En cours/)).toBeTruthy();
});

it('reports a done toggle by id without opening the card', () => {
  const { onToggleDone, onOpen } = renderRow();
  const checkbox = screen.getByTestId('today-done-c1');
  expect(checkbox.props.accessibilityRole).toBe('checkbox');
  expect(checkbox).toHaveAccessibilityState({ checked: false });
  expect(checkbox.props.accessibilityLabel).toBe('today.markDone');

  fireEvent.press(checkbox);
  expect(onToggleDone).toHaveBeenCalledWith('c1');
  expect(onOpen).not.toHaveBeenCalled();
});

it('opens the card when the row body is pressed', () => {
  const { onOpen } = renderRow();
  fireEvent.press(screen.getByTestId('today-row-c1'));
  expect(onOpen).toHaveBeenCalledWith('c1');
});

it('paints the due in the danger colour when overdue, and not otherwise', () => {
  const { rerender } = render(
    <TodayRow
      item={item({ duedate: Date.now() - 7 * DAY_MS }) as any}
      onToggleDone={jest.fn()}
      onOpen={jest.fn()}
    />,
    { wrapper: ThemeWrapper },
  );
  expect(screen.getByTestId('today-due-c1')).toHaveStyle({ color: lightTheme.colors.danger });

  rerender(
    <TodayRow
      item={item({ duedate: Date.now() + 2 * DAY_MS }) as any}
      onToggleDone={jest.fn()}
      onOpen={jest.fn()}
    />,
  );
  expect(screen.getByTestId('today-due-c1')).not.toHaveStyle({ color: lightTheme.colors.danger });
});

it('shows an assignee avatar only when there is one', () => {
  const { rerender } = render(
    <TodayRow
      item={item({ assigneeName: 'Marie Curie' }) as any}
      onToggleDone={jest.fn()}
      onOpen={jest.fn()}
    />,
    { wrapper: ThemeWrapper },
  );
  expect(screen.getByText('MC')).toBeTruthy();

  rerender(
    <TodayRow item={item({ assigneeName: null }) as any} onToggleDone={jest.fn()} onOpen={jest.fn()} />,
  );
  expect(screen.queryByText('MC')).toBeNull();
});
