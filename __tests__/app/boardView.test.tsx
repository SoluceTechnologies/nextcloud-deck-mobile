import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { ThemeWrapper } from '../helpers/theme';
import { useAccountStore } from '../../src/stores/accountStore';
import { boardContentKey, useUiStore } from '../../src/stores/uiStore';
import BoardScreen from '../../app/(tabs)/boards/[id]';

jest.mock('../../src/database/hooks/useBoards', () => ({
  useBoards: jest.fn(() => [
    { id: 'b1', remoteId: 'B1', title: 'Team', color: null, archived: false, shared: false, canEdit: true, canManage: true, lastModified: 0 },
  ]),
  useBoardCards: jest.fn(() => [
    { id: 'c1', stackId: 's1', title: 'Alpha', order: 0, color: null, archived: false, doneAt: null, duedate: null, startdate: null, attachmentCount: 0, commentsCount: 0, pending: false },
    { id: 'c2', stackId: 's2', title: 'Beta', order: 0, color: null, archived: false, doneAt: null, duedate: null, startdate: null, attachmentCount: 0, commentsCount: 0, pending: false },
  ]),
}));

jest.mock('../../src/database/hooks/useBoardContent', () => ({
  useBoardStacks: jest.fn(() => [
    { id: 's1', title: 'À faire', order: 0 },
    { id: 's2', title: 'En cours', order: 1 },
  ]),
}));

jest.mock('../../src/database/hooks/useBoardRelations', () => ({
  useBoardCardRelations: jest.fn(() => ({ labelsByCard: new Map(), assigneesByCard: new Map() })),
}));

const mockStackCreate = jest.fn(() => Promise.resolve());
const mockStackRename = jest.fn(() => Promise.resolve());
const mockStackMove = jest.fn(() => Promise.resolve());
const mockStackRemove = jest.fn(() => Promise.resolve());
jest.mock('../../src/features/board/hooks/useStackActions', () => ({
  useStackActions: () => ({
    create: mockStackCreate,
    rename: mockStackRename,
    move: mockStackMove,
    remove: mockStackRemove,
  }),
}));

const mockCardCreate = jest.fn(() => Promise.resolve());
const mockCardMove = jest.fn(() => Promise.resolve());
const mockCardSetDone = jest.fn(() => Promise.resolve());
const mockCardSetArchived = jest.fn(() => Promise.resolve());
jest.mock('../../src/features/board/hooks/useCardActions', () => ({
  useCardActions: () => ({
    create: mockCardCreate,
    setDone: mockCardSetDone,
    patch: jest.fn(() => Promise.resolve()),
    setArchived: mockCardSetArchived,
    remove: jest.fn(() => Promise.resolve()),
    move: mockCardMove,
    clone: jest.fn(() => Promise.resolve()),
  }),
}));

let capturedDragProps: {
  enabled: boolean;
  onDrop: (result: any) => void;
  onStackHover?: (stackId: string, index: number) => void;
  onStackDrop?: (stackId: string, index: number) => void;
} | null = null;
const mockDragContextValue = {
  activeId: { value: null },
  x: { value: 0 },
  y: { value: 0 },
  originX: { value: 0 },
  originY: { value: 0 },
  width: { value: 0 },
  startX: { value: 0 },
  startY: { value: 0 },
  target: { value: null },
  frame: {
    value: { stackIds: [], geometry: { gap: 0, columnWidth: 0, columnCount: 0 }, scrollX: 0, listTopY: 0, registry: {} },
    modify: jest.fn((updater?: (f: any) => any) => {
      if (updater && typeof (updater as any).__workletHash !== 'number') {
        throw new Error(
          '[Worklets] Tried to synchronously call a Remote Function. ' +
            'SharedValue.modify() requires a worklet modifier.',
        );
      }
      if (updater) mockDragContextValue.frame.value = updater(mockDragContextValue.frame.value);
    }),
  },
  activeData: null,
  setActiveData: jest.fn(),
  reportColumn: jest.fn(),
  reportListTop: jest.fn(),
  registerScroller: jest.fn(() => jest.fn()),
  scrollColumnBy: jest.fn(),
  onDrop: jest.fn(),
  enabled: true,
};
jest.mock('../../src/features/board/dnd/DragContext', () => ({
  DragProvider: (props: any) => {
    capturedDragProps = {
      enabled: props.enabled,
      onDrop: props.onDrop,
      onStackHover: props.onStackHover,
      onStackDrop: props.onStackDrop,
    };
    return props.children;
  },
  useDrag: () => mockDragContextValue,
  useOptionalDrag: () => mockDragContextValue,
  useDragActiveData: () => mockDragContextValue.activeData,
}));

