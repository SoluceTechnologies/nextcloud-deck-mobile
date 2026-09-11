import { render, screen, fireEvent } from '@testing-library/react-native';

import { ThemeWrapper } from '../../helpers/theme';
import { lightTheme } from '../../../src/theme';
import { CardTile, toCardTileCard } from '../../../src/features/board/components/CardTile';

// Wrapped in a jest.fn so the memoisation tests can tell whether CardTileImpl's
// body actually ran: a hook only executes when the function component itself
// executes, so its call count is untouched by a React.memo bailout, unlike
// e.g. counting React.Profiler onRender commits (which fire on every rerender()
// regardless of whether the memoised child bailed out).
const mockUseTranslation = jest.fn(() => ({
  t: (k: string, o?: any) => (o?.count != null ? `${k}:${o.count}` : k),
}));
jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => mockUseTranslation(),
}));

const data = (over: Partial<any> = {}) => ({
  card: {
    id: 'c1', title: 'Payer le loyer', color: null, duedate: null,
    attachmentCount: 0, commentsCount: 0, doneAt: null, ...over.card,
  },
  labels: over.labels ?? [],
  assignees: over.assignees ?? [],
});

it('toCardTileCard normalizes undefined color, duedate, and doneAt to null', () => {
  const model: any = { id: 'c1', title: 'Payer le loyer', attachmentCount: 0, commentsCount: 0 };
  expect(toCardTileCard(model)).toEqual({
    id: 'c1', title: 'Payer le loyer', color: null, duedate: null, doneAt: null,
    attachmentCount: 0, commentsCount: 0,
  });
});

it('shows the card title', () => {
  render(<CardTile data={data() as never} onPress={jest.fn()} />, { wrapper: ThemeWrapper });
  expect(screen.getByText('Payer le loyer')).toBeTruthy();
});

it('names an untitled card rather than rendering an empty row', () => {
  render(<CardTile data={data({ card: { title: '' } }) as never} onPress={jest.fn()} />, {
    wrapper: ThemeWrapper,
  });
  expect(screen.getByText('card.noTitle')).toBeTruthy();
});

it('shows a chip per label', () => {
  render(
    <CardTile
      data={data({ labels: [
        { id: 'l1', title: 'FACTURATION', color: '#ff0000' },
        { id: 'l2', title: 'URGENT', color: null },
      ] }) as never}
      onPress={jest.fn()}
    />,
    { wrapper: ThemeWrapper },
  );
  expect(screen.getByText('FACTURATION')).toBeTruthy();
  expect(screen.getByText('URGENT')).toBeTruthy();
});

// Counters are noise at zero; the spec shows them only when non-zero.
it('hides the attachment and comment counters at zero', () => {
  render(<CardTile data={data() as never} onPress={jest.fn()} />, { wrapper: ThemeWrapper });
  expect(screen.queryByTestId('card-attachments')).toBeNull();
  expect(screen.queryByTestId('card-comments')).toBeNull();
});

it('shows the counters when there is something to count', () => {
  render(
    <CardTile
      data={data({ card: { attachmentCount: 2, commentsCount: 5 } }) as never}
      onPress={jest.fn()}
    />,
    { wrapper: ThemeWrapper },
  );
  expect(screen.getByText('2')).toBeTruthy();
  expect(screen.getByText('5')).toBeTruthy();
});

it('calls onPress when tapped', () => {
  const onPress = jest.fn();
  render(<CardTile data={data() as never} onPress={onPress} />, { wrapper: ThemeWrapper });
  fireEvent.press(screen.getByText('Payer le loyer'));
  expect(onPress).toHaveBeenCalledTimes(1);
});

it('shows a colour edge only when the card has a colour', () => {
  const { rerender } = render(<CardTile data={data() as never} onPress={jest.fn()} />, {
    wrapper: ThemeWrapper,
  });
  expect(screen.queryByTestId('card-edge')).toBeNull();

  rerender(<CardTile data={data({ card: { color: '#00ff00' } }) as never} onPress={jest.fn()} />);
  expect(screen.getByTestId('card-edge')).toHaveStyle({ backgroundColor: '#00ff00' });
});

// A solid `activeColor` fill (kit Chip's active state) forces hardcoded white
// text, which is illegible against a pale label colour like '#f1db50'. Instead
// each label gets a hand-rolled pill: a translucent wash of its own colour, or
// a bordered outline when the label carries no colour.
it("washes a coloured label's pill instead of filling it solid", () => {
  render(
    <CardTile
      data={data({ labels: [{ id: 'l1', title: 'FACTURATION', color: '#ff0000' }] }) as never}
      onPress={jest.fn()}
    />,
    { wrapper: ThemeWrapper },
  );
  expect(screen.getByTestId('label-chip-l1')).toHaveStyle({ backgroundColor: '#ff000026' });
});

it('gives a colourless label a bordered pill rather than a coloured wash', () => {
  render(
    <CardTile
      data={data({ labels: [{ id: 'l2', title: 'URGENT', color: null }] }) as never}
      onPress={jest.fn()}
    />,
    { wrapper: ThemeWrapper },
  );
  expect(screen.getByTestId('label-chip-l2')).toHaveStyle({ borderColor: lightTheme.colors.border });
});

// A column rebuilds `data` on every observed change, so a bare React.memo
// (default shallow compare over { data, onPress }) never bails: a NEW `data`
// wrapper always looks "different" even when nothing the tile renders actually
// changed. useTranslation() is called unconditionally at the top of the
// component, so its call count is a direct proxy for "did the tile's function
// body actually run".
it('does not re-render when a new data object carries identical primitives', () => {
  const onPress = jest.fn();
  const { rerender } = render(<CardTile data={data() as never} onPress={onPress} />, {
    wrapper: ThemeWrapper,
  });
  const callsAfterMount = mockUseTranslation.mock.calls.length;

  rerender(<CardTile data={data() as never} onPress={onPress} />);

  expect(mockUseTranslation.mock.calls.length).toBe(callsAfterMount);
});

// WatermelonDB keeps one JS instance per row (its identity map), so an
// optimistic local write mutates `model` in place rather than replacing it.
// If `card` were that live instance, prev.data.card and next.data.card would
// be the same object read twice — both already showing 'After' by the time
// the comparator runs, so it would bail and the tile would stay stale.
// toCardTileCard takes a fresh copy of the fields on every call, so the two
// renders compare two different snapshots instead of one object with itself.
it('re-renders and shows the new title when the underlying model is mutated', () => {
  const onPress = jest.fn();
  const model: any = {
    id: 'c1', title: 'Before', color: null, duedate: null, doneAt: null,
    attachmentCount: 0, commentsCount: 0,
  };
  const { rerender } = render(
    <CardTile data={{ card: toCardTileCard(model), labels: [], assignees: [] } as never} onPress={onPress} />,
    { wrapper: ThemeWrapper },
  );

  model.title = 'After';
  rerender(
    <CardTile data={{ card: toCardTileCard(model), labels: [], assignees: [] } as never} onPress={onPress} />,
  );

  expect(screen.getByText('After')).toBeTruthy();
});
