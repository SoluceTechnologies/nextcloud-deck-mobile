import React from 'react';
import { ActivityIndicator, ActivityIndicatorProps } from 'react-native';
import { useTheme } from 'expo-router';

interface SpinnerProps extends Omit<ActivityIndicatorProps, 'color'> {
  color?: 'primary' | 'text' | 'secondary';
}

function Spinner({ color = 'primary', ...rest }: SpinnerProps) {
  const { colors } = useTheme();
  const resolved = color === 'text' ? colors.text : color === 'secondary' ? colors.text : colors.primary;
  return <ActivityIndicator {...rest} color={resolved} />;
}

export default React.memo(Spinner);
