import React from 'react';
import { ActivityIndicator, PressableProps, StyleSheet, View } from 'react-native';
import { useTheme } from 'expo-router';
import * as Haptics from 'expo-haptics';
import AnimatedPressable from './AnimatedPressable';
import Typography from './Typography';

type Variant = 'primary' | 'secondary' | 'ghost' | 'link';
type Color = 'primary' | 'danger' | 'text';
type Size = 'small' | 'medium' | 'large';
type Alignment = 'start' | 'center' | 'end';

interface ButtonProps extends Omit<PressableProps, 'children'> {
  variant?: Variant;
  color?: Color;
  size?: Size;
  icon?: React.ReactNode;
  title?: string;
  children?: React.ReactNode;
  inline?: boolean;
  loading?: boolean;
  disabled?: boolean;
  alignment?: Alignment;
  disableAnimation?: boolean;
  dashed?: boolean;
  hapticFeedback?: Haptics.ImpactFeedbackStyle | null;
}

const SIZE = StyleSheet.create({
  small: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 10, gap: 6, minHeight: 40 },
  medium: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 12, gap: 8, minHeight: 48 },
  large: { paddingVertical: 13, paddingHorizontal: 22, borderRadius: 14, gap: 10, minHeight: 54 },
});

const JUSTIFY = { start: 'flex-start', center: 'center', end: 'flex-end' } as const;

function Button({
  variant = 'primary',
  color = 'primary',
  size = 'medium',
  icon,
  title,
  children,
  inline = false,
  loading = false,
  disabled = false,
  alignment = 'center',
  disableAnimation = false,
  dashed = false,
  hapticFeedback = Haptics.ImpactFeedbackStyle.Light,
  style,
  ...rest
}: ButtonProps) {
  const { colors } = useTheme();
  const accent = color === 'danger' ? colors.danger : color === 'text' ? colors.text : colors.primary;

  const filled = variant === 'primary';
  const backgroundColor =
    variant === 'primary' ? accent
    : variant === 'secondary' ? colors.surface
    : 'transparent';
  const borderColor =
    variant === 'primary' ? accent
    : variant === 'secondary' ? colors.border
    : variant === 'ghost' ? accent
    : 'transparent';
  const labelColor = filled ? 'light' : color === 'danger' ? 'danger' : color === 'text' ? 'text' : 'primary';

  const label = title ?? children;

  return (
    <AnimatedPressable
      {...rest}
      hapticFeedback={hapticFeedback ?? undefined}
      animated={!disableAnimation && !disabled}
      disabled={disabled || loading}
      style={[
        SIZE[size],
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: JUSTIFY[alignment],
          alignSelf: inline ? 'flex-start' : 'stretch',
          backgroundColor,
          borderColor,
          borderWidth: variant === 'link' ? 0 : 1.5,
          borderStyle: dashed ? 'dashed' : 'solid',
          opacity: disabled ? 0.5 : 1,
        },
        style as object,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={filled ? '#ffffff' : accent} />
      ) : (
        <>
          {icon ? <View>{icon}</View> : null}
          {label != null ? (
            <Typography variant="button" color={labelColor}>
              {label}
            </Typography>
          ) : null}
        </>
      )}
    </AnimatedPressable>
  );
}

export default React.memo(Button);
