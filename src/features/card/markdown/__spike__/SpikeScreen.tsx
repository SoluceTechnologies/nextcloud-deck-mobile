import { useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from 'expo-router';
import {
  EnrichedMarkdownText,
  EnrichedMarkdownTextInput,
  type EnrichedMarkdownTextInputInstance,
  type TaskListItemPressEvent,
} from 'react-native-enriched-markdown';

import { Button, Typography, ViewContainer } from '@/ui/components';

// §8 measure 1 — every markdown construct at risk in a round trip through the
// native editor. Kept verbatim from the task brief; do not edit without
// re-running the spike (see docs/v0/markdown-spike.md).
export const SPIKE_FIXTURE = [
  '# Heading',
  '',
  'Plain **bold** and *italic* and ~~struck~~ and `inline code`.',
  '',
  '- [ ] unchecked task',
  '- [x] checked task',
  '  - [ ] nested task',
  '',
  '1. ordered one',
  '2. ordered two',
  '',
  '> a block quote',
  '> spanning two lines',
  '',
  '```js',
  'const x = 1;',
  '```',
  '',
  '| a | b |',
  '| - | - |',
  '| 1 | 2 |',
  '',
  '[a link](https://example.com)',
].join('\n');

// One cheap substring probe per at-risk construct, so whoever runs the spike
// pastes the verdict into the doc instead of eyeballing a diff by hand.
const CONSTRUCTS: ReadonlyArray<{ label: string; needle: string }> = [
  { label: 'unchecked task marker', needle: '- [ ]' },
  { label: 'checked task marker', needle: '- [x]' },
  { label: 'nested task list', needle: '  - [ ]' },
  { label: 'table', needle: '| a | b |' },
  { label: 'code fence', needle: '```' },
  { label: 'block quote', needle: '> a block quote' },
  { label: 'inline code', needle: '`inline code`' },
  { label: 'link', needle: '[a link](https://example.com)' },
];

export function SpikeScreen() {
  const { colors } = useTheme();
  const ref = useRef<EnrichedMarkdownTextInputInstance>(null);
  const [output, setOutput] = useState<string | null>(null);
  // Every task-checkbox tap, in order: settles whether `index` counts in
  // document order across nesting (what `toggleTaskAtIndex` assumes) or
  // restarts per list. See step 5 in docs/v0/markdown-spike.md.
  const [taps, setTaps] = useState<TaskListItemPressEvent[]>([]);

  function handleRoundTrip() {
    ref.current
      ?.getMarkdown()
      .then(setOutput)
      .catch(() => undefined);
  }

  const equal = output !== null && output === SPIKE_FIXTURE;
  const lost = output === null ? [] : CONSTRUCTS.filter((c) => !output.includes(c.needle));

  return (
    <ViewContainer>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Typography variant="h4">Markdown round-trip spike</Typography>

          <Typography variant="title">Editor</Typography>
          <EnrichedMarkdownTextInput
            ref={ref}
            defaultValue={SPIKE_FIXTURE}
            multiline
            style={{
              minHeight: 220,
              borderWidth: 1,
              borderRadius: 8,
              padding: 8,
              borderColor: colors.border,
            }}
          />

          <Typography variant="title">Rendered (flavor=github)</Typography>
          <View style={[styles.box, { borderColor: colors.border }]}>
            <EnrichedMarkdownText
              markdown={SPIKE_FIXTURE}
              flavor="github"
              onTaskListItemPress={(e) => setTaps((t) => [...t, e])}
            />
          </View>

          <Typography variant="title">Task taps (index, checked, text)</Typography>
          <Text
            selectable
            style={[styles.mono, styles.box, { color: colors.text, borderColor: colors.border }]}
          >
            {taps.length === 0
              ? '(none yet)'
              : taps.map((e) => `${e.index} ${e.checked} ${e.text}`).join('\n')}
          </Text>

          <Button title="Round-trip" onPress={handleRoundTrip} />

          {output !== null ? (
            <>
              <Typography variant="title">Verdict</Typography>
              <Typography weight="700" color={equal ? 'primary' : 'danger'}>
                {equal ? 'EQUAL' : 'NOT EQUAL'}
              </Typography>
              <Text style={[styles.mono, { color: colors.text }]}>
                Lost constructs: {lost.length === 0 ? 'none' : lost.map((c) => c.label).join(', ')}
              </Text>

              <Typography variant="title">Input</Typography>
              <Text
                selectable
                style={[styles.mono, styles.box, { color: colors.text, borderColor: colors.border }]}
              >
                {SPIKE_FIXTURE}
              </Text>

              <Typography variant="title">Output</Typography>
              <Text
                selectable
                style={[styles.mono, styles.box, { color: colors.text, borderColor: colors.border }]}
              >
                {output}
              </Text>
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 12 },
  box: { borderWidth: 1, borderRadius: 8, padding: 8 },
  mono: {
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' }),
    fontSize: 12,
  },
});
