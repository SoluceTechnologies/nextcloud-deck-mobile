import React from 'react';
import { ChevronRight } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { useTheme } from 'expo-router';

import { Icon, Item, Typography } from '@/ui/components';

interface Props {
  title: string;
  description?: string;
  color?: string;
  icon: React.ReactNode;
  onPress: () => void;
  badge?: number;
}

function SettingsLinkImpl({ title, description, color, icon, onPress, badge }: Props) {
  const { colors } = useTheme();

  return (
    <Item
      onPress={onPress}
      leading={<Icon color={color ?? colors.primary} size={20}>{icon}</Icon>}
      title={title}
      description={description}
      trailing={
        <View style={styles.trailing}>
          {badge ? (
            <View testID="settings-link-badge" style={[styles.badge, { backgroundColor: colors.danger }]}>
              <Typography variant="caption" weight="700" style={styles.badgeText}>{String(badge)}</Typography>
            </View>
          ) : null}
          <ChevronRight size={20} color={colors.textTertiary} />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  trailing: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff' },
});

export const SettingsLink = React.memo(SettingsLinkImpl);
