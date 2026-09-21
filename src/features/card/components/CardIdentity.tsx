import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AnimatedPressable, List, TextField, Typography } from '@/ui/components';

interface CardIdentityProps {
  title: string;
  boardTitle: string;
  stackTitle: string;
  onChangeTitle: (title: string) => void;
}

/**
 * The card's heading: its title over a `board · stack` breadcrumb.
 *
 * At rest it is plain text, not a form field — a card screen should not open
 * looking like a form. Tapping it swaps in the input, which is still the same
 * commit-on-blur field it always was: local state, committed on blur rather
 * than per keystroke so editing doesn't enqueue a sync intent on every
 * character. The `title` prop re-seeds the field on a remote rename, but only
 * while the field isn't focused, so a sync landing mid-edit can't clobber what
 * the user is typing.
 */
export function CardIdentity({ title, boardTitle, stackTitle, onChangeTitle }: CardIdentityProps) {
  const [value, setValue] = useState(title);
  const [editing, setEditing] = useState(false);
  const [focused, setFocused] = useState(false);
  // Whether the user typed since the last reseed — a blur must only commit a
  // real edit, never the stale `value` a focused reseed skipped over (e.g. a
  // remote rename landing mid-focus, then an untouched blur).
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (!focused) {
      setValue(title);
      dirtyRef.current = false;
    }
  }, [title, focused]);

  const commit = () => {
    if (!dirtyRef.current) return;
    const trimmed = value.trim();
    if (trimmed && trimmed !== title) onChangeTitle(trimmed);
  };

  const breadcrumb = [boardTitle, stackTitle].filter(Boolean).join(' · ');

  return (
    <List ignoreBorder>
      <View style={styles.container}>
        {editing ? (
          <TextField
            testID="card-title-input"
            // Mounted by the tap that set `editing`, so it has to take the
            // caret itself — the tap landed on the text, not on the input.
            autoFocus
            value={value}
            onChangeText={(text) => {
              dirtyRef.current = true;
              setValue(text);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              commit();
              setEditing(false);
            }}
          />
        ) : (
          <AnimatedPressable
            testID="card-title"
            accessibilityRole="button"
            accessibilityLabel={title}
            scaleTo={0.99}
            onPress={() => setEditing(true)}
          >
            <Typography variant="h4">{title}</Typography>
          </AnimatedPressable>
        )}
        {breadcrumb ? (
          <Typography variant="caption" color="secondary">
            {breadcrumb}
          </Typography>
        ) : null}
      </View>
    </List>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 6 },
});
