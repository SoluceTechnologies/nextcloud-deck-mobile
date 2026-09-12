import { render, screen, fireEvent } from '@testing-library/react-native';

import { ThemeWrapper } from '../../helpers/theme';
import { AssigneesSheet } from '../../../src/features/card/components/AssigneesSheet';
import type { Account } from '../../../src/types';

// Sheet renders via useSafeAreaInsets(), which throws without a provider —
// same fix already used in LabelsSheet.test.tsx.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (k: string) => k }),
}));
// No fetch should ever run from this sheet — the search is local (spec §7.5.5).
jest.mock('../../../src/features/account/hooks/useAvatar', () => ({
  useAvatar: jest.fn(() => ({ data: null })),
}));

const account: Account = {
  id: 'acc-1',
  displayName: 'Jane',
  baseUrl: 'https://cloud.example.com',
  username: 'jane',
  appPassword: 'secret',
  davUserId: 'jane',
};

const alice = { participant: 'alice', displayName: 'Alice Martin', assigneeType: 0 };
const devs = { participant: 'devs', displayName: 'Devs', assigneeType: 1 };
const participants: any[] = [alice, devs];

const handlers = () => ({ onClose: jest.fn(), onToggle: jest.fn() });

const renderSheet = (p: any = {}) =>
  render(
    <AssigneesSheet
      visible
      account={account}
      participants={participants}
      selected={[]}
      {...handlers()}
      {...p}
    />,
    { wrapper: ThemeWrapper },
  );

it('shows the hint below two characters', () => {
  renderSheet();
  fireEvent.changeText(screen.getByTestId('assignee-search'), 'a');
  expect(screen.getByText('card.typeTwo')).toBeTruthy();
  expect(screen.queryByText('Alice Martin')).toBeNull();
});

it('shows matching results at two characters', () => {
  renderSheet();
  fireEvent.changeText(screen.getByTestId('assignee-search'), 'al');
  expect(screen.getByText('Alice Martin')).toBeTruthy();
  expect(screen.queryByText('card.typeTwo')).toBeNull();
});

// useAvatar is mocked to `{ data: null }`, so the row's Avatar renders its
// initials fallback — proof the row carries an Avatar, without a real fetch.
it('shows an avatar on a result row', () => {
  renderSheet();
  fireEvent.changeText(screen.getByTestId('assignee-search'), 'al');
  expect(screen.getByText('AM')).toBeTruthy();
});

it('reports a toggle to true for an unassigned result', () => {
  const onToggle = jest.fn();
  renderSheet({ onToggle });
  fireEvent.changeText(screen.getByTestId('assignee-search'), 'al');
  fireEvent.press(screen.getByTestId('assignee-row-alice-0'));
  expect(onToggle).toHaveBeenCalledWith(alice, true);
});

it('shows an already-assigned participant as checked and toggles it off', () => {
  const onToggle = jest.fn();
  renderSheet({ selected: [alice], onToggle });

  expect(screen.getByTestId('assignee-row-alice-0')).toHaveAccessibilityState({ checked: true });
  fireEvent.press(screen.getByTestId('assignee-row-alice-0'));
  expect(onToggle).toHaveBeenCalledWith(alice, false);
});

// Current assignees show even before any search — they are not a search result.
it('always shows the current assignees, regardless of the query', () => {
  renderSheet({ selected: [alice] });
  expect(screen.getByText('Alice Martin')).toBeTruthy();
});

// Assigning several people in a row is the common case.
it('does not close on a toggle', () => {
  const onClose = jest.fn();
  renderSheet({ selected: [alice], onClose });
  fireEvent.press(screen.getByTestId('assignee-row-alice-0'));
  expect(onClose).not.toHaveBeenCalled();
});

it('excludes an already-assigned participant from the search results', () => {
  renderSheet({ selected: [alice] });
  fireEvent.changeText(screen.getByTestId('assignee-search'), 'al');
  // Only the always-shown checked row for alice — not a second, unchecked one.
  expect(screen.getAllByText('Alice Martin')).toHaveLength(1);
});

// A large board must not mount hundreds of rows (and hundreds of avatar
// fetches) off one common substring — cap search results, independent of how
// many participants match.
it('caps search results at 25 rows', () => {
  const many: any[] = Array.from({ length: 30 }, (_, i) => ({
    participant: `user${i}`,
    displayName: `Match Person ${i}`,
    assigneeType: 0,
  }));
  renderSheet({ participants: many });
  fireEvent.changeText(screen.getByTestId('assignee-search'), 'match');
  expect(screen.getAllByText(/Match Person/)).toHaveLength(25);
});

// A user and a group can share the same id (participants.test.ts covers this
// at the data layer); the row testID must not collide between them.
it('gives a user and a group that share an id distinct row testIDs', () => {
  const aliceUser = { participant: 'alice', displayName: 'Alice Martin', assigneeType: 0 };
  const aliceGroup = { participant: 'alice', displayName: 'Alice Group', assigneeType: 1 };
  renderSheet({ participants: [aliceUser, aliceGroup], selected: [aliceUser] });
  fireEvent.changeText(screen.getByTestId('assignee-search'), 'alice');
  expect(screen.getByTestId('assignee-row-alice-0')).toHaveAccessibilityState({ checked: true });
  expect(screen.getByTestId('assignee-row-alice-1')).toHaveAccessibilityState({ checked: false });
});
