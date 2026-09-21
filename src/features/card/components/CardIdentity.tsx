import { useEffect, useRef, useState } from 'react';
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

  return (
    <View style={styles.container}>
      <TextField
        testID="card-title-input"
        value={value}
        onChangeText={(text) => {
          dirtyRef.current = true;
          setValue(text);
        }}
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
  container: { paddingTop: 8, gap: 8 },
});
