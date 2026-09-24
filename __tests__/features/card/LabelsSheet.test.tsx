import { render, screen, fireEvent } from '@testing-library/react-native';

import { ThemeWrapper } from '../../helpers/theme';
import { LabelsSheet } from '../../../src/features/card/components/LabelsSheet';
import { DECK_PALETTE } from '../../../src/features/board/palette';

// Sheet renders via useSafeAreaInsets(), which throws without a provider —
// same fix already used in ColorSheet.test.tsx / CardMenu.test.tsx.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (k: string) => k }),
}));

const labels: any[] = [
  { id: 'l1', title: 'FACTURATION', color: '#ff0000' },
  { id: 'l2', title: 'URGENT', color: null },
];

const handlers = () => ({ onClose: jest.fn(), onToggle: jest.fn(), onCreate: jest.fn() });

const renderSheet = (p: any = {}) =>
  render(<LabelsSheet visible boardLabels={labels} selected={[]} {...handlers()} {...p} />, {
    wrapper: ThemeWrapper,
  });

it('lists every label of the board with its colour', () => {
  renderSheet();
  expect(screen.getByText('FACTURATION')).toBeTruthy();
  expect(screen.getByTestId('label-swatch-l1')).toHaveStyle({ backgroundColor: '#ff0000' });
});

it('ticks the labels already on the card', () => {
  renderSheet({ selected: ['l1'] });
  expect(screen.getByTestId('label-row-l1')).toHaveAccessibilityState({ checked: true });
  expect(screen.getByTestId('label-row-l2')).toHaveAccessibilityState({ checked: false });
});

it('reports a toggle with the label id and its new state', () => {
  const onToggle = jest.fn();
  renderSheet({ selected: ['l1'], onToggle });

  fireEvent.press(screen.getByTestId('label-row-l2'));
  expect(onToggle).toHaveBeenCalledWith('l2', true);

  fireEvent.press(screen.getByTestId('label-row-l1'));
  expect(onToggle).toHaveBeenCalledWith('l1', false);
});

// The sheet stays open: assigning several labels in a row is the common case.
it('does not close on a toggle', () => {
  const onClose = jest.fn();
  renderSheet({ onClose });
  fireEvent.press(screen.getByTestId('label-row-l1'));
  expect(onClose).not.toHaveBeenCalled();
});

it('creates a label with a trimmed title and the chosen colour', () => {
  const onCreate = jest.fn();
  renderSheet({ onCreate });

  fireEvent.press(screen.getByText('card.newLabel'));
  fireEvent.changeText(screen.getByTestId('new-label-title'), '  URGENT  ');
  fireEvent.press(screen.getByTestId(`color-swatch-${DECK_PALETTE[0]}`));
  fireEvent.press(screen.getByText('card.create'));

  expect(onCreate).toHaveBeenCalledWith({ title: 'URGENT', color: DECK_PALETTE[0] });
});

it('does not create a label with an empty title', () => {
  const onCreate = jest.fn();
  renderSheet({ onCreate });
  fireEvent.press(screen.getByText('card.newLabel'));
  fireEvent.changeText(screen.getByTestId('new-label-title'), '   ');
  fireEvent.press(screen.getByText('card.create'));
  expect(onCreate).not.toHaveBeenCalled();
});
