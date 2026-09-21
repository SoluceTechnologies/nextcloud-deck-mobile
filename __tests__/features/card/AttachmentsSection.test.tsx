import { fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeWrapper } from '../../helpers/theme';
import { AttachmentsSection, formatSize } from '../../../src/features/card/components/AttachmentsSection';

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (k: string) => k }),
}));

const pdf: any = {
  id: 'a1',
  remoteId: '10',
  attachmentType: 'deck_file',
  fileName: 'contract.pdf',
  mime: 'application/pdf',
  size: 20480,
  createdAt: 1000,
  createdBy: 'alice',
};

const image: any = {
  id: 'a2',
  remoteId: '11',
  attachmentType: 'deck_file',
  fileName: 'photo.jpg',
  mime: 'image/jpeg',
  size: 40960,
  createdAt: 2000,
  createdBy: 'alice',
};

const renderSection = (props: any) =>
  render(<AttachmentsSection {...props} />, { wrapper: ThemeWrapper });

it('lists each attachment with its name, size and type', () => {
  renderSection({ attachments: [pdf], onOpen: jest.fn() });
  expect(screen.getByText('contract.pdf')).toBeTruthy();
  expect(screen.getByText('20 KB')).toBeTruthy();
});

it('says there are none rather than rendering an empty block', () => {
  renderSection({ attachments: [], onOpen: jest.fn() });
  expect(screen.getByText('card.noFiles')).toBeTruthy();
});

it('opens an attachment by identity, not by index', () => {
  const onOpen = jest.fn();
  renderSection({ attachments: [pdf, image], onOpen });
  fireEvent.press(screen.getByText('photo.jpg'));
  expect(onOpen).toHaveBeenCalledWith(image);
});

// v0 is read-only for attachments; an upload affordance would be a dead end.
it('offers no upload control', () => {
  renderSection({ attachments: [], onOpen: jest.fn() });
  expect(screen.queryByText('card.addFile')).toBeNull();
});

it('formats a size in bytes without a unit jump', () => {
  renderSection({ attachments: [{ ...pdf, size: 512 }], onOpen: jest.fn() });
  expect(screen.getByText('512 B')).toBeTruthy();
});

it('shows a zero-byte file as 0 B rather than blank', () => {
  renderSection({ attachments: [{ ...pdf, size: 0 }], onOpen: jest.fn() });
  expect(screen.getByText('0 B')).toBeTruthy();
});

it('formats a size just under the MB boundary in whole KB', () => {
  expect(formatSize(1048575)).toBe('1024 KB');
});

it('formats a size at the MB boundary in MB with one decimal', () => {
  expect(formatSize(1048576)).toBe('1.0 MB');
});

// An empty list means "the fetch has not answered yet" just as often as it
// means "this card has none" — saying "no files" during the first is the bug
// this covers.
it('waits when the card claims files this device has not received yet', () => {
  renderSection({ attachments: [], loading: true, expectedCount: 3, onOpen: jest.fn() });
  expect(screen.getByTestId('files-empty-loading')).toBeTruthy();
  expect(screen.queryByText('card.noFiles')).toBeNull();
});

// The card carries its own attachment count, so a card with none has nothing
// to wait for — a spinner there is a flash of the wrong answer, and the jump
// from a spinner-sized box to a full empty state shoves the page around.
it('does not flash a loader for a card the server says has no files', () => {
  renderSection({ attachments: [], loading: true, expectedCount: 0, onOpen: jest.fn() });
  expect(screen.queryByTestId('files-empty-loading')).toBeNull();
  expect(screen.getByText('card.noFiles')).toBeTruthy();
});

it('says there are none once the fetch has answered with nothing', () => {
  renderSection({ attachments: [], loading: false, expectedCount: 3, onOpen: jest.fn() });
  expect(screen.getByText('card.noFiles')).toBeTruthy();
  expect(screen.queryByTestId('files-empty-loading')).toBeNull();
});

// loadMore reuses the same flag, so a loader must never replace rows already
// on screen.
it('keeps showing the files it has while a further page loads', () => {
  renderSection({ attachments: [pdf], loading: true, expectedCount: 3, onOpen: jest.fn() });
  expect(screen.getByText('contract.pdf')).toBeTruthy();
  expect(screen.queryByTestId('files-empty-loading')).toBeNull();
});
