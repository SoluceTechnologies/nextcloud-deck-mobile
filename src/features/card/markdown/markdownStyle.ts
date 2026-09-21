import { useTheme } from 'expo-router';
import type { MarkdownStyle } from 'react-native-enriched-markdown';

/**
 * Theme-aware block styles for both description surfaces (spec §8 "styles
 * issus du thème de l'app"). Left unset, the library falls back to its own
 * hardcoded light palette (#1F2937 paragraphs, #111827 headings, light task
 * checkboxes and table chrome), which is close to invisible on the app's dark
 * background — so every block that carries a color of its own is listed here,
 * not just the ones a description usually contains.
 *
 * `EnrichedMarkdownTextInput`'s `markdownStyle` type only recognizes a
 * subset of these blocks (h1-h6, list, link, strong, em, spoiler) — the
 * blocks it doesn't apply (paragraph, blockquote, code, codeBlock, table)
 * are simply inert there, and the shared object still satisfies its type
 * since that shape is a structural subset of `MarkdownStyle`.
 */
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
    // The task checkboxes are the flagship interaction of this screen, and
    // they ship with a light-only ring and checkmark.
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
