import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from 'expo-router';

import Icon from './Icon';

interface IconTileProps {
  children?: React.ReactNode;
  tint?: 'default' | 'danger' | 'primary';
  size?: number;
}

function IconTile({ children, tint = 'default', size = 40 }: IconTileProps) {
  const { colors, radius } = useTheme();

  const glyph =
    tint === 'danger' ? colors.danger : tint === 'primary' ? colors.primary : colors.text;

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
