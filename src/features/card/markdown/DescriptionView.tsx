import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { EnrichedMarkdownText } from 'react-native-enriched-markdown';
import { AlignLeft, SquarePen } from 'lucide-react-native';

import { AnimatedPressable, IconButton, Typography } from '@/ui/components';
import { SectionCard } from '@/features/card/components/SectionCard';
import { toggleTaskAtIndex } from './toggleTaskAtIndex';
import { useMarkdownStyle } from './markdownStyle';

export interface DescriptionViewProps {
  markdown: string;
  onToggleTask: (next: string) => void;
  onEdit: () => void;
}

export function DescriptionView({ markdown, onToggleTask, onEdit }: DescriptionViewProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const markdownStyle = useMarkdownStyle();
  const empty = markdown.trim() === '';

  return (
    <SectionCard
      icon={<AlignLeft />}
      title={t('card.description')}
      action={
        <IconButton
          testID="description-edit"
          accessibilityLabel={t('card.description')}
          size={32}
          onPress={onEdit}
        >
          <SquarePen size={18} color={colors.textTertiary} />
        </IconButton>
      }
    >
      {empty ? (
        <AnimatedPressable testID="description-empty" onPress={onEdit} scaleTo={0.99}>
          <Typography color="secondary">{t('card.addDescription')}</Typography>
        </AnimatedPressable>
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
    </SectionCard>
  );
}


