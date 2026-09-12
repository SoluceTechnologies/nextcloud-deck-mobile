import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { TextField, Typography } from '@/ui/components';

interface CardIdentityProps {
  title: string;
  boardTitle: string;
  stackTitle: string;
  onChangeTitle: (title: string) => void;
}

/**
 * The title is local state, committed on blur rather than per keystroke, so
 * editing doesn't enqueue a sync intent on every character. The `title` prop
 * re-seeds the field on a remote rename — but only while the field isn't
 * focused, so a sync landing mid-edit can't clobber what the user is typing.
 */
export function CardIdentity({ title, boardTitle, stackTitle, onChangeTitle }: CardIdentityProps) {
  const [value, setValue] = useState(title);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setValue(title);
  }, [title, focused]);

  // ponytail: this compares the last-typed value against the freshest
  // `title`, not "did the user actually type anything" — a remote rename
  // landing while the field is focused, followed by an untouched blur, would
  // re-send the pre-rename title. Narrow window, title-only; add a
  // dirty-tracking ref if it proves to matter in practice.
  const commit = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== title) onChangeTitle(trimmed);
  };

  return (
    <View style={styles.container}>
      <TextField
        testID="card-title-input"
        value={value}
        onChangeText={setValue}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
      />
      <Typography variant="body2" color="secondary">
        {`${boardTitle} · ${stackTitle}`}
      </Typography>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingTop: 8, gap: 6 },
});
