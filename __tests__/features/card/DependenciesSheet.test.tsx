import { render, screen, fireEvent, act } from '@testing-library/react-native';

import { ThemeWrapper } from '../../helpers/theme';
import { DependenciesSheet } from '../../../src/features/card/components/DependenciesSheet';

// Sheet renders via useSafeAreaInsets(), which throws without a provider —
// same fix already used in LabelsSheet.test.tsx / AssigneesSheet.test.tsx.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (k: string) => k }),
}));

jest.mock('../../../src/database/hooks/useBoards', () => ({
  useAccountCards: jest.fn(() => [
    { id: 'c1', remoteId: '1', title: 'Self' },
    { id: 'c9', remoteId: '99', title: 'Nine' },
    { id: 'unsynced', remoteId: '', title: 'Draft' },
  ]),
}));

// CardPickerSheet is exercised on its own (CardPickerSheet.test.tsx); here it is
// replaced with a stub that captures `onPick` so a test can simulate a pick
// without driving the real board → stack → card drill-down.
let capturedOnPick: ((result: any) => void) | null = null;
jest.mock('../../../src/features/card/components/CardPickerSheet', () => ({
  CardPickerSheet: (props: any) => {
    capturedOnPick = props.onPick;
    return null;
  },
}));

function pickCard(result: { boardLocalId: string; stackLocalId: string; cardLocalId?: string }) {
  // The stub above isn't a fireEvent dispatch, so the resulting state update
  // (the "needs sync" notice) must be wrapped explicitly, same as RTL's own
  // event helpers do internally.
  act(() => capturedOnPick?.(result));
}

const handlers = () => ({ onClose: jest.fn(), onAdd: jest.fn(), onRemove: jest.fn() });

const renderSheet = (p: any = {}) =>
  render(
    <DependenciesSheet visible accountId="a1" cardId="c1" dependencies={[]} {...handlers()} {...p} />,
    { wrapper: ThemeWrapper },
  );

beforeEach(() => {
  capturedOnPick = null;
});

it('lists the current dependencies by title', () => {
  renderSheet({
    dependencies: [
      { remoteId: '7', title: 'Blocked by design' },
      { remoteId: '42', title: 'Waiting on legal' },
    ],
  });
  expect(screen.getByText('Blocked by design')).toBeTruthy();
  expect(screen.getByText('Waiting on legal')).toBeTruthy();
});

it('says there are none rather than rendering an empty list', () => {
  renderSheet();
  expect(screen.getByText('card.noDependencies')).toBeTruthy();
});

it('adds the picked card by its remote id', () => {
  const onAdd = jest.fn();
  renderSheet({ onAdd });
  fireEvent.press(screen.getByText('card.addDependency'));
  pickCard({ boardLocalId: 'b1', stackLocalId: 's1', cardLocalId: 'c9' });
  expect(onAdd).toHaveBeenCalledWith('99'); // c9's remoteId
});

// Picking an unsynced card would enqueue an intent that can never succeed.
it('refuses a card that has no remote id yet, with an explanation', () => {
  const onAdd = jest.fn();
  renderSheet({ onAdd });
  fireEvent.press(screen.getByText('card.addDependency'));
  pickCard({ boardLocalId: 'b1', stackLocalId: 's1', cardLocalId: 'unsynced' });

  expect(onAdd).not.toHaveBeenCalled();
  expect(screen.getByText('card.dependencyNeedsSync')).toBeTruthy();
});

it('refuses to depend on itself', () => {
  const onAdd = jest.fn();
  renderSheet({ cardId: 'c1', onAdd });
  fireEvent.press(screen.getByText('card.addDependency'));
  pickCard({ boardLocalId: 'b1', stackLocalId: 's1', cardLocalId: 'c1' });
  expect(onAdd).not.toHaveBeenCalled();
});

it('removes a dependency by its remote id', () => {
  const onRemove = jest.fn();
  renderSheet({ dependencies: [{ remoteId: '7', title: 'Blocked by design' }], onRemove });
  fireEvent.press(screen.getByTestId('dependency-remove-7'));
  expect(onRemove).toHaveBeenCalledWith('7');
});
