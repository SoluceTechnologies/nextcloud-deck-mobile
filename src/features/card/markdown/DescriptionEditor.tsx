import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  EnrichedMarkdownTextInput,
  type EnrichedMarkdownTextInputInstance,
} from 'react-native-enriched-markdown';
import {
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link,
  List,
  ListOrdered,
  Strikethrough,
  X,
  type LucideIcon,
} from 'lucide-react-native';

import { Button, IconButton, ScreenHeader, Typography } from '@/ui/components';
import { canUseRichEditor } from './unsupportedBlocks';
import { RawMarkdownEditor } from './RawMarkdownEditor';
import { useMarkdownStyle } from './markdownStyle';

export interface DescriptionEditorProps {
  visible: boolean;
  initial: string;
  onClose: () => void;
  onSave: (markdown: string) => void;
}

const TOOLBAR: ReadonlyArray<{
  id: string;
  Icon: LucideIcon;
  run: (ref: EnrichedMarkdownTextInputInstance) => void;
}> = [
  { id: 'bold', Icon: Bold, run: (r) => r.toggleBold() },
  { id: 'italic', Icon: Italic, run: (r) => r.toggleItalic() },
  { id: 'strike', Icon: Strikethrough, run: (r) => r.toggleStrikethrough() },
  { id: 'h1', Icon: Heading1, run: (r) => r.toggleHeading(1) },
  { id: 'h2', Icon: Heading2, run: (r) => r.toggleHeading(2) },
  { id: 'h3', Icon: Heading3, run: (r) => r.toggleHeading(3) },
  { id: 'ul', Icon: List, run: (r) => r.toggleUnorderedList() },
  { id: 'ol', Icon: ListOrdered, run: (r) => r.toggleOrderedList() },
  // No URL prompt in v0 — drop in a placeholder link the user edits in place.
  { id: 'link', Icon: Link, run: (r) => r.insertLink('link', 'https://') },
];

/**
 * Full-screen description editor. It picks its editor once, from
 * `canUseRichEditor(initial)`, when the modal opens (spec §8 measure 2) and
 * never switches mid-edit — that would discard whatever the user has typed.
 * The decision (and the raw editor's draft) is re-seeded only on the
 * `visible` flip, matching StackFormSheet's "seed on open" idiom, never on a
 * later `initial` change while the sheet is still open.
 */
export function DescriptionEditor({ visible, initial, onClose, onSave }: DescriptionEditorProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const markdownStyle = useMarkdownStyle();
  const editorRef = useRef<EnrichedMarkdownTextInputInstance>(null);
  const [useRich, setUseRich] = useState(() => canUseRichEditor(initial));
  const [rawValue, setRawValue] = useState(initial);
  // The baseline "did anything change" is compared against, seeded once per
  // open alongside useRich/rawValue above — never the live `initial` prop,
  // which can move mid-edit (e.g. a sync patch arriving while the sheet is
  // open) and must not silently override whatever the user is editing.
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

  const handleSave = () => {
    if (useRich) {
      editorRef.current
        ?.getMarkdown()
        .then(finish)
        // A failed read should leave the draft on screen, not discard it.
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
      <SafeAreaView style={styles.flex}>
        <ScreenHeader
          title={t('card.description')}
          left={
            <IconButton testID="editor-close" accessibilityLabel={t('common.close')} onPress={onClose}>
              <X size={22} color={colors.text} />
            </IconButton>
          }
          right={<Button inline size="small" title={t('card.save')} onPress={handleSave} />}
        />
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          {useRich ? (
            <>
              <View style={styles.toolbar}>
                {TOOLBAR.map(({ id, Icon, run }) => (
                  <IconButton
                    key={id}
                    testID={`md-${id}`}
                    onPress={() => editorRef.current && run(editorRef.current)}
                  >
                    <Icon size={18} color={colors.text} />
                  </IconButton>
                ))}
              </View>
              <EnrichedMarkdownTextInput
                // `defaultValue` only applies at mount: the Modal keeps this
                // input mounted even while hidden, so without a key tied to
                // the open/close flip, canceling a draft and reopening would
                // resurface the abandoned text instead of `initial` — and an
                // immediate Save would then persist that stale draft.
                key={visible ? 'open' : 'closed'}
                ref={editorRef}
                defaultValue={initial}
                testID="rich-editor"
                markdownStyle={markdownStyle}
                style={{ ...styles.flex, color: colors.text }}
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingHorizontal: 12, paddingBottom: 8 },
  notice: { paddingHorizontal: 16, paddingBottom: 8 },
});
