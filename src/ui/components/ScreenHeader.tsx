import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import Typography from './Typography';
import IconButton from './IconButton';


interface ScreenHeaderProps {
  title?: string;
  onBack?: () => void;
  left?: React.ReactNode;
  right?: React.ReactNode;
}

function ScreenHeader({ title, onBack, left, right }: ScreenHeaderProps) {
  const { colors } = useTheme();

  const leftSlot = onBack ? (
    <IconButton variant="ghost" glass round size={40} onPress={onBack} accessibilityRole="button">
      <ChevronLeft size={22} color={colors.text} />
    </IconButton>
  ) : (
    left
  );

  const hasActions = Boolean(leftSlot || right);

  return (
    <View style={styles.container}>
      {hasActions && (
        <View style={styles.actions}>
          {leftSlot}
          <View style={styles.spacer} />
          {right}
        </View>
      )}
      {title ? (
        <Typography variant="h2" numberOfLines={2} style={styles.title}>
          {title}
        </Typography>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  actions: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  spacer: { flex: 1 },
  title: { marginTop: 8 },
});

export default React.memo(ScreenHeader);
