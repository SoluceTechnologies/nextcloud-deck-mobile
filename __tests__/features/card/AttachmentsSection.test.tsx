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
