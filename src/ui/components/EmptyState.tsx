import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from 'expo-router';

import Spinner from './Spinner';
import Typography from './Typography';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  /** The line under the title — what the user could do about it. */
  description?: string;
  /** A single affordance, rendered under the text. */
  action?: React.ReactNode;
  /**
   * Waiting on the fetch that decides whether this block is empty at all.
   * The spinner takes the same box the text would, so resolving one way or
   * the other does not change the block's height and shove everything below
   * it down the page.
   */
  loading?: boolean;
  testID?: string;
}

/**
 * The "there is nothing here yet" block: a muted glyph over a bold line and an
 * explanation. It replaces a bare centred sentence, which read as an error
 * more often than as an empty list.
 */
function EmptyState({ icon, title, description, action, loading, testID }: EmptyStateProps) {
  const { colors } = useTheme();

  if (loading) {
    return (
      <View testID={testID ? `${testID}-loading` : undefined} style={styles.root}>
        <Spinner />
      </View>
    );
  }

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
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 12,
    minHeight: 180,
  },
  description: { maxWidth: 280 },
});

export default React.memo(EmptyState);
