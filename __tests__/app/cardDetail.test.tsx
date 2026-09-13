import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { ThemeWrapper } from '../helpers/theme';
import { useAccountStore } from '../../src/stores/accountStore';
import { DECK_PALETTE } from '../../src/features/board/palette';
import CardDetailScreen from '../../app/card/[id]';

// The library's jest mock drops onTaskListItemPress (see DescriptionView.test.tsx
// for why); wrapped here the same way so a checkbox tap in the rendered
// description can be exercised end to end through the screen's patch() call.
let mockOnTaskListItemPress: ((e: { index: number; checked: boolean; text: string }) => void) | null = null;

jest.mock('react-native-enriched-markdown', () => {
  const actual = require('react-native-enriched-markdown/jest');
  return {
    ...actual,
    EnrichedMarkdownText: (props: any) => {
      mockOnTaskListItemPress = props.onTaskListItemPress ?? null;
      const ActualText = actual.EnrichedMarkdownText;
      return <ActualText {...props} />;
    },
  };
});

function fireTaskPress(e: { index: number; checked: boolean; text: string }) {
  act(() => {
    mockOnTaskListItemPress?.(e);
  });
}

jest.mock('../../src/database/hooks/useCard', () => ({
  useCard: jest.fn(),
}));

jest.mock('../../src/database/hooks/useBoards', () => ({
  // remoteId feeds the attachment download URL (boards/<remoteId>/stacks/...).
  useBoards: jest.fn(() => [{ id: 'b1', title: 'Finance & Juridique', remoteId: 'B1' }]),
  // The card menu's move picker (CardPickerSheet) reads from this same module.
  useBoardCards: jest.fn(() => []),
  // The Dependencies row resolves each remote id in card.dependentCardsJson
  // against this list — kept empty by default, overridden per test.
  useAccountCards: jest.fn(() => []),
}));

jest.mock('../../src/database/hooks/useBoardContent', () => ({
  useBoardStacks: jest.fn(() => [{ id: 's1', title: 'En cours', remoteId: 'S1' }]),
}));

jest.mock('../../src/database/hooks/useCardRelations', () => ({
  useBoardLabels: jest.fn(() => []),
  useCardLabels: jest.fn(() => []),
  useCardAssignees: jest.fn(() => []),
}));

jest.mock('../../src/database/hooks/useCardDetail', () => ({
  useCardComments: jest.fn(() => []),
  useCardAttachments: jest.fn(() => []),
}));

jest.mock('../../src/features/card/hooks/useCardDetailSync', () => ({
  useCardDetailSync: jest.fn(() => ({ hasMore: false, loadMore: jest.fn(), loading: false })),
}));

// The Assignees sheet needs an account to fetch avatars for; the screen tests
// below only assert the row's subtitle, so a bare null (no fetch) is enough.
jest.mock('../../src/hooks/useAccounts', () => ({
  useActiveAccount: jest.fn(() => null),
}));

const mockCardActions = {
  create: jest.fn(() => Promise.resolve()),
  setDone: jest.fn(() => Promise.resolve()),
  patch: jest.fn(() => Promise.resolve()),
  setArchived: jest.fn(() => Promise.resolve()),
  remove: jest.fn(() => Promise.resolve()),
  move: jest.fn(() => Promise.resolve()),
  clone: jest.fn(() => Promise.resolve()),
  addLabel: jest.fn(() => Promise.resolve()),
  removeLabel: jest.fn(() => Promise.resolve()),
  createLabel: jest.fn(() => Promise.resolve('new-label-id')),
  assignUser: jest.fn(() => Promise.resolve()),
  unassignUser: jest.fn(() => Promise.resolve()),
  addDependency: jest.fn(() => Promise.resolve()),
  removeDependency: jest.fn(() => Promise.resolve()),
  addComment: jest.fn(() => Promise.resolve()),
};
jest.mock('../../src/features/board/hooks/useCardActions', () => ({
  useCardActions: () => mockCardActions,
}));

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (k: string, o?: any) => (o?.count != null ? `${k}:${o.count}` : k) }),
}));

// SafeAreaView reads insets from context — same fix already used across the
// board feature's tests.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

