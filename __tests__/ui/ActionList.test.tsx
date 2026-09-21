import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { Trash2 } from 'lucide-react-native';

import { ThemeWrapper } from '../helpers/theme';
import ActionList from '../../src/ui/components/ActionList';
import { lightTheme } from '../../src/theme';

const actions = (over: any = {}) => [
  { key: 'rename', title: 'Rename', onPress: jest.fn() },
  { key: 'delete', title: 'Delete', icon: <Trash2 />, destructive: true, onPress: jest.fn(), ...over },
];

// A delete has to read as a delete wherever it is offered — the three menus
// that use this list all end in one.
it('paints a destructive action in the danger colour', () => {
  render(<ActionList actions={actions()} />, { wrapper: ThemeWrapper });
  const label = screen.getByText('Delete');
  expect(StyleSheet.flatten(label.props.style).color).toBe(lightTheme.colors.danger);
});

it('leaves an ordinary action in the text colour', () => {
  render(<ActionList actions={actions()} />, { wrapper: ThemeWrapper });
  const label = screen.getByText('Rename');
  expect(StyleSheet.flatten(label.props.style).color).toBe(lightTheme.colors.text);
});

it('tints a destructive action glyph to match its label', () => {
  render(<ActionList actions={actions()} />, { wrapper: ThemeWrapper });
  expect(screen.UNSAFE_getByType(Trash2).props.color).toBe(lightTheme.colors.danger);
});

it('runs the action that was pressed', () => {
  const list = actions();
  render(<ActionList actions={list} />, { wrapper: ThemeWrapper });
  fireEvent.press(screen.getByText('Rename'));
  expect(list[0].onPress).toHaveBeenCalled();
  expect(list[1].onPress).not.toHaveBeenCalled();
});

// An action without a glyph still renders; not every menu has one per row.
it('renders an action that carries no icon', () => {
  render(<ActionList actions={[{ key: 'a', title: 'Plain', onPress: jest.fn() }]} />, {
    wrapper: ThemeWrapper,
  });
  expect(screen.getByText('Plain')).toBeTruthy();
});
