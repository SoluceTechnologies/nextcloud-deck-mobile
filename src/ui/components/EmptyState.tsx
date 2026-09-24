import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from 'expo-router';

import Spinner from './Spinner';
import Typography from './Typography';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  loading?: boolean;
  testID?: string;
}

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
