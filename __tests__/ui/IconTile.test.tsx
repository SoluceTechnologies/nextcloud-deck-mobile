import { render, screen } from '@testing-library/react-native';
import { Palette } from 'lucide-react-native';

import { ThemeWrapper } from '../helpers/theme';
import IconTile from '../../src/ui/components/IconTile';
import { lightTheme } from '../../src/theme';

const renderTile = (props: any = {}) =>
  render(
    <IconTile {...props}>
      <Palette />
    </IconTile>,
    { wrapper: ThemeWrapper },
  );

// The glyph's colour is the whole point of the tint: a destructive row has to
// read as destructive, and the caller passes no colour of its own.
it('paints the glyph with the tint', () => {
  renderTile({ tint: 'danger' });
  expect(screen.UNSAFE_getByType(Palette).props.color).toBe(lightTheme.colors.danger);
});

it('falls back to the text colour with no tint', () => {
  renderTile();
  expect(screen.UNSAFE_getByType(Palette).props.color).toBe(lightTheme.colors.text);
});

// A caller that already set a colour keeps it, so a label's own swatch colour
// survives the tile.
it('overrides a glyph colour the caller set, since the tile owns the tint', () => {
  render(
    <IconTile tint="primary">
      <Palette color="#abcdef" />
    </IconTile>,
    { wrapper: ThemeWrapper },
  );
  expect(screen.UNSAFE_getByType(Palette).props.color).toBe(lightTheme.colors.primary);
});
