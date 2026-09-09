import React from 'react';
import { StyleSheet, Text, TextProps, TextStyle, StyleProp } from 'react-native';
import { useTheme } from 'expo-router';

export const VARIANTS = StyleSheet.create({
  body1: { fontSize: 16, fontWeight: '500', lineHeight: 20 },
  body2: { fontSize: 15, fontWeight: '600', lineHeight: 19 },
  caption: { fontSize: 14, fontWeight: '400', lineHeight: 19, letterSpacing: 0.1 },
  button: { fontSize: 16, fontWeight: '700', lineHeight: 24 },
  title: { fontSize: 17, fontWeight: '600', lineHeight: 22 },
  navigation: { fontSize: 18, fontWeight: '600', lineHeight: 24 },
  header: { fontSize: 19, fontWeight: '700', lineHeight: 22, letterSpacing: 0.08 },
  h1: { fontSize: 32, fontWeight: '700', lineHeight: 40 },
  h2: { fontSize: 28, fontWeight: '700', lineHeight: 34 },
  h3: { fontSize: 24, fontWeight: '700', lineHeight: 30 },
  h4: { fontSize: 20, fontWeight: '700', lineHeight: 26 },
});

const ALIGN = StyleSheet.create({
  left: { textAlign: 'left' },
  center: { textAlign: 'center' },
  right: { textAlign: 'right' },
});

export type Variant = keyof typeof VARIANTS;
type Color = 'primary' | 'text' | 'secondary' | 'light' | 'danger';
type Alignment = keyof typeof ALIGN;

export interface TypographyProps extends TextProps {
  variant?: Variant;
  color?: Color | string;
  align?: Alignment;
  inline?: boolean;
  nowrap?: boolean;
  weight?: TextStyle['fontWeight'];
  italic?: boolean;
  style?: StyleProp<TextStyle>;
}

function Typography({
  variant = 'body1',
  color = 'text',
  align = 'left',
  nowrap = false,
  weight,
  italic = false,
  style,
  children,
  ...rest
}: TypographyProps) {
  const { colors } = useTheme();

  const textColor =
    color === 'primary' ? colors.primary
    : color === 'text' ? colors.text
    : color === 'secondary' ? colors.text
    : color === 'light' ? '#ffffff'
    : color === 'danger' ? colors.danger
    : color;

  return (
    <Text
      {...rest}
      numberOfLines={nowrap ? 1 : rest.numberOfLines}
      style={[
        VARIANTS[variant],
        ALIGN[align],
        { color: textColor },
        color === 'secondary' && { opacity: 0.5 },
        weight ? { fontWeight: weight } : null,
        italic && styles.italic,
        style,
      ]}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  italic: { transform: [{ skewX: '-13deg' }] },
});

export default React.memo(Typography);
