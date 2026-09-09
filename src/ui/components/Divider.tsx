import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from 'expo-router';


interface DividerProps {
  spacing?: number;
  flex?: boolean;
}

function Divider({ spacing = 0, flex = false }: DividerProps) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.border,
        marginVertical: spacing,
        ...(flex ? { flex: 1 } : { width: '100%' as const }),
      }}
    />
  );
}

export default React.memo(Divider);
