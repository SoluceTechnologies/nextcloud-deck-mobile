import { useState } from 'react';
import { Platform, StyleSheet, TextInput, View, type TextInputSelectionChangeEvent } from 'react-native';
import { useTheme } from 'expo-router';
import {
  Bold, Code, Heading1, Heading2, Heading3, Italic, Link, List, ListOrdered, ListTodo, Quote,
  SquareCode, Strikethrough, type LucideIcon,
} from 'lucide-react-native';

import { MarkdownToolbar } from './MarkdownToolbar';

export interface RawMarkdownEditorProps {
  value: string;
  onChangeText: (text: string) => void;
}

type Snippet = { id: string; Icon: LucideIcon; insert: string; block?: boolean };

const SNIPPET_GROUPS: ReadonlyArray<ReadonlyArray<Snippet>> = [
  [
    { id: 'bold', Icon: Bold, insert: '**bold**' },
    { id: 'italic', Icon: Italic, insert: '_italic_' },
    { id: 'strike', Icon: Strikethrough, insert: '~~text~~' },
  ],
  [
    { id: 'h1', Icon: Heading1, insert: '# ', block: true },
    { id: 'h2', Icon: Heading2, insert: '## ', block: true },
    { id: 'h3', Icon: Heading3, insert: '### ', block: true },
  ],
  [
    { id: 'ul', Icon: List, insert: '- ', block: true },
    { id: 'ol', Icon: ListOrdered, insert: '1. ', block: true },
    { id: 'task', Icon: ListTodo, insert: '- [ ] ', block: true },
  ],
  [
    { id: 'quote', Icon: Quote, insert: '> ', block: true },
    { id: 'code', Icon: Code, insert: '`code`' },
    { id: 'codeBlock', Icon: SquareCode, insert: '```\n\n```' },
  ],
  [{ id: 'link', Icon: Link, insert: '[text](url)' }],
];

export function RawMarkdownEditor({ value, onChangeText }: RawMarkdownEditorProps) {
  const { colors } = useTheme();
  const [selection, setSelection] = useState({ start: value.length, end: value.length });

  const insert = ({ insert: snippet, block }: Snippet) => {
    const { start, end } = selection;
    const at = block ? value.lastIndexOf('\n', start - 1) + 1 : start;
    const next = block
      ? value.slice(0, at) + snippet + value.slice(at)
      : value.slice(0, start) + snippet + value.slice(end);
    onChangeText(next);
    const caret = block ? end + snippet.length : start + snippet.length;
    setSelection({ start: caret, end: caret });
  };

  const handleSelectionChange = (e: TextInputSelectionChangeEvent) => {
    setSelection(e.nativeEvent.selection);
  };

  return (
    <View style={styles.container}>
      <MarkdownToolbar
        testIDPrefix="raw"
        groups={SNIPPET_GROUPS.map((group) =>
          group.map((snippet) => ({ id: snippet.id, Icon: snippet.Icon, onPress: () => insert(snippet) })),
        )}
      />
      <TextInput
        testID="raw-editor"
        style={[styles.input, { color: colors.text }]}
        value={value}
        onChangeText={onChangeText}
        onSelectionChange={handleSelectionChange}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        textAlignVertical="top"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  input: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    fontSize: 14,
  },
});