// `router` and `useRouter()` must resolve to the SAME spy object (this file
// asserts via `require('expo-router').router.back`, the screen calls through
// `useRouter()`). Built entirely inside the factory, not from an outer
// `const` — see boardView.test.tsx for why that reference would be baked in
// too early.
jest.mock('expo-router', () => {
  const router = { push: jest.fn(), back: jest.fn(), replace: jest.fn() };
  return {
    ...jest.requireActual('expo-router'),
    router,
    useRouter: () => router,
    useLocalSearchParams: () => ({ id: 'c1' }),
  };
});

function mockCard(over: any = {}) {
  const { useCard } = require('../../src/database/hooks/useCard');
  (useCard as jest.Mock).mockReturnValue({
    id: 'c1',
    boardId: 'b1',
    stackId: 's1',
    title: 'Payer le loyer',
    remoteId: '7',
    doneAt: null,
    duedate: null,
    startdate: null,
    color: null,
    description: '',
    archived: false,
    ...over,
  });
}

function requireCardActionsMock() {
  return mockCardActions;
}

// Calendar days back from right now, so this stays 7 days overdue in
// dueStateOf's local-day arithmetic regardless of DST (see CardTile.test.tsx).
function daysAgo(n: number): number {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.getTime();
}

const renderScreen = () => render(<CardDetailScreen />, { wrapper: ThemeWrapper });

beforeEach(() => {
  jest.clearAllMocks();
  mockCard();
  // clearAllMocks() does not undo a mockReturnValue set by a previous test —
  // only mockCard() above gets that per-test reseeding for free (it replaces
  // the implementation wholesale). Reseed this one explicitly so a test that
  // overrides it can't leak into the next.
  const { useCardLabels, useCardAssignees } = require('../../src/database/hooks/useCardRelations');
  (useCardLabels as jest.Mock).mockReturnValue([]);
  (useCardAssignees as jest.Mock).mockReturnValue([]);
  const { useAccountCards } = require('../../src/database/hooks/useBoards');
  (useAccountCards as jest.Mock).mockReturnValue([]);
  const { useCardComments, useCardAttachments } = require('../../src/database/hooks/useCardDetail');
  (useCardComments as jest.Mock).mockReturnValue([]);
  (useCardAttachments as jest.Mock).mockReturnValue([]);
  const { useActiveAccount } = require('../../src/hooks/useAccounts');
  (useActiveAccount as jest.Mock).mockReturnValue(null);
  act(() => useAccountStore.getState().setActiveAccountId('a1'));
});

it('shows the card title in the header and in the identity block', () => {
  renderScreen();
  // getAllByText does not match a TextInput's value, so the header title and
  // the identity TextField's value are asserted separately instead of via a
  // single getAllByText(...).toHaveLength(2).
  expect(screen.getByText('Payer le loyer')).toBeTruthy();
  expect(screen.getByDisplayValue('Payer le loyer')).toBeTruthy();
});

it('shows the board and list as the identity subtitle', () => {
  renderScreen();
  expect(screen.getByText('Finance & Juridique · En cours')).toBeTruthy();
});

// useCard returns null when sync reconciles a server-side delete while the
// card is open. Showing a stale card would let the user edit a ghost.
it('says the card is gone rather than rendering a stale one', () => {
  const { useCard } = require('../../src/database/hooks/useCard');
  (useCard as jest.Mock).mockReturnValue(null);
  renderScreen();

  expect(screen.getByText('card.deleted')).toBeTruthy();
  expect(screen.queryByText('card.markDone')).toBeNull();
});

it('closes on the × control', () => {
  const { router } = require('expo-router');
  renderScreen();
  fireEvent.press(screen.getByTestId('card-close'));
  expect(router.back).toHaveBeenCalled();
});

it('commits a title edit through the card actions, trimmed', () => {
  const { patch } = requireCardActionsMock();
  renderScreen();

  fireEvent.changeText(screen.getByTestId('card-title-input'), '  Renamed  ');
  fireEvent(screen.getByTestId('card-title-input'), 'blur');

  expect(patch).toHaveBeenCalledWith(expect.anything(), { title: 'Renamed' });
});

