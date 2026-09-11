import { render, screen, fireEvent } from '@testing-library/react-native';

import { ThemeWrapper } from '../../helpers/theme';
import { CardTile } from '../../../src/features/board/components/CardTile';

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (k: string, o?: any) => (o?.count != null ? `${k}:${o.count}` : k) }),
}));

const data = (over: Partial<any> = {}) => ({
  card: {
    id: 'c1', title: 'Payer le loyer', color: null, duedate: null,
    attachmentCount: 0, commentsCount: 0, doneAt: null, ...over.card,
  },
  labels: over.labels ?? [],
  assignees: over.assignees ?? [],
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
