import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeWrapper } from '../../../helpers/theme';
import { DescriptionView } from '../../../../src/features/card/markdown/DescriptionView';

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (k: string) => k }),
}));

// The library's jest mock renders EnrichedMarkdownText as a plain Text and,
// matching the props the real native view doesn't wire through in tests,
// drops onTaskListItemPress entirely. A tapped checkbox persisting is the
// whole point of this task (Lot 10), so this wrapper keeps everything else
// from the library mock but captures the callback for fireTaskPress() below.
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

it('renders the description markdown', () => {
  render(<DescriptionView markdown="# Hi" onToggleTask={jest.fn()} onEdit={jest.fn()} />, {
    wrapper: ThemeWrapper,
  });
  expect(screen.getByTestId('description-markdown')).toBeTruthy();
});

it('shows the empty label for a blank description', () => {
  render(<DescriptionView markdown="" onToggleTask={jest.fn()} onEdit={jest.fn()} />, {
    wrapper: ThemeWrapper,
  });
  expect(screen.getByText('card.noDescription')).toBeTruthy();
});

// This is the whole point of the feature: a tapped box must persist.
it('reports a task toggle with the new document', () => {
  const onToggleTask = jest.fn();
  render(
    <DescriptionView
      markdown={'- [ ] a\n- [ ] b'}
      onToggleTask={onToggleTask}
      onEdit={jest.fn()}
    />,
    { wrapper: ThemeWrapper },
  );

  fireTaskPress({ index: 1, checked: true, text: 'b' });
  expect(onToggleTask).toHaveBeenCalledWith('- [ ] a\n- [x] b');
});

it('does not report a toggle that changes nothing', () => {
  const onToggleTask = jest.fn();
  render(<DescriptionView markdown="- [x] a" onToggleTask={onToggleTask} onEdit={jest.fn()} />, {
    wrapper: ThemeWrapper,
  });
  fireTaskPress({ index: 0, checked: true, text: 'a' });
  expect(onToggleTask).not.toHaveBeenCalled();
});

it('opens the editor from the edit affordance', () => {
  const onEdit = jest.fn();
  render(<DescriptionView markdown="# Hi" onToggleTask={jest.fn()} onEdit={onEdit} />, {
    wrapper: ThemeWrapper,
  });
  fireEvent.press(screen.getByTestId('description-edit'));
  expect(onEdit).toHaveBeenCalled();
});
