import { Fragment } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react-native';

import { Divider, IconButton } from '@/ui/components';

export type ToolbarAction = { id: string; Icon: LucideIcon; onPress: () => void };

export interface MarkdownToolbarProps {
  groups: ToolbarAction[][];
  testIDPrefix: string;
}

export function MarkdownToolbar({ groups, testIDPrefix }: MarkdownToolbarProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        contentContainerStyle={styles.bar}
      >
        {groups.map((group, index) => (
          <Fragment key={group[0]?.id ?? index}>
            {index > 0 ? <View style={[styles.groupDivider, { backgroundColor: colors.border }]} /> : null}
            {group.map(({ id, Icon, onPress }) => (
              <IconButton
                key={id}
                testID={`${testIDPrefix}-${id}`}
                variant="plain"
                size={34}
                accessibilityLabel={t(`card.format.${id}`)}
                onPress={onPress}
              >
                <Icon size={18} color={colors.text} />
              </IconButton>
            ))}
          </Fragment>
        ))}
      </ScrollView>
      <Divider />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { alignItems: 'center', gap: 2, paddingHorizontal: 12, paddingVertical: 6 },
  groupDivider: { width: StyleSheet.hairlineWidth, height: 20, marginHorizontal: 6 },
});
