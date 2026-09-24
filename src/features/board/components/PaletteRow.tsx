import { ScrollView, StyleSheet } from 'react-native';
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
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={styles.scroll}
      contentContainerStyle={styles.palette}
    >
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, marginHorizontal: -16 },
  palette: { gap: 12, paddingVertical: 8, paddingHorizontal: 16 },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 3 },
});
