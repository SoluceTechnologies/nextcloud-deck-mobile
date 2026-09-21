import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Sheet, TextField } from '@/ui/components';
import { PaletteRow } from './PaletteRow';

export interface BoardFormSheetProps {
  visible: boolean;
  initial?: { title: string; color: string | null };
  onClose: () => void;
  onSubmit: (input: { title: string; color: string | null }) => void;
}

export function BoardFormSheet({ visible, initial, onClose, onSubmit }: BoardFormSheetProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [color, setColor] = useState<string | null>(null);

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
      <PaletteRow value={color} onSelect={setColor} />
      <Button title={t('boards.form.save')} onPress={handleSubmit} disabled={!trimmed} />
    </Sheet>
  );
}
