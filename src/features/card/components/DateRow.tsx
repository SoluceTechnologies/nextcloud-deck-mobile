import React, { useCallback, useRef, useState } from 'react';
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
  /** The row's leading glyph, so the caller decides the visual language. */
  icon?: React.ReactNode;
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
export function DateRow({ label, value, emptyLabel, overdueLine, icon, onChange }: DateRowProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [stage, setStage] = useState<Stage>('closed');
  const [draftDate, setDraftDate] = useState<Date | null>(null);
  // Seeded once when the row is pressed (see onPress below), not recomputed
  // on every render. `new Date(value ?? Date.now())` is only stable when
  // `value` is set; for an empty field it would otherwise mint a fresh
  // timestamp on every unrelated parent re-render while the picker is open,
  // which — independently of `onChange`'s identity (round 1) — is its own
  // entry in the Android picker effect's dependency array (`valueTimestamp`
  // in datetimepicker.android.js's `showOrUpdatePicker`) and re-opens it.
  const [seed, setSeed] = useState<Date | null>(null);

  // The screen that renders this row passes a fresh inline `onChange` on every
  // re-render (theme/navigation/sibling state changes, unrelated to this row).
  // Android's native picker re-opens itself whenever the `onChange` it was
  // given changes identity (see datetimepicker.android.js's `showOrUpdatePicker`
  // effect), so `handleChange` must NOT change identity for that reason. Reading
  // the latest `onChange` through a ref lets `handleChange` depend only on the
  // picker's own stage/draftDate below.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const handleChange = useCallback(
    (event: DateTimePickerEvent, picked?: Date) => {
      const close = () => {
        setStage('closed');
        setDraftDate(null);
        setSeed(null);
      };

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
      onChangeRef.current(chosen.getTime());
      close();
    },
    [stage, draftDate],
  );

  const description = value === null ? emptyLabel : dayjs(value).format('llll');

  return (
    <>
      <Item
        title={label}
        leading={icon}
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
        onPress={() => {
          setSeed(new Date(value ?? Date.now()));
          setStage('date');
        }}
        trailing={
          value !== null ? (
            <IconButton
              testID="date-clear"
              accessibilityLabel={t('common.clear')}
              onPress={() => onChangeRef.current(null)}
            >
              <X size={18} color={colors.textTertiary} />
            </IconButton>
          ) : undefined
        }
      />
      {stage !== 'closed' ? (
        <DateTimePicker
          value={stage === 'time' && draftDate ? draftDate : (seed ?? new Date(value ?? Date.now()))}
          mode={Platform.OS === 'ios' ? 'datetime' : stage === 'time' ? 'time' : 'date'}
          onChange={handleChange}
        />
      ) : null}
    </>
  );
}
