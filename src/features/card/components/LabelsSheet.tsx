import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Check, Plus } from 'lucide-react-native';

import type Label from '@/database/models/Label';
import { PaletteRow } from '@/features/board/components/PaletteRow';
import { DECK_PALETTE } from '@/features/board/palette';
import { AnimatedPressable, Button, Icon, IconTile, Item, List, Sheet, TextField, Typography } from '@/ui/components';

export interface LabelsSheetProps {
  visible: boolean;
  boardLabels: Label[];
  selected: string[];
  onClose: () => void;
  onToggle: (labelId: string, checked: boolean) => void;
  onCreate: (input: { title: string; color: string | null }) => void;
}

export function LabelsSheet({ visible, boardLabels, selected, onClose, onToggle, onCreate }: LabelsSheetProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [color, setColor] = useState<string>(DECK_PALETTE[0]);

  const resetForm = () => {
    setCreating(false);
    setTitle('');
    setColor(DECK_PALETTE[0]);
  };

  const close = () => {
    resetForm();
    onClose();
  };

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    onCreate({ title: trimmed, color });
    resetForm();
  };

  return (
    <Sheet visible={visible} onClose={close} title={t('card.labels')}>
      {boardLabels.map((label) => {
        const checked = selected.includes(label.id);
        return (
          <AnimatedPressable
            key={label.id}
            testID={`label-row-${label.id}`}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            onPress={() => onToggle(label.id, !checked)}
            style={styles.row}
          >
            <View
              testID={`label-swatch-${label.id}`}
              style={[
                styles.swatch,
                label.color
                  ? { backgroundColor: label.color }
                  : { borderWidth: 1, borderColor: colors.border },
              ]}
            />
            <Typography style={styles.title}>{label.title}</Typography>
            {checked ? (
              <Icon size={20}>
                <Check color={colors.primary} />
              </Icon>
            ) : null}
          </AnimatedPressable>
        );
      })}

      {creating ? (
        <View style={styles.form}>
          <TextField
            testID="new-label-title"
            value={title}
            onChangeText={setTitle}
            placeholder={t('card.newLabel')}
          />
          <PaletteRow value={color} onSelect={setColor} />
          <Button title={t('card.create')} disabled={!title.trim()} onPress={submit} />
        </View>
      ) : (
        <List>
          <Item
            title={t('card.newLabel')}
            leading={<IconTile tint="primary"><Plus /></IconTile>}
            onPress={() => setCreating(true)}
          />
        </List>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
  swatch: { width: 24, height: 24, borderRadius: 12 },
  title: { flex: 1 },
  form: { gap: 12, paddingHorizontal: 16, paddingBottom: 8 },
});
