import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from 'expo-router';

import Icon from './Icon';

interface IconTileProps {
  children?: React.ReactNode;
  /** Tints both the glyph and its backing square — for a destructive row. */
  tint?: 'default' | 'danger' | 'primary';
  size?: number;
}

/**
 * The rounded square behind a row's glyph. Passed as an `Item`'s `leading`,
 * so rows that want the treatment opt in and every other `Item` in the app —
 * settings, pickers, menus — keeps rendering exactly as it did.
 *
 * The backing square is a flat wash rather than `Icon`'s own `color` chip,
 * which paints the glyph white for a saturated label colour; here the glyph
 * has to stay legible on a near-background tint in both themes.
 */
function IconTile({ children, tint = 'default', size = 40 }: IconTileProps) {
  const { colors, radius } = useTheme();

  const glyph =
    tint === 'danger' ? colors.danger : tint === 'primary' ? colors.primary : colors.text;
  // A low-alpha wash of the glyph colour, so the tile follows the theme
  // instead of carrying its own light/dark pair.
  const background = tint === 'default' ? colors.surfaceRaised : `${glyph}1f`;

  return (
    <View
      style={[
        styles.tile,
        { width: size, height: size, borderRadius: radius.md, backgroundColor: background },
      ]}
    >
      <Icon size={20} color={undefined} style={styles.glyph}>
        {React.isValidElement(children)
          ? React.cloneElement(children as React.ReactElement<{ color?: string }>, { color: glyph })
          : children}
      </Icon>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center' },
  glyph: { width: 20, height: 20 },
});

export default React.memo(IconTile);
