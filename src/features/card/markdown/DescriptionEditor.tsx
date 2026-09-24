import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  EnrichedMarkdownTextInput,
  type EnrichedMarkdownTextInputInstance,
} from 'react-native-enriched-markdown';
import {
  Bold,
  Check,
  Heading1,
  Heading2,
  Heading3,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  SquareCode,
  Strikethrough,
  X,
  type LucideIcon,
} from 'lucide-react-native';

import { IconButton, ScreenHeader, Typography, ViewContainer } from '@/ui/components';
import { canUseRichEditor } from './unsupportedBlocks';
import { RawMarkdownEditor } from './RawMarkdownEditor';
import { MarkdownToolbar } from './MarkdownToolbar';
import { useMarkdownStyle } from './markdownStyle';

export interface DescriptionEditorProps {
  visible: boolean;
  initial: string;
  onClose: () => void;
  onSave: (markdown: string) => void;
}

type RichAction = { id: string; Icon: LucideIcon; run: (ref: EnrichedMarkdownTextInputInstance) => void };
type MarkdownOnlyAction = { id: string; Icon: LucideIcon; snippet: string };

const RICH_GROUPS: ReadonlyArray<ReadonlyArray<RichAction>> = [
  [
    { id: 'bold', Icon: Bold, run: (r) => r.toggleBold() },
    { id: 'italic', Icon: Italic, run: (r) => r.toggleItalic() },
    { id: 'strike', Icon: Strikethrough, run: (r) => r.toggleStrikethrough() },
  ],
  [
    { id: 'h1', Icon: Heading1, run: (r) => r.toggleHeading(1) },
    { id: 'h2', Icon: Heading2, run: (r) => r.toggleHeading(2) },
    { id: 'h3', Icon: Heading3, run: (r) => r.toggleHeading(3) },
  ],
  [
    { id: 'ul', Icon: List, run: (r) => r.toggleUnorderedList() },
    { id: 'ol', Icon: ListOrdered, run: (r) => r.toggleOrderedList() },
    { id: 'indent', Icon: IndentIncrease, run: (r) => r.indentList() },
    { id: 'outdent', Icon: IndentDecrease, run: (r) => r.outdentList() },
  ],
];

const MARKDOWN_ONLY: ReadonlyArray<MarkdownOnlyAction> = [
  { id: 'task', Icon: ListTodo, snippet: '- [ ] ' },
  { id: 'quote', Icon: Quote, snippet: '> ' },
  { id: 'codeBlock', Icon: SquareCode, snippet: '```\n\n```' },
];

// No URL prompt in v0 — drop in a placeholder link the user edits in place.
const LINK_ACTION: RichAction = { id: 'link', Icon: Link, run: (r) => r.insertLink('link', 'https://') };

function appendBlock(markdown: string, snippet: string): string {
  const body = markdown.replace(/\s+$/, '');
  return body ? `${body}\n\n${snippet}` : snippet;
}

export function DescriptionEditor({ visible, initial, onClose, onSave }: DescriptionEditorProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const markdownStyle = useMarkdownStyle();
  const editorRef = useRef<EnrichedMarkdownTextInputInstance>(null);
  const [useRich, setUseRich] = useState(() => canUseRichEditor(initial));
  const [rawValue, setRawValue] = useState(initial);
  const [seed, setSeed] = useState(initial);

  useEffect(() => {
    if (visible) {
      setUseRich(canUseRichEditor(initial));
      setRawValue(initial);
      setSeed(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const finish = (markdown: string) => {
    if (markdown !== seed) onSave(markdown);
    onClose();
  };

  const switchToMarkdown = (snippet: string) => {
    editorRef.current
      ?.getMarkdown()
      .then((markdown) => {
        setRawValue(appendBlock(markdown, snippet));
        setUseRich(false);
      })
      .catch(() => undefined);
  };

  const run = (action: RichAction) => () => {
    if (editorRef.current) action.run(editorRef.current);
  };

  const richGroups = [
    ...RICH_GROUPS.map((group) => group.map((action) => ({ ...action, onPress: run(action) }))),
    [
      ...MARKDOWN_ONLY.map(({ id, Icon, snippet }) => ({ id, Icon, onPress: () => switchToMarkdown(snippet) })),
      { ...LINK_ACTION, onPress: run(LINK_ACTION) },
    ],
  ];

  const handleSave = () => {
    if (useRich) {
      editorRef.current
        ?.getMarkdown()
        .then(finish)
        .catch(() => undefined);
    } else {
      finish(rawValue);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}
      onRequestClose={onClose}
    >
      <ViewContainer>
        <SafeAreaView style={styles.flex}>
          <ScreenHeader
            title={t('card.description')}
            left={
              <IconButton
                testID="editor-close"
                variant="ghost"
                glass
                round
                size={40}
                accessibilityLabel={t('common.close')}
                onPress={onClose}
              >
                <X size={22} color={colors.text} />
              </IconButton>
            }
            right={
              <IconButton
                testID="editor-save"
                variant="ghost"
                glass
                round
                size={40}
                accessibilityLabel={t('card.save')}
                onPress={handleSave}
              >
                <Check size={22} color={colors.primary} />
              </IconButton>
            }
          />
          <KeyboardAvoidingView style={styles.flex} behavior="padding">
            {useRich ? (
              <>
                <MarkdownToolbar testIDPrefix="md" groups={richGroups} />
                <EnrichedMarkdownTextInput
                  key={visible ? 'open' : 'closed'}
                  ref={editorRef}
                  defaultValue={initial}
                  testID="rich-editor"
                  markdownStyle={markdownStyle}
                  cursorColor={colors.primary}
                  selectionColor={`${colors.primary}55`}
                  placeholderTextColor={colors.textTertiary}
                  style={{ ...styles.flex, ...styles.editor, color: colors.text }}
                />
              </>
            ) : (
              <>
                <Typography testID="raw-editor-notice" color="secondary" style={styles.notice}>
                  {t('card.rawEditorNotice')}
                </Typography>
                <RawMarkdownEditor value={rawValue} onChangeText={setRawValue} />
              </>
            )}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </ViewContainer>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  editor: { paddingHorizontal: 16, paddingTop: 12 },
  notice: { paddingHorizontal: 16, paddingBottom: 8 },
});
