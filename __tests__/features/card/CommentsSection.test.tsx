import { fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeWrapper } from '../../helpers/theme';
import { CommentsSection } from '../../../src/features/card/components/CommentsSection';

// Sheet renders via useSafeAreaInsets(), which throws without a provider —
// CommentMenu mounts one for every comment's action sheet.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (k: string) => k }),
}));

const two: any[] = [
  { id: 'c1', remoteId: 'r1', message: 'first', actorId: 'alice', actorDisplayName: 'Alice', createdAt: 1000 },
  { id: 'c2', remoteId: 'r2', message: 'second', actorId: 'bob', actorDisplayName: 'Bob', createdAt: 2000 },
];

const handlers = () => ({
  onLoadMore: jest.fn(),
  onSubmit: jest.fn(),
  onEdit: jest.fn(),
  onDelete: jest.fn(),
});

const renderSection = (p: any = {}) =>
  render(<CommentsSection comments={two} hasMore={false} me="alice" {...handlers()} {...p} />, {
    wrapper: ThemeWrapper,
  });

it('lists comments oldest first, with author and time', () => {
  renderSection();
  const rows = screen.getAllByTestId(/^comment-/);
  // A RegExp matcher: @testing-library/react-native's toHaveTextContent (the
  // version this project's setup ends up registering — see how it defaults to
  // an exact match, unlike jest-native's own substring check) only skips that
  // exact-match default for a RegExp, never for a plain string. The row also
  // renders the avatar initial, author, and relative time, so a string here
  // would be rejected outright.
  expect(rows[0]).toHaveTextContent(/first/);
  expect(screen.getByText('Alice')).toBeTruthy();
});

it('says there are none rather than rendering an empty block', () => {
  renderSection({ comments: [] });
  expect(screen.getByText('card.noComments')).toBeTruthy();
});

it('offers load-more only when there is more', () => {
  const { rerender } = render(
    <CommentsSection comments={two} hasMore={false} me="alice" {...handlers()} />,
    { wrapper: ThemeWrapper },
  );
  expect(screen.queryByText('card.loadMore')).toBeNull();

  rerender(<CommentsSection comments={two} hasMore me="alice" {...handlers()} />);
  expect(screen.getByText('card.loadMore')).toBeTruthy();
});

it('submits a trimmed message and clears the field', () => {
  const onSubmit = jest.fn();
  renderSection({ comments: [], onSubmit });

  fireEvent.changeText(screen.getByTestId('comment-input'), '  hello  ');
  fireEvent.press(screen.getByTestId('comment-send'));

  expect(onSubmit).toHaveBeenCalledWith('hello', null);
  expect(screen.getByTestId('comment-input')).toHaveProp('value', '');
});

it('does not submit an empty or whitespace message', () => {
  const onSubmit = jest.fn();
  renderSection({ comments: [], onSubmit });
  fireEvent.changeText(screen.getByTestId('comment-input'), '   ');
  fireEvent.press(screen.getByTestId('comment-send'));
  expect(onSubmit).not.toHaveBeenCalled();
});

// A comment written offline appears immediately and is marked as not yet sent.
it('marks a comment that has no remote id as pending', () => {
  renderSection({
    comments: [{ id: 'l1', remoteId: '', message: 'offline', actorDisplayName: 'Me', createdAt: 1 }] as never,
  });
  expect(screen.getByTestId('comment-pending-l1')).toBeTruthy();
});

// Deck only lets a comment's own author edit or delete it, so the menu must not
// offer either on someone else's — the server would answer 403 and the drain
// treats that as permanent.
it("offers only a reply on another person's comment", () => {
  renderSection();
  fireEvent.press(screen.getByTestId('comment-menu-c2')); // Bob's
  expect(screen.getByTestId('comment-action-reply')).toBeTruthy();
  expect(screen.queryByTestId('comment-action-edit')).toBeNull();
  expect(screen.queryByTestId('comment-action-delete')).toBeNull();
});

it('offers edit and delete on my own comment', () => {
  renderSection();
  fireEvent.press(screen.getByTestId('comment-menu-c1')); // Alice's, and me="alice"
  expect(screen.getByTestId('comment-action-edit')).toBeTruthy();
  expect(screen.getByTestId('comment-action-delete')).toBeTruthy();
});

