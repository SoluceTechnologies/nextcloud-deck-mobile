import { StyleSheet, View } from 'react-native';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { EnrichedMarkdownText } from 'react-native-enriched-markdown';
import { SquarePen } from 'lucide-react-native';

import { IconButton, Typography } from '@/ui/components';
import { toggleTaskAtIndex } from './toggleTaskAtIndex';
import { useMarkdownStyle } from './markdownStyle';

export interface DescriptionViewProps {
  markdown: string;
  onToggleTask: (next: string) => void;
  onEdit: () => void;
}

/**
 * Read-only rendering of a card's description plus the affordance that opens
 * the editor. Tapping a task checkbox toggles it through `toggleTaskAtIndex`
 * and reports the new document only when it actually changed; the card
 * screen turns that into a single `patch()` write, offline included — the
 * flagship behavior of this lot (spec §8).
 */
export function DescriptionView({ markdown, onToggleTask, onEdit }: DescriptionViewProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const markdownStyle = useMarkdownStyle();
  const empty = markdown.trim() === '';

  return (
    <View style={styles.row}>
      <View style={styles.content}>
        {empty ? (
          <Typography color="secondary">{t('card.noDescription')}</Typography>
        ) : (
          <EnrichedMarkdownText
            markdown={markdown}
            flavor="github"
            markdownStyle={markdownStyle}
            testID="description-markdown"
            onTaskListItemPress={(e) => {
              const next = toggleTaskAtIndex(markdown, e.index, e.checked);
              if (next !== markdown) onToggleTask(next);
            }}
          />
        )}
      </View>
      <IconButton testID="description-edit" accessibilityLabel={t('card.description')} onPress={onEdit}>
        <SquarePen size={18} color={colors.textTertiary} />
      </IconButton>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14 },
  content: { flex: 1 },
});