jest.mock('../../src/sync/scheduler', () => ({ requestBoardSnapshot: jest.fn() }));

jest.mock('../../src/services/shared/network', () => ({ useIsOnline: jest.fn(() => true) }));

jest.mock('../../src/features/today/recentBoards', () => ({ recordRecentBoard: jest.fn(async () => {}) }));

jest.mock('../../src/utils/haptics', () => ({ haptic: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (k: string) => k }),
}));

jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

jest.mock('expo-router', () => {
  const router = { push: jest.fn(), back: jest.fn(), replace: jest.fn() };
  return {
    ...jest.requireActual('expo-router'),
    router,
    useRouter: () => router,
    useLocalSearchParams: () => ({ id: 'b1' }),
    useFocusEffect: () => {},
  };
});

const renderScreen = () => render(<BoardScreen />, { wrapper: ThemeWrapper });

beforeEach(() => {
  jest.clearAllMocks();
  capturedDragProps = null;
  const { useBoards } = require('../../src/database/hooks/useBoards');
  (useBoards as jest.Mock).mockReturnValue([
    { id: 'b1', remoteId: 'B1', title: 'Team', color: null, archived: false, shared: false, canEdit: true, canManage: true, lastModified: 0 },
  ]);
  const { useBoardStacks } = require('../../src/database/hooks/useBoardContent');
  (useBoardStacks as jest.Mock).mockReturnValue([
    { id: 's1', title: 'À faire', order: 0 },
    { id: 's2', title: 'En cours', order: 1 },
  ]);
  act(() => useAccountStore.getState().setActiveAccountId('a1'));
  const { useIsOnline } = require('../../src/services/shared/network');
  (useIsOnline as jest.Mock).mockReturnValue(true);
  act(() => useUiStore.setState({ boardContentFetchedAt: {} }));
});

it('shows one column per stack, in order', () => {
  renderScreen();
  const columns = screen.getAllByTestId('stack-column');
  expect(columns).toHaveLength(2);
  expect(screen.getByText('À faire')).toBeTruthy();
  expect(screen.getByText('En cours')).toBeTruthy();
});

it('puts each card in its own stack', () => {
  renderScreen();
  expect(screen.getByText('Alpha')).toBeTruthy();
  expect(screen.getByText('Beta')).toBeTruthy();
});

it('renders cached content immediately, with no loading state', () => {
  renderScreen();
  expect(screen.queryByTestId('board-spinner')).toBeNull();
  expect(screen.getByText('Alpha')).toBeTruthy();
});

it('requests a full snapshot for this board on open', () => {
  const { requestBoardSnapshot } = require('../../src/sync/scheduler');
  renderScreen();
  expect(requestBoardSnapshot).toHaveBeenCalledWith('a1', 'B1');
});

it('records the board as recently opened on mount', () => {
  const { recordRecentBoard } = require('../../src/features/today/recentBoards');
  renderScreen();
  expect(recordRecentBoard).toHaveBeenCalledWith(expect.anything(), 'a1', 'b1');
});

it('still records an offline-created board (no remote id yet), but does not request its snapshot', () => {
  const { useBoards } = require('../../src/database/hooks/useBoards');
  (useBoards as jest.Mock).mockReturnValue([
    { id: 'b1', remoteId: '', title: 'Team', color: null, archived: false, shared: false, canEdit: true, canManage: true, lastModified: 0 },
  ]);
  const { recordRecentBoard } = require('../../src/features/today/recentBoards');
  const { requestBoardSnapshot } = require('../../src/sync/scheduler');

  renderScreen();

  expect(recordRecentBoard).toHaveBeenCalledWith(expect.anything(), 'a1', 'b1');
  expect(requestBoardSnapshot).not.toHaveBeenCalled();
});

