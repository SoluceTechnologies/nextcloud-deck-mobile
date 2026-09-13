import { fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeWrapper } from '../../helpers/theme';
import { CommentsSection } from '../../../src/features/card/components/CommentsSection';

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (k: string) => k }),
}));

const two: any[] = [
  { id: 'c1', remoteId: 'r1', message: 'first', actorId: 'alice', actorDisplayName: 'Alice', createdAt: 1000 },
  { id: 'c2', remoteId: 'r2', message: 'second', actorId: 'bob', actorDisplayName: 'Bob', createdAt: 2000 },
];

const handlers = () => ({ onLoadMore: jest.fn(), onSubmit: jest.fn() });

const renderSection = (p: any = {}) =>
  render(<CommentsSection comments={two} hasMore={false} {...handlers()} {...p} />, { wrapper: ThemeWrapper });

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
    <CommentsSection comments={two} hasMore={false} {...handlers()} />,
    { wrapper: ThemeWrapper },
  );
  expect(screen.queryByText('card.loadMore')).toBeNull();

  rerender(<CommentsSection comments={two} hasMore {...handlers()} />);
  expect(screen.getByText('card.loadMore')).toBeTruthy();
});

it('submits a trimmed message and clears the field', () => {
  const onSubmit = jest.fn();
  renderSection({ comments: [], onSubmit });

  fireEvent.changeText(screen.getByTestId('comment-input'), '  hello  ');
  fireEvent.press(screen.getByTestId('comment-send'));

  expect(onSubmit).toHaveBeenCalledWith('hello');
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