// A comment still queued has no remote id, and a reply has to name its parent
// by that id.
it('does not offer to answer a comment that has not synced yet', () => {
  renderSection({
    comments: [{ id: 'l1', remoteId: '', message: 'offline', actorId: '', actorDisplayName: '', createdAt: 1 }],
  });
  fireEvent.press(screen.getByTestId('comment-menu-l1'));
  expect(screen.queryByTestId('comment-action-reply')).toBeNull();
  // Written on this device, so it is mine even without an actor.
  expect(screen.getByTestId('comment-action-edit')).toBeTruthy();
});

it('seeds the composer with the message being edited and saves through onEdit', () => {
  const h = handlers();
  renderSection({ ...h });

  fireEvent.press(screen.getByTestId('comment-menu-c1'));
  fireEvent.press(screen.getByTestId('comment-action-edit'));
  expect(screen.getByTestId('comment-input')).toHaveProp('value', 'first');

  fireEvent.changeText(screen.getByTestId('comment-input'), 'first, amended');
  fireEvent.press(screen.getByTestId('comment-send'));

  expect(h.onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), 'first, amended');
  expect(h.onSubmit).not.toHaveBeenCalled();
  // Back to a blank new-comment composer.
  expect(screen.getByTestId('comment-input')).toHaveProp('value', '');
  expect(screen.queryByTestId('comment-composer-context')).toBeNull();
});

it('sends a reply with its parent remote id', () => {
  const h = handlers();
  renderSection({ ...h });

  fireEvent.press(screen.getByTestId('comment-menu-c2'));
  fireEvent.press(screen.getByTestId('comment-action-reply'));
  expect(screen.getByTestId('comment-composer-context')).toBeTruthy();

  fireEvent.changeText(screen.getByTestId('comment-input'), 'answering Bob');
  fireEvent.press(screen.getByTestId('comment-send'));

  expect(h.onSubmit).toHaveBeenCalledWith('answering Bob', 'r2');
});

// Deck threads one level: an answer to a reply attaches to that reply's root,
// which is what the server would do with it anyway.
it('answers the root when the target is itself a reply', () => {
  const h = handlers();
  renderSection({
    comments: [
      ...two,
      { id: 'c3', remoteId: 'r3', parentId: 'r1', message: 'a reply', actorId: 'bob', actorDisplayName: 'Bob', createdAt: 3000 },
    ],
    ...h,
  });

  fireEvent.press(screen.getByTestId('comment-menu-c3'));
  fireEvent.press(screen.getByTestId('comment-action-reply'));
  fireEvent.changeText(screen.getByTestId('comment-input'), 'deeper');
  fireEvent.press(screen.getByTestId('comment-send'));

  expect(h.onSubmit).toHaveBeenCalledWith('deeper', 'r1');
});

it('cancels an edit without saving it', () => {
  const h = handlers();
  renderSection({ ...h });

  fireEvent.press(screen.getByTestId('comment-menu-c1'));
  fireEvent.press(screen.getByTestId('comment-action-edit'));
  fireEvent.press(screen.getByTestId('comment-composer-cancel'));

  expect(screen.getByTestId('comment-input')).toHaveProp('value', '');
  fireEvent.changeText(screen.getByTestId('comment-input'), 'a new one');
  fireEvent.press(screen.getByTestId('comment-send'));

  expect(h.onEdit).not.toHaveBeenCalled();
  expect(h.onSubmit).toHaveBeenCalledWith('a new one', null);
});

// A reply whose parent is on a page that has not been loaded still has to
// appear: the thread renders every comment it was handed.
it('renders an orphaned reply as a root rather than dropping it', () => {
  renderSection({
    comments: [{ id: 'c9', remoteId: 'r9', parentId: 'gone', message: 'orphan', actorId: 'bob', actorDisplayName: 'Bob', createdAt: 1 }],
  });
  expect(screen.getByTestId('comment-c9')).toBeTruthy();
});

it('shows a loader instead of the empty state while the fetch is in flight', () => {
  renderSection({ comments: [], loading: true });
  expect(screen.getByTestId('comments-loading')).toBeTruthy();
  expect(screen.queryByText('card.noComments')).toBeNull();
});

// hasMore/loadMore reuse the same flag, so a loader must never replace the
// thread already on screen.
it('keeps showing the thread while a further page loads', () => {
  renderSection({ loading: true });
  expect(screen.getByTestId('comment-c1')).toBeTruthy();
  expect(screen.queryByTestId('comments-loading')).toBeNull();
});