// An accidental clear would wipe the title on blur.
it('does not commit an empty title', () => {
  const { patch } = requireCardActionsMock();
  renderScreen();

  fireEvent.changeText(screen.getByTestId('card-title-input'), '   ');
  fireEvent(screen.getByTestId('card-title-input'), 'blur');

  expect(patch).not.toHaveBeenCalled();
});

it('does not commit when the title is unchanged', () => {
  const { patch } = requireCardActionsMock();
  renderScreen();
  fireEvent(screen.getByTestId('card-title-input'), 'blur');
  expect(patch).not.toHaveBeenCalled();
});

// A remote rename landing while the field is focused must not be reverted by
// an untouched blur: the reseed effect skips while focused, so `value` still
// holds the pre-rename title, and only a real edit may commit.
it('does not revert a remote rename on an untouched blur after a focused pull', () => {
  const { patch } = requireCardActionsMock();
  mockCard({ title: 'Old' });
  const { rerender } = renderScreen();

  fireEvent(screen.getByTestId('card-title-input'), 'focus');

  mockCard({ title: 'New' });
  rerender(<CardDetailScreen />);

  fireEvent(screen.getByTestId('card-title-input'), 'blur');

  expect(patch).not.toHaveBeenCalled();
});

it('toggles done through the card actions', () => {
  const { setDone } = requireCardActionsMock();
  renderScreen();
  fireEvent.press(screen.getByText('card.markDone'));
  expect(setDone).toHaveBeenCalledWith(expect.anything(), true);
});

it('offers to un-mark a card that is already done', () => {
  mockCard({ doneAt: 1757000000000 });
  renderScreen();
  expect(screen.getByText('card.markNotDone')).toBeTruthy();
});

it('shows the overdue line for a late card', () => {
  mockCard({ duedate: daysAgo(7), doneAt: null });
  renderScreen();
  expect(screen.getByText(/card.overdue/)).toBeTruthy();
});

it('shows no overdue line once the card is done', () => {
  mockCard({ duedate: daysAgo(7), doneAt: Date.now() });
  renderScreen();
  expect(screen.queryByText(/card.overdue/)).toBeNull();
});

it('opens the colour sheet from the colour row', () => {
  renderScreen();
  fireEvent.press(screen.getByText('card.color'));
  expect(screen.getByText('card.clearColor')).toBeTruthy();
});

it('commits a chosen swatch through the card actions', () => {
  const { patch } = requireCardActionsMock();
  renderScreen();
  fireEvent.press(screen.getByText('card.color'));
  fireEvent.press(screen.getByTestId(`color-swatch-${DECK_PALETTE[0]}`));
  expect(patch).toHaveBeenCalledWith(expect.anything(), { color: DECK_PALETTE[0] });
});

it('lists the card labels as the labels row subtitle', () => {
  const { useCardLabels } = require('../../src/database/hooks/useCardRelations');
  (useCardLabels as jest.Mock).mockReturnValue([
    { id: 'l1', title: 'FACTURATION' },
    { id: 'l2', title: 'URGENT' },
  ]);
  renderScreen();
  expect(screen.getByText('FACTURATION, URGENT')).toBeTruthy();
});

it('shows the empty label when the card has no labels', () => {
  renderScreen();
  expect(screen.getByText('card.noLabels')).toBeTruthy();
});

it('lists the card assignees as the assignees row subtitle', () => {
  const { useCardAssignees } = require('../../src/database/hooks/useCardRelations');
  (useCardAssignees as jest.Mock).mockReturnValue([
    { participant: 'alice', displayName: 'Alice', assigneeType: 0 },
    { participant: 'devs', displayName: 'Devs', assigneeType: 1 },
  ]);
  renderScreen();
  expect(screen.getByText('Alice, Devs')).toBeTruthy();
});

it('shows the empty assignees label when the card has no assignees', () => {
  renderScreen();
  expect(screen.getByText('card.noAssignees')).toBeTruthy();
});

it('opens the card menu from the … button', () => {
  renderScreen();
  fireEvent.press(screen.getByTestId('card-menu'));
  expect(screen.getByText('card.menu.move')).toBeTruthy();
});

