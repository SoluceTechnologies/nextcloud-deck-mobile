import { useTheme } from 'expo-router';
import type { MarkdownStyle } from 'react-native-enriched-markdown';

/**
 * Theme-aware block styles for both description surfaces (spec §8 "styles
 * issus du thème de l'app"). Left unset, the library falls back to its own
 * hardcoded light palette (#1F2937 paragraphs, #111827 headings), which is
 * close to invisible on the app's dark background.
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
    list: { color: colors.text },
    blockquote: { color: colors.textSecondary },
    code: { color: colors.text, backgroundColor: colors.surface },
    codeBlock: { color: colors.text, backgroundColor: colors.surface },
    table: { color: colors.text },
    link: { color: colors.primary },
  };
}