it('opens a card when its tile is tapped', () => {
  const { router } = require('expo-router');
  renderScreen();
  fireEvent.press(screen.getByText('Alpha'));
  expect(router.push).toHaveBeenCalledWith('/card/c1');
});

it('offers an add-list affordance after the last column', () => {
  renderScreen();
  expect(screen.getByText('board.addList')).toBeTruthy();
});

it('enables dragging only when the board can be edited', () => {
  renderScreen();
  expect(capturedDragProps?.enabled).toBe(true);
});

it('disables dragging when the board cannot be edited', () => {
  const { useBoards } = require('../../src/database/hooks/useBoards');
  (useBoards as jest.Mock).mockReturnValue([
    { id: 'b1', remoteId: 'B1', title: 'Team', color: null, archived: false, shared: false, canEdit: false, canManage: true, lastModified: 0 },
  ]);
  renderScreen();
  expect(capturedDragProps?.enabled).toBe(false);
});

it('wires draggable to StackColumn when the board can be edited', () => {
  renderScreen();
  expect(getByGestureTestId('drag-c1')).toBeTruthy();
});

it('does not wire draggable to StackColumn when the board cannot be edited', () => {
  const { useBoards } = require('../../src/database/hooks/useBoards');
  (useBoards as jest.Mock).mockReturnValue([
    { id: 'b1', remoteId: 'B1', title: 'Team', color: null, archived: false, shared: false, canEdit: false, canManage: true, lastModified: 0 },
  ]);
  renderScreen();
  expect(() => getByGestureTestId('drag-c1')).toThrow();
});

it('commits a drop as one move with the computed orders', () => {
  renderScreen();
  act(() => capturedDragProps?.onDrop({ cardId: 'c1', fromStackId: 's1', toStackId: 's2', index: 0 }));
  expect(mockCardMove).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), 's2', 0, expect.any(Number));
});

it('ignores a drop that leaves the card where it was', () => {
  renderScreen();
  act(() => capturedDragProps?.onDrop({ cardId: 'c1', fromStackId: 's1', toStackId: 's1', index: 0 }));
  expect(mockCardMove).not.toHaveBeenCalled();
});

describe('the empty board', () => {
  const emptyBoard = () => {
    const { useBoardStacks } = require('../../src/database/hooks/useBoardContent');
    (useBoardStacks as jest.Mock).mockReturnValue([]);
  };

  it('waits on the first content fetch rather than claiming the board is empty', () => {
    emptyBoard();
    renderScreen();
    expect(screen.getByTestId('board-loading')).toBeTruthy();
  });

  it('stops waiting as soon as the fetch has been attempted', () => {
    emptyBoard();
    act(() =>
      useUiStore.setState({ boardContentFetchedAt: { [boardContentKey('a1', 'B1')]: 1 } }),
    );
    renderScreen();
    expect(screen.queryByTestId('board-loading')).toBeNull();
  });

  it('does not wait while offline', () => {
    emptyBoard();
    const { useIsOnline } = require('../../src/services/shared/network');
    (useIsOnline as jest.Mock).mockReturnValue(false);
    renderScreen();
    expect(screen.queryByTestId('board-loading')).toBeNull();
  });

  it('does not wait on a board that has never been pushed', () => {
    emptyBoard();
    const { useBoards } = require('../../src/database/hooks/useBoards');
    (useBoards as jest.Mock).mockReturnValue([
      { id: 'b1', remoteId: '', title: 'Team', color: null, archived: false, shared: false, canEdit: true, canManage: true, lastModified: 0 },
    ]);
    renderScreen();
    expect(screen.queryByTestId('board-loading')).toBeNull();
  });
});

it('creates a list from the add-list sheet', () => {
  renderScreen();
  fireEvent.press(screen.getByText('board.addList'));

  fireEvent.changeText(screen.getByPlaceholderText('board.listTitle'), '  Backlog  ');
  fireEvent.press(screen.getByText('board.form.save'));

  expect(mockStackCreate).toHaveBeenCalledWith('Backlog');
  expect(mockCardCreate).not.toHaveBeenCalled();
});

