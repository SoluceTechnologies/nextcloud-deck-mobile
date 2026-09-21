import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AnimatedPressable, List, TextField, Typography } from '@/ui/components';

interface CardIdentityProps {
  title: string;
  boardTitle: string;
  stackTitle: string;
  onChangeTitle: (title: string) => void;
}

export function CardIdentity({ title, boardTitle, stackTitle, onChangeTitle }: CardIdentityProps) {
  const [value, setValue] = useState(title);
  const [editing, setEditing] = useState(false);
  const [focused, setFocused] = useState(false);
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
