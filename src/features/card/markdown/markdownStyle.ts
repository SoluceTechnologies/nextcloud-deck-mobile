import { useTheme } from 'expo-router';
import type { MarkdownStyle } from 'react-native-enriched-markdown';

export function useMarkdownStyle(): MarkdownStyle {
  const { colors } = useTheme();
  return {
    paragraph: { color: colors.text },
    h1: { color: colors.text },
    h2: { color: colors.text },
    h3: { color: colors.text },
    h4: { color: colors.text },
    h5: { color: colors.text },
    h6: { color: colors.text },
    list: { color: colors.text, bulletColor: colors.textSecondary, markerColor: colors.textSecondary },
    blockquote: {
      color: colors.textSecondary,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    code: { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border },
    codeBlock: { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border },
    strong: { color: colors.text },
    em: { color: colors.text },
    strikethrough: { color: colors.textSecondary },
    underline: { color: colors.text },
    thematicBreak: { color: colors.border },
    table: {
      color: colors.text,
      headerBackgroundColor: colors.surfaceRaised,
      headerTextColor: colors.text,
      rowEvenBackgroundColor: colors.background,
      rowOddBackgroundColor: colors.surface,
      borderColor: colors.border,
    },
    taskList: {
      borderColor: colors.textTertiary,
      checkedColor: colors.primary,
      checkmarkColor: colors.primaryText,
      checkedTextColor: colors.textSecondary,
    },
    highlight: { color: '#1a1a1a' },
    link: { color: colors.primary },
  };
}
