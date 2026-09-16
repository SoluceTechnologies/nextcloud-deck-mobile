import { renderHook } from '@testing-library/react-native';

import { useAccountCardRelations, useAccountStacks } from '../../../src/database/hooks/useAccountRelations';
import { useAccountCards, useBoards } from '../../../src/database/hooks/useBoards';
import { useLocalSearch } from '../../../src/features/search/useLocalSearch';

jest.mock('../../../src/database/hooks/useBoards', () => ({
  useBoards: jest.fn(),
  useAccountCards: jest.fn(),
}));
jest.mock('../../../src/database/hooks/useAccountRelations', () => ({
  useAccountStacks: jest.fn(),
  useAccountCardRelations: jest.fn(),
}));

const board = (over: Partial<any> = {}): any => ({ id: 'b1', title: 'Finance & Juridique', ...over });
const stack = (over: Partial<any> = {}): any => ({ id: 's1', boardId: 'b1', title: 'En cours', ...over });
const card = (over: Partial<any> = {}): any => ({
  id: 'c1', boardId: 'b1', stackId: 's1', remoteId: '7',
  title: 'Payer le loyer', description: '', duedate: null, archived: false,
  ...over,
});
const label = (over: Partial<any> = {}): any => ({ id: 'l1', title: 'URGENT', ...over });
const assignee = (over: Partial<any> = {}): any => ({
  cardId: 'c2', displayName: 'Alice Martin', participant: 'alice', ...over,
});

const boards = [board(), board({ id: 'b2', title: 'Commercial' })];
const stacks = [stack(), stack({ id: 's2', boardId: 'b2', title: 'À faire' })];
const cards = [
  card(),
  card({ id: 'c2', boardId: 'b2', stackId: 's2', remoteId: '8', title: 'Relancer le client', archived: false }),
  card({ id: 'c3', boardId: 'b1', stackId: 's1', remoteId: '9', title: 'Vieux', archived: true }),
];

beforeEach(() => {
  jest.clearAllMocks();
  (useBoards as jest.Mock).mockReturnValue(boards);
  (useAccountCards as jest.Mock).mockReturnValue(cards);
  (useAccountStacks as jest.Mock).mockReturnValue(stacks);
  (useAccountCardRelations as jest.Mock).mockReturnValue({
    labelsByCard: new Map([['c1', [label()]]]),
    assigneesByCard: new Map([['c2', [assignee()]]]),
  });
});

it('returns nothing for an empty query', () => {
  const { result } = renderHook(() => useLocalSearch('a1', '   '));
  expect(result.current.isEmpty).toBe(true);
  expect(result.current.groups).toEqual([]);
});
it('groups matching cards by board, boards sorted by title', () => {
  const { result } = renderHook(() => useLocalSearch('a1', 'le'));
  expect(result.current.groups.map((g) => g.boardTitle)).toEqual(['Commercial', 'Finance & Juridique']);
});
it('never lists an archived card', () => {
  const { result } = renderHook(() => useLocalSearch('a1', 'vieux'));
  expect(result.current.groups).toEqual([]);
});
it('resolves list:, tag: and assigned: through the joined rows', () => {
  expect(renderHook(() => useLocalSearch('a1', 'list:"en cours"')).result.current.groups[0].cards[0].id).toBe('c1');
  expect(renderHook(() => useLocalSearch('a1', 'tag:urgent')).result.current.groups[0].cards[0].id).toBe('c1');
  expect(renderHook(() => useLocalSearch('a1', 'assigned:alice')).result.current.groups[0].cards[0].id).toBe('c2');
});
it('lists boards whose title matches the free text', () => {
  const { result } = renderHook(() => useLocalSearch('a1', 'juridique'));
  expect(result.current.boards.map((b) => b.title)).toEqual(['Finance & Juridique']);
});
it('exposes the remote ids of every cached card', () => {
  expect(renderHook(() => useLocalSearch('a1', 'x')).result.current.remoteIds.has('7')).toBe(true);  // c1.remoteId = '7'
});
