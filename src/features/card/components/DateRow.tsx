import { useState } from 'react';
import { Platform } from 'react-native';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { X } from 'lucide-react-native';

import { IconButton, Item, Typography } from '@/ui/components';

dayjs.extend(localizedFormat);

interface DateRowProps {
  label: string;
  value: number | null;
  emptyLabel: string;
  overdueLine?: string;
  onChange: (next: number | null) => void;
}

// Android has no combined date+time picker, so a chosen date re-opens a
// second picker for the time before either is committed; iOS does both in
// one step ('datetime'). 'closed' means neither is on screen.
type Stage = 'closed' | 'date' | 'time';

/** `time`'s hour/minute onto `date`'s year/month/day, not however the native picker merges them. */
function combine(date: Date, time: Date): Date {
  const merged = new Date(date);
  merged.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return merged;
}

/** A grouped-row date field: shows the value (or an empty state), an optional
 * danger-coloured line under it (the overdue call-out), and a clear control
 * that only appears once a date is set. Owns the native picker's open/close
 * state so the screen that renders it stays declarative. */
export function DateRow({ label, value, emptyLabel, overdueLine, onChange }: DateRowProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [stage, setStage] = useState<Stage>('closed');
  const [draftDate, setDraftDate] = useState<Date | null>(null);

  const close = () => {
    setStage('closed');
    setDraftDate(null);
  };

  const handleChange = (event: DateTimePickerEvent, picked?: Date) => {
    if (event.type === 'dismissed' || !picked) {
      close();
      return;
    }

    if (Platform.OS === 'android' && stage === 'date') {
      setDraftDate(picked);
      setStage('time');
      return;
    }

    const chosen = Platform.OS === 'android' && stage === 'time' && draftDate ? combine(draftDate, picked) : picked;
    onChange(chosen.getTime());
    close();
  };

  const description = value === null ? emptyLabel : dayjs(value).format('llll');

  return (
    <>
      <Item
        title={label}
        description={
          <>
            <Typography variant="caption" color="secondary">
              {description}
            </Typography>
            {overdueLine ? (
              <Typography variant="caption" color="danger">
                {overdueLine}
              </Typography>
            ) : null}
          </>
        }
        onPress={() => setStage('date')}
        trailing={
          value !== null ? (
            <IconButton testID="date-clear" accessibilityLabel={t('common.clear')} onPress={() => onChange(null)}>
              <X size={18} color={colors.textTertiary} />
            </IconButton>
          ) : undefined
        }
      />
      {stage !== 'closed' ? (
        <DateTimePicker
          value={Platform.OS === 'android' && stage === 'time' && draftDate ? draftDate : new Date(value ?? Date.now())}
          mode={Platform.OS === 'ios' ? 'datetime' : stage === 'time' ? 'time' : 'date'}
          onChange={handleChange}
        />
      ) : null}
    </>
  );
}
