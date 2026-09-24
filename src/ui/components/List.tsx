import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme } from 'expo-router';

interface ListProps {
  children?: React.ReactNode;
  radius?: number;
  ignoreBorder?: boolean;
  style?: StyleProp<ViewStyle>;
}

function List({ children, radius = 16, ignoreBorder = false, style }: ListProps) {
  const { colors } = useTheme();
  const items = React.Children.toArray(children).filter(Boolean);

  return (
    <View
      style={[
        styles.card,
        { borderRadius: radius, backgroundColor: colors.item, borderColor: `${colors.border}55` },
        style,
      ]}
    >
      {items.map((child, i) => {
        const itemKey = React.isValidElement(child) ? child.key : i;

        return (
          <View
            key={itemKey}
            style={
              !ignoreBorder && i < items.length - 1
                ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }
                : undefined
            }
          >
            {child}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
});

export default React.memo(List);
