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

type Stage = 'closed' | 'date' | 'time';

function combine(date: Date, time: Date): Date {
  const merged = new Date(date);
  merged.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return merged;
}

export function DateRow({ label, value, emptyLabel, overdueLine, icon, onChange }: DateRowProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [stage, setStage] = useState<Stage>('closed');
  const [draftDate, setDraftDate] = useState<Date | null>(null);
  const [seed, setSeed] = useState<Date | null>(null);

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
