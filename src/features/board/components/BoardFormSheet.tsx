import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'expo-router';

import { AnimatedPressable, Button, Sheet, TextField } from '@/ui/components';
import { DECK_PALETTE } from '@/features/board/palette';

export interface BoardFormSheetProps {
  visible: boolean;
  initial?: { title: string; color: string | null };
  onClose: () => void;
  onSubmit: (input: { title: string; color: string | null }) => void;
}

export function BoardFormSheet({ visible, initial, onClose, onSubmit }: BoardFormSheetProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [title, setTitle] = useState('');
  const [color, setColor] = useState<string | null>(null);

  // Seed only when the sheet opens, not on every parent render — a live board
  // reference passed as `initial` would otherwise reset the user's typing.
  useEffect(() => {
    if (visible) {
      setTitle(initial?.title ?? '');
      setColor(initial?.color ?? null);
    }
  }, [visible]);

  const trimmed = title.trim();

  const handleSubmit = () => {
    if (!trimmed) return;
    onSubmit({ title: trimmed, color });
    onClose();
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t(initial ? 'boards.form.renameTitle' : 'boards.form.newTitle')}
    >
      <TextField
        placeholder={t('boards.form.titlePlaceholder')}
        value={title}
        onChangeText={setTitle}
      />
      <View style={styles.palette}>
        {DECK_PALETTE.map((hex) => {
          const selected = color === hex;
          return (
            <AnimatedPressable
              key={hex}
              testID={`color-swatch-${hex}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setColor(hex)}
              style={[
                styles.swatch,
                { backgroundColor: hex, borderColor: selected ? colors.text : 'transparent' },
              ]}
            />
          );
        })}
      </View>
      <Button title={t('boards.form.save')} onPress={handleSubmit} disabled={!trimmed} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingVertical: 8 },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 3 },
});
