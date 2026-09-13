import { fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeWrapper } from '../../../helpers/theme';
import { RawMarkdownEditor } from '../../../../src/features/card/markdown/RawMarkdownEditor';

// One check for the syntax bar: it inserts plain text at the tracked cursor
// position. The rest of the bar (bold/italic/h1/ul/code/link) is the exact
// same insert-at-selection code path with a different literal, so a single
// button is enough to cover the mechanism.
it('inserts a task marker at the cursor', () => {
  const onChangeText = jest.fn();
  render(<RawMarkdownEditor value={'x\n'} onChangeText={onChangeText} />, { wrapper: ThemeWrapper });

  const input = screen.getByTestId('raw-editor');
  fireEvent(input, 'selectionChange', { nativeEvent: { selection: { start: 2, end: 2 } } });
  fireEvent.press(screen.getByTestId('raw-task'));

  expect(onChangeText).toHaveBeenCalledWith('x\n- [ ] ');
});
