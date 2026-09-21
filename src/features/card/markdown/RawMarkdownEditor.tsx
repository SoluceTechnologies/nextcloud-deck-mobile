import { useState } from 'react';
import { Platform, StyleSheet, TextInput, View, type TextInputSelectionChangeEvent } from 'react-native';
import { useTheme } from 'expo-router';
import { Bold, Code, Heading1, Italic, Link, List, ListTodo, type LucideIcon } from 'lucide-react-native';

import { IconButton } from '@/ui/components';

export interface RawMarkdownEditorProps {
  value: string;
  onChangeText: (text: string) => void;
}

const SNIPPETS: ReadonlyArray<{ id: string; Icon: LucideIcon; insert: string }> = [
  { id: 'bold', Icon: Bold, insert: '**bold**' },
  { id: 'italic', Icon: Italic, insert: '_italic_' },
  { id: 'h1', Icon: Heading1, insert: '# ' },
  { id: 'ul', Icon: List, insert: '- ' },
  { id: 'task', Icon: ListTodo, insert: '- [ ] ' },
  { id: 'code', Icon: Code, insert: '``' },
  { id: 'link', Icon: Link, insert: '[text](url)' },
];

export function RawMarkdownEditor({ value, onChangeText }: RawMarkdownEditorProps) {
  const { colors } = useTheme();
  const [selection, setSelection] = useState({ start: value.length, end: value.length });

  const insert = (snippet: string) => {
    const { start, end } = selection;
    onChangeText(value.slice(0, start) + snippet + value.slice(end));
    const caret = start + snippet.length;
    setSelection({ start: caret, end: caret });
  };

  const handleSelectionChange = (e: TextInputSelectionChangeEvent) => {
    setSelection(e.nativeEvent.selection);
  };

  return (
    <View style={styles.container}>
      <TextInput
        testID="raw-editor"
        style={[
          styles.input,
          { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
        ]}
        value={value}
        onChangeText={onChangeText}
        onSelectionChange={handleSelectionChange}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        textAlignVertical="top"
      />
      <View style={styles.bar}>
        {SNIPPETS.map(({ id, Icon, insert: snippet }) => (
          <IconButton key={id} testID={`raw-${id}`} onPress={() => insert(snippet)}>
            <Icon size={16} color={colors.text} />
          </IconButton>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingBottom: 8 },
  input: {
    flex: 1,
    padding: 12,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    fontSize: 14,
    borderWidth: 1,
    borderRadius: 8,
  },
  bar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 8 },
});
