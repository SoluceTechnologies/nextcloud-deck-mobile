import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from 'expo-router';

import { List, Typography } from '@/ui/components';

interface SectionCardProps {
  icon?: React.ReactNode;
  title: string;
  /** A single affordance on the header's trailing edge, e.g. the edit pencil. */
  action?: React.ReactNode;
  children?: React.ReactNode;
  testID?: string;
}

export function SectionCard({ icon, title, action, children, testID }: SectionCardProps) {
  const { colors } = useTheme();

  return (
    <List ignoreBorder>
      <View testID={testID} style={styles.body}>
        <View style={styles.header}>
          {React.isValidElement(icon)
            ? React.cloneElement(icon as React.ReactElement<{ color?: string; size?: number }>, {
                color: colors.textTertiary,
                size: 18,
              })
            : icon}
          <Typography variant="body2" color="secondary" style={styles.title}>
            {title}
          </Typography>
          {action}
        </View>
        {children}
      </View>
    </List>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1 },
});
