import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from 'expo-router';

import Typography from './Typography';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  /** The line under the title — what the user could do about it. */
  description?: string;
  /** A single affordance, rendered under the text. */
  action?: React.ReactNode;
  testID?: string;
}

/**
 * The "there is nothing here yet" block: a muted glyph over a bold line and an
 * explanation. It replaces a bare centred sentence, which read as an error
 * more often than as an empty list.
 */
function EmptyState({ icon, title, description, action, testID }: EmptyStateProps) {
  const { colors } = useTheme();

  return (
    <View testID={testID} style={styles.root}>
      {React.isValidElement(icon)
        ? React.cloneElement(icon as React.ReactElement<{ color?: string; size?: number }>, {
            color: colors.textTertiary,
            size: 44,
          })
        : icon}
      <Typography variant="h4" align="center">
        {title}
      </Typography>
      {description ? (
        <Typography color="secondary" align="center" style={styles.description}>
          {description}
        </Typography>
      ) : null}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center', paddingVertical: 32, gap: 12 },
  description: { maxWidth: 280 },
});

export default React.memo(EmptyState);
