import React from 'react';
import { StyleSheet } from 'react-native';
import { useTheme } from 'expo-router';
import { Check } from 'lucide-react-native';

import AnimatedPressable from './AnimatedPressable';

interface CheckboxProps {
  checked?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  testID?: string;
}

/**
 * The app's one "mark this done" control — Today's rows and the card detail
 * screen render the same 24pt ring so a card reads the same in both places.
 * The tap target is widened with hitSlop rather than a bigger box, so the
 * ring still lines up with the text beside it.
 */
function Checkbox({ checked = false, onPress, accessibilityLabel, testID }: CheckboxProps) {
  const { colors } = useTheme();

  return (
    <AnimatedPressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={10}
      style={[
        styles.box,
        checked
          ? { borderColor: colors.primary, backgroundColor: colors.primary }
          : { borderColor: colors.textTertiary },
      ]}
    >
      {checked ? <Check size={16} color={colors.primaryText} strokeWidth={3} /> : null}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  box: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default React.memo(Checkbox);
