import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ThemeWrapper } from '../../helpers/theme';
import { QuickAddCardFlow } from '../../../src/features/card/components/QuickAddCardFlow';

// The real QuickCardFormSheet renders a Sheet, which reads useSafeAreaInsets() —
// same fix already used in DependenciesSheet.test.tsx.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (k: string) => k }),
}));

jest.mock('../../../src/database/hooks/useBoards', () => ({
  useBoards: jest.fn(() => [{ id: 'b1', title: 'Finance' }]),
}));
jest.mock('../../../src/database/hooks/useBoardContent', () => ({
  useBoardStacks: jest.fn(() => [{ id: 's1', title: 'En cours', boardId: 'b1' }]),
}));

const mockCreate = jest.fn(async () => undefined);
jest.mock('../../../src/features/board/hooks/useCardActions', () => ({
  useCardActions: jest.fn(() => ({ create: mockCreate })),
}));

// CardPickerSheet is exercised on its own (CardPickerSheet.test.tsx); here it is
// replaced with a stub that captures `onPick`/`onClose`, same idiom as
// DependenciesSheet.test.tsx — a test can simulate a pick without driving the
// real board → stack drill-down. The real CardPickerSheet fully self-closes on
// every successful pick (its own `pick()` calls `onPick` then `onClose`, not
// just a cancel) — the stub mirrors that sequencing so a flow that mishandles
// it (e.g. treating the post-pick onClose as a cancel) fails here too.
let capturedOnPick: ((result: any) => void) | null = null;
let capturedOnClose: (() => void) | null = null;
jest.mock('../../../src/features/card/components/CardPickerSheet', () => ({
  CardPickerSheet: (props: any) => {
    capturedOnPick = props.onPick;
    capturedOnClose = props.onClose;
    return null;
  },
}));

function pickCard(result: { boardLocalId: string; stackLocalId: string }) {
  act(() => {
    capturedOnPick?.(result);
    capturedOnClose?.();
  });
}

const renderFlow = (p: Partial<any> = {}) =>
  render(<QuickAddCardFlow visible accountId="a1" onClose={jest.fn()} {...(p as any)} />, {
    wrapper: ThemeWrapper,
  });

beforeEach(() => {
  capturedOnPick = null;
  capturedOnClose = null;
  mockCreate.mockClear();
});

it('starts on the picker and moves to the form after a pick', () => {
  renderFlow();
  expect(screen.queryByTestId('quick-title')).toBeNull();

  pickCard({ boardLocalId: 'b1', stackLocalId: 's1' });

  expect(screen.getByTestId('quick-title')).toBeTruthy();
});

it('creates the card in the picked list with the typed title', () => {
  const onClose = jest.fn();
  renderFlow({ onClose });
  pickCard({ boardLocalId: 'b1', stackLocalId: 's1' });

  fireEvent.changeText(screen.getByTestId('quick-title'), 'Loyer');
  fireEvent.press(screen.getByText('today.form.save'));

  expect(mockCreate).toHaveBeenCalledWith({
    boardLocalId: 'b1', stackLocalId: 's1', title: 'Loyer', duedate: null,
  });
  expect(onClose).toHaveBeenCalled();
});

it('closes the whole flow when the picker is cancelled without a pick', () => {
  const onClose = jest.fn();
  renderFlow({ onClose });

  act(() => capturedOnClose?.());

  expect(onClose).toHaveBeenCalled();
});

it('resets to the picker when closed from the form', async () => {
  renderFlow();
  pickCard({ boardLocalId: 'b1', stackLocalId: 's1' });
  expect(screen.getByTestId('quick-title')).toBeTruthy();

  fireEvent.press(screen.getByLabelText('common.close'));

  await waitFor(() => expect(screen.queryByTestId('quick-title')).toBeNull());
});
