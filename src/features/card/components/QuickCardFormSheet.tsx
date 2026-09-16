import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Sheet, TextField, Typography } from '@/ui/components';
import { DateRow } from './DateRow';

export interface QuickCardFormSheetProps {
  visible: boolean;
  boardTitle: string;
  stackTitle: string;
  onClose: () => void;
  onSubmit: (input: { title: string; duedate: number | null }) => void;
}

/**
 * The last step of the quick-add flow (spec §7.6): a bare card form — title
 * and an optional due date — scoped to whichever board/list
 * QuickAddCardFlow's picker step resolved. Unlike BoardFormSheet there is no
 * "edit" mode: every open is a new card, so re-seeding on `visible` always
 * clears back to blank rather than restoring a passed-in value.
 */
export function QuickCardFormSheet({
  visible,
  boardTitle,
  stackTitle,
  onClose,
  onSubmit,
}: QuickCardFormSheetProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [duedate, setDuedate] = useState<number | null>(null);

  useEffect(() => {
    if (visible) {
      setTitle('');
      setDuedate(null);
    }
  }, [visible]);

  const trimmed = title.trim();

  const handleSubmit = () => {
    if (!trimmed) return;
    onSubmit({ title: trimmed, duedate });
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={t('today.form.title')}>
      <Typography variant="caption" color="secondary">
        {`${boardTitle} › ${stackTitle}`}
      </Typography>
      <TextField
        testID="quick-title"
        placeholder={t('today.form.titlePlaceholder')}
        value={title}
        onChangeText={setTitle}
      />
      <DateRow
        label={t('today.form.due')}
        value={duedate}
        emptyLabel={t('today.form.noDue')}
        onChange={setDuedate}
      />
      <Button title={t('today.form.save')} onPress={handleSubmit} disabled={!trimmed} />
    </Sheet>
  );
}