it('creates a card from the same sheet when it was opened from a column', () => {
  renderScreen();
  fireEvent.press(screen.getAllByText('board.addCard')[0]);

  fireEvent.changeText(screen.getByPlaceholderText('board.cardTitle'), 'Alpha 2');
  fireEvent.press(screen.getByText('board.form.save'));

  expect(mockCardCreate).toHaveBeenCalledWith({
    boardLocalId: 'b1',
    stackLocalId: 's1',
    title: 'Alpha 2',
  });
  expect(mockStackCreate).not.toHaveBeenCalled();
});

describe('list actions', () => {
  const cardRow = (id: string, stackId: string, doneAt: number | null) => ({
    id, stackId, title: id, order: 0, color: null, archived: false, doneAt, duedate: null, startdate: null,
    attachmentCount: 0, commentsCount: 0, pending: false,
  });

  beforeEach(() => {
    const { useBoardCards } = require('../../src/database/hooks/useBoards');
    (useBoardCards as jest.Mock).mockReturnValue([
      cardRow('open', 's1', null),
      cardRow('done', 's1', 1000),
      cardRow('other', 's2', null),
    ]);
  });

  afterAll(() => {
    const { useBoardCards } = require('../../src/database/hooks/useBoards');
    (useBoardCards as jest.Mock).mockReset();
  });

  const openMenu = (index = 0) => fireEvent.press(screen.getAllByLabelText('board.actions.menu')[index]);

  it('marks only the list\'s unfinished cards as done', async () => {
    renderScreen();
    openMenu();
    await act(async () => fireEvent.press(screen.getByText('board.actions.markAllDone')));
    expect(mockCardSetDone.mock.calls.map(([card]: any) => card.id)).toEqual(['open']);
  });

  it('archives every card of the list after confirmation', async () => {
    const { Alert } = require('react-native');
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    renderScreen();
    openMenu();
    fireEvent.press(screen.getByText('board.actions.archiveAll'));
    await act(async () => (alert.mock.calls[0][2] as any[]).find((b: any) => b.style === 'destructive').onPress());
    expect(mockCardSetArchived.mock.calls).toEqual([
      [expect.objectContaining({ id: 'open' }), true],
      [expect.objectContaining({ id: 'done' }), true],
    ]);
  });

  it('renames through the list form, prefilled with the current title', () => {
    renderScreen();
    openMenu(1);
    fireEvent.press(screen.getByText('board.actions.rename'));
    expect(screen.getByDisplayValue('En cours')).toBeTruthy();
    fireEvent.changeText(screen.getByDisplayValue('En cours'), 'Doing');
    fireEvent.press(screen.getByText('board.form.save'));
    expect(mockStackRename).toHaveBeenCalledWith(expect.objectContaining({ id: 's2' }), 'Doing');
  });

  const columnTitles = () => screen.getAllByText(/^(À faire|En cours)$/).map((n) => n.props.children);

  it('previews the new order live while a list is dragged across the others', () => {
    renderScreen();
    expect(columnTitles()).toEqual(['À faire', 'En cours']);
    act(() => capturedDragProps?.onStackHover?.('s1', 1));
    expect(columnTitles()).toEqual(['En cours', 'À faire']);
    expect(mockStackMove).not.toHaveBeenCalled();
  });

  it('holds the dropped order until the database catches up', () => {
    renderScreen();
    act(() => capturedDragProps?.onStackHover?.('s1', 1));
    act(() => capturedDragProps?.onStackDrop?.('s1', 1));
    expect(columnTitles()).toEqual(['En cours', 'À faire']);
  });

  it('moves a dropped list to the column it landed on', () => {
    renderScreen();
    act(() => capturedDragProps?.onStackDrop?.('s1', 1));
    expect(mockStackMove).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }), 1);
  });

  it('hides the list menu when the board cannot be edited', () => {
    const { useBoards } = require('../../src/database/hooks/useBoards');
    (useBoards as jest.Mock).mockReturnValue([
      { id: 'b1', remoteId: 'B1', title: 'Team', color: null, archived: false, shared: false, canEdit: false, canManage: false, lastModified: 0 },
    ]);
    renderScreen();
    expect(screen.queryByLabelText('board.actions.menu')).toBeNull();
  });
});