it('archives the card and leaves the screen, rather than stranding the user on a card that just left the board', () => {
  const { setArchived } = requireCardActionsMock();
  const { router } = require('expo-router');
  renderScreen();

  fireEvent.press(screen.getByTestId('card-menu'));
  fireEvent.press(screen.getByText('card.menu.archive'));

  expect(setArchived).toHaveBeenCalledWith(expect.anything(), true);
  expect(router.back).toHaveBeenCalled();
});

// Resolves each remote id in dependentCardsJson against useAccountCards; a
// remote id with no cached card (not yet pulled by sync) falls back to #<id>.
it('lists the resolved dependency titles as the dependencies row subtitle', () => {
  mockCard({ dependentCardsJson: JSON.stringify(['9', '42']) });
  const { useAccountCards } = require('../../src/database/hooks/useBoards');
  (useAccountCards as jest.Mock).mockReturnValue([{ id: 'c9', remoteId: '9', title: 'Nine' }]);
  renderScreen();
  expect(screen.getByText('Nine, #42')).toBeTruthy();
});

it('shows the empty dependencies label when the card has no dependencies', () => {
  renderScreen();
  expect(screen.getByText('card.noDependencies')).toBeTruthy();
});

// Lot 10's flagship: a tapped checkbox in the rendered description is one
// optimistic patch() write, offline included.
it('commits a task toggle in the description through the card actions', () => {
  const { patch } = requireCardActionsMock();
  mockCard({ description: '- [ ] a' });
  renderScreen();

  fireTaskPress({ index: 0, checked: true, text: 'a' });

  expect(patch).toHaveBeenCalledWith(expect.anything(), { description: '- [x] a' });
});

it('opens the description editor from the edit affordance', () => {
  renderScreen();
  fireEvent.press(screen.getByTestId('description-edit'));
  expect(screen.getByTestId('editor-close')).toBeTruthy();
});

it('renders the comments section with the observed comments', () => {
  const { useCardComments } = require('../../src/database/hooks/useCardDetail');
  (useCardComments as jest.Mock).mockReturnValue([
    { id: 'k1', remoteId: 'r1', message: 'Hello there', actorId: 'alice', actorDisplayName: 'Alice', createdAt: 1000 },
  ]);
  renderScreen();
  expect(screen.getByText('Hello there')).toBeTruthy();
});

it('submits a new comment through the card actions', () => {
  const { addComment } = requireCardActionsMock();
  renderScreen();

  fireEvent.changeText(screen.getByTestId('comment-input'), 'hello');
  fireEvent.press(screen.getByTestId('comment-send'));

  expect(addComment).toHaveBeenCalledWith(expect.anything(), 'hello');
});

it('renders the attachments section with the observed attachments', () => {
  const { useCardAttachments } = require('../../src/database/hooks/useCardDetail');
  (useCardAttachments as jest.Mock).mockReturnValue([
    {
      id: 'f1',
      remoteId: '3',
      attachmentType: 'deck_file',
      fileName: 'contract.pdf',
      mime: 'application/pdf',
      size: 20480,
      createdAt: 1000,
      createdBy: 'alice',
    },
  ]);
  renderScreen();
  expect(screen.getByText('contract.pdf')).toBeTruthy();
});

// R50: opening a file goes through attachmentDownloadUrl (a pure URL builder,
// not a request) and Linking.openURL — never fetch/deckRequest from a screen.
it('opens an attachment through its authenticated download URL', () => {
  const { useCardAttachments } = require('../../src/database/hooks/useCardDetail');
  (useCardAttachments as jest.Mock).mockReturnValue([
    {
      id: 'f1',
      remoteId: '3',
      attachmentType: 'deck_file',
      fileName: 'contract.pdf',
      mime: 'application/pdf',
      size: 20480,
      createdAt: 1000,
      createdBy: 'alice',
    },
  ]);
  const { useActiveAccount } = require('../../src/hooks/useAccounts');
  (useActiveAccount as jest.Mock).mockReturnValue({
    baseUrl: 'https://cloud.example.com',
    username: 'alice',
    appPassword: 'secret',
  });
  const openURLSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

  renderScreen();
  fireEvent.press(screen.getByText('contract.pdf'));

  expect(openURLSpy).toHaveBeenCalledWith(expect.stringContaining('/attachments/deck_file/3'));

  openURLSpy.mockRestore();
});
