import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Sheet, TextField } from '@/ui/components';

export interface StackFormSheetProps {
  visible: boolean;
  initial?: { title: string };
  /** Overrides the sheet title — the board screen reuses this sheet for "add
   * a card" as well as "add/rename a list", and each needs its own copy. */
  heading?: string;
  placeholder?: string;
  onClose: () => void;
  onSubmit: (input: { title: string }) => void;
}

export function StackFormSheet({
  visible,
  initial,
  heading,
  placeholder,
  onClose,
  onSubmit,
}: StackFormSheetProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');

  // Seed only when the sheet opens, not on every parent render — a live stack
  // reference passed as `initial` would otherwise reset the user's typing.
  useEffect(() => {
    if (visible) {
      setTitle(initial?.title ?? '');
    }
  }, [visible]);

  const trimmed = title.trim();

  const handleSubmit = () => {
    if (!trimmed) return;
    onSubmit({ title: trimmed });
    onClose();
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={heading ?? t(initial ? 'board.form.renameTitle' : 'board.form.newTitle')}
    >
      <TextField placeholder={placeholder ?? t('board.listTitle')} value={title} onChangeText={setTitle} />
      <Button title={t('board.form.save')} onPress={handleSubmit} disabled={!trimmed} />
    </Sheet>
  );
}
