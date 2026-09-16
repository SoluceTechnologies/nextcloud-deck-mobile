import { render, screen, fireEvent } from '@testing-library/react-native';

import { ThemeWrapper } from '../../helpers/theme';
import { CardPickerSheet } from '../../../src/features/card/components/CardPickerSheet';

// Sheet renders via useSafeAreaInsets(), which throws without a provider —
// same fix already used in BoardActionsSheet.test.tsx.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (k: string) => k }),
}));

jest.mock('../../../src/database/hooks/useBoards', () => ({
  useBoards: jest.fn(() => [{ id: 'b1', title: 'Commercial' }]),
  useBoardCards: jest.fn(() => [{ id: 'c1', title: 'Alpha', stackId: 's1', remoteId: '7' }]),
}));
jest.mock('../../../src/database/hooks/useBoardContent', () => ({
  useBoardStacks: jest.fn(() => [{ id: 's1', title: 'En cours', boardId: 'b1' }]),
}));

it('starts on the board list', () => {
  render(
    <CardPickerSheet visible accountId="a1" mode="stack" onClose={jest.fn()} onPick={jest.fn()} />,
    { wrapper: ThemeWrapper },
  );
  expect(screen.getByText('Commercial')).toBeTruthy();
});

it('drills from a board into its lists', () => {
  render(
    <CardPickerSheet visible accountId="a1" mode="stack" onClose={jest.fn()} onPick={jest.fn()} />,
    { wrapper: ThemeWrapper },
  );
  fireEvent.press(screen.getByText('Commercial'));
  expect(screen.getByText('En cours')).toBeTruthy();
});

it('resolves at the list in stack mode', () => {
  const onPick = jest.fn();
  render(
    <CardPickerSheet visible accountId="a1" mode="stack" onClose={jest.fn()} onPick={onPick} />,
    { wrapper: ThemeWrapper },
  );
  fireEvent.press(screen.getByText('Commercial'));
  fireEvent.press(screen.getByText('En cours'));
  expect(onPick).toHaveBeenCalledWith({ boardLocalId: 'b1', stackLocalId: 's1' });
});

// QuickAddCardFlow relies on this exact ordering to tell a completed pick
// apart from a genuine cancel (see QuickAddCardFlow.tsx's `justPicked` ref) —
// pinned here so a future change to `pick()` that breaks it (e.g. only
// closing on a cancel) fails at the source, not in a consumer's mock.
it('calls onPick and then onClose synchronously on a successful pick', () => {
  const calls: string[] = [];
  const onPick = jest.fn(() => calls.push('onPick'));
  const onClose = jest.fn(() => calls.push('onClose'));
  render(
    <CardPickerSheet visible accountId="a1" mode="stack" onClose={onClose} onPick={onPick} />,
    { wrapper: ThemeWrapper },
  );
  fireEvent.press(screen.getByText('Commercial'));
  fireEvent.press(screen.getByText('En cours'));

  expect(calls).toEqual(['onPick', 'onClose']);
});

it('drills one level further in card mode', () => {
  const onPick = jest.fn();
  render(
    <CardPickerSheet visible accountId="a1" mode="card" onClose={jest.fn()} onPick={onPick} />,
    { wrapper: ThemeWrapper },
  );
  fireEvent.press(screen.getByText('Commercial'));
  fireEvent.press(screen.getByText('En cours'));
  expect(onPick).not.toHaveBeenCalled();

  fireEvent.press(screen.getByText('Alpha'));
  expect(onPick).toHaveBeenCalledWith({ boardLocalId: 'b1', stackLocalId: 's1', cardLocalId: 'c1' });
});

it('goes back up a level rather than closing', () => {
  const onClose = jest.fn();
  render(
    <CardPickerSheet visible accountId="a1" mode="stack" onClose={onClose} onPick={jest.fn()} />,
    { wrapper: ThemeWrapper },
  );
  fireEvent.press(screen.getByText('Commercial'));
  fireEvent.press(screen.getByTestId('picker-back'));

  expect(screen.getByText('Commercial')).toBeTruthy();
  expect(onClose).not.toHaveBeenCalled();
});
