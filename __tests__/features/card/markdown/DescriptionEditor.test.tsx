import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ThemeWrapper } from '../../../helpers/theme';
import { DescriptionEditor } from '../../../../src/features/card/markdown/DescriptionEditor';

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (k: string) => k }),
}));

jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

jest.mock('react-native-enriched-markdown', () => require('react-native-enriched-markdown/jest'));

function setEditorMarkdown(text: string) {
  fireEvent.changeText(screen.getByTestId('rich-editor'), text);
}

const renderEditor = (props: Partial<React.ComponentProps<typeof DescriptionEditor>> = {}) =>
  render(
    <DescriptionEditor
      visible
      initial=""
      onClose={jest.fn()}
      onSave={jest.fn()}
      {...props}
    />,
    { wrapper: ThemeWrapper },
  );

it('opens the rich editor for supported content', () => {
  renderEditor({ initial: '**bold**' });
  expect(screen.getByTestId('rich-editor')).toBeTruthy();
  expect(screen.queryByTestId('raw-editor')).toBeNull();
});

// The guard rail: no silent content loss, whatever the spike concluded.
it('opens the raw editor when the description holds a code fence', () => {
  renderEditor({ initial: '```\ncode\n```' });
  expect(screen.getByTestId('raw-editor')).toBeTruthy();
  expect(screen.queryByTestId('rich-editor')).toBeNull();
});

it('explains why the raw editor is being used', () => {
  renderEditor({ initial: '| a |\n| - |' });
  expect(screen.getByText('card.rawEditorNotice')).toBeTruthy();
});

it('offers only the toolbar actions the library supports', () => {
  renderEditor({ initial: '' });
  for (const id of [
    'bold', 'italic', 'strike', 'h1', 'h2', 'h3', 'ul', 'ol', 'indent', 'outdent',
    'task', 'quote', 'codeBlock', 'link',
  ]) {
    expect(screen.getByTestId(`md-${id}`)).toBeTruthy();
  }
  // No inline-code toggle exists on the instance; offering one would be a lie.
  expect(screen.queryByTestId('md-code')).toBeNull();
});

it('switches to the Markdown editor with a checklist item when the rich editor cannot hold one', async () => {
  renderEditor({ initial: 'Intro' });
  setEditorMarkdown('Intro');
  fireEvent.press(screen.getByTestId('md-task'));

  await waitFor(() => expect(screen.getByTestId('raw-editor')).toBeTruthy());
  expect(screen.getByTestId('raw-editor').props.value).toBe('Intro\n\n- [ ] ');
  expect(screen.queryByTestId('rich-editor')).toBeNull();
});

it('saves the markdown the editor reports, not the seeded value', async () => {
  const onSave = jest.fn();
  renderEditor({ initial: 'before', onSave });
  setEditorMarkdown('after');
  fireEvent.press(screen.getByTestId('editor-save'));
  await waitFor(() => expect(onSave).toHaveBeenCalledWith('after'));
});

it('does not save when nothing changed', async () => {
  const onSave = jest.fn();
  renderEditor({ initial: 'same', onSave });
  fireEvent.press(screen.getByTestId('editor-save'));
  await waitFor(() => expect(onSave).not.toHaveBeenCalled());
});

// A sync patch can update `initial` while the sheet is still open. Save
// must compare against what was on screen when the editor opened, not
// whatever `initial` has drifted to since — otherwise an untouched Save
// clobbers the remote change with the stale seeded text.
it('saves against the text seeded at open, not a later initial prop', async () => {
  const onSave = jest.fn();
  const onClose = jest.fn();
  const { rerender } = renderEditor({ initial: 'v1', onSave, onClose });

  rerender(<DescriptionEditor visible initial="v2" onClose={onClose} onSave={onSave} />);

  fireEvent.press(screen.getByTestId('editor-save'));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(onSave).not.toHaveBeenCalled();
});

it('closes without saving from the close button', () => {
  const onClose = jest.fn();
  renderEditor({ initial: 'same', onClose });
  fireEvent.press(screen.getByTestId('editor-close'));
  expect(onClose).toHaveBeenCalled();
});
