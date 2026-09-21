import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { Paperclip } from 'lucide-react-native';

import { ThemeWrapper } from '../helpers/theme';
import EmptyState from '../../src/ui/components/EmptyState';

const renderState = (props: any = {}) =>
  render(<EmptyState icon={<Paperclip />} title="No files" testID="empty" {...props} />, {
    wrapper: ThemeWrapper,
  });

it('shows the title and the description', () => {
  renderState({ description: 'Attach something.' });
  expect(screen.getByText('No files')).toBeTruthy();
  expect(screen.getByText('Attach something.')).toBeTruthy();
});

it('shows a spinner in place of the text while loading', () => {
  renderState({ loading: true });
  expect(screen.getByTestId('empty-loading')).toBeTruthy();
  expect(screen.queryByText('No files')).toBeNull();
});

// The jump this fixes: a bare spinner is ~20pt tall and the resolved empty
// state is ~180pt, so every section below it lurched down the page the moment
// the fetch answered. Both states have to occupy the same box.
it('reserves the same height whether it is loading or resolved', () => {
  const { unmount } = renderState({ loading: true, description: 'Attach something.' });
  const loadingStyle = StyleSheet.flatten(screen.getByTestId('empty-loading').props.style);
  unmount();

  renderState({ description: 'Attach something.' });
  const resolvedStyle = StyleSheet.flatten(screen.getByTestId('empty').props.style);

  expect(loadingStyle.minHeight).toBe(resolvedStyle.minHeight);
  expect(loadingStyle.minHeight).toBeGreaterThan(0);
});
