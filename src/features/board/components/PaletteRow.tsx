import { StyleSheet, View } from 'react-native';
import { useTheme } from 'expo-router';

import { AnimatedPressable } from '@/ui/components';
import { DECK_PALETTE } from '@/features/board/palette';

export interface PaletteRowProps {
  value: string | null;
  onSelect: (color: string) => void;
}

export function PaletteRow({ value, onSelect }: PaletteRowProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.palette}>
      {DECK_PALETTE.map((hex) => {
        const selected = value === hex;
        return (
          <AnimatedPressable
            key={hex}
            testID={`color-swatch-${hex}`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onSelect(hex)}
            style={[
              styles.swatch,
              { backgroundColor: hex, borderColor: selected ? colors.text : 'transparent' },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingVertical: 8 },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 3 },
});
