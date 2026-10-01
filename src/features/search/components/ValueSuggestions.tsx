import React, { useState } from 'react';
import { Keyboard, Platform, StyleSheet, View } from 'react-native';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { ArrowLeft, ArrowRight, CornerDownLeft } from 'lucide-react-native';

import { Avatar, Item, List, Stack, Typography } from '@/ui/components';
import type { FilterKey, Resolved } from '../searchModel';
import type { Suggestion } from '../suggestions';

type Comparator = '<' | '>';

export type ValueSuggestionsProps = {
  pending: FilterKey;
  typed: string;
  suggestions: Suggestion[];
  onPick: (resolved: Resolved) => void;
  onUseTyped: () => void;
};

export function ValueSuggestions({ pending, typed, suggestions, onPick, onUseTyped }: ValueSuggestionsProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [picker, setPicker] = useState<Comparator | null>(null);
  const value = typed.trim();

  const openPicker = (comparator: Comparator) => {
    Keyboard.dismiss();
    setPicker(comparator);
  };

  const onPickDate = (event: DateTimePickerEvent, date?: Date) => {
    const comparator = picker;
    setPicker(null);
    if (event.type === 'dismissed' || !date || !comparator) return;
    const day = `${comparator}${dayjs(date).format('YYYY-MM-DD')}`;
    onPick({ value: day, label: day });
  };

  const rows = [
    value ? (
      <Item
        key="use"
        testID="suggestion-use"
        leading={<CornerDownLeft size={20} color={colors.textSecondary} />}
        title={t('search.use', { value })}
        onPress={onUseTyped}
      />
    ) : null,
    ...suggestions.map((suggestion) => (
      <Item
        key={`${suggestion.key}-${suggestion.value}`}
        testID={`suggestion-${suggestion.value}`}
        leading={<SuggestionLeading suggestion={suggestion} />}
        title={suggestion.key === 'date' ? t(`search.date.${suggestion.value}`) : suggestion.label}
        description={suggestion.detail}
        trailing={
          suggestion.key === 'date' ? (
            <Typography variant="caption" color="secondary">{`date: ${suggestion.value}`}</Typography>
          ) : undefined
        }
        onPress={() => onPick({ value: suggestion.value, label: suggestion.label, color: suggestion.color })}
      />
    )),
    pending === 'date' ? (
      <Item
        key="before"
        testID="suggestion-before"
        leading={<ArrowLeft size={20} color={colors.textSecondary} />}
        title={t('search.date.before')}
        onPress={() => openPicker('<')}
      />
    ) : null,
    pending === 'date' ? (
      <Item
        key="after"
        testID="suggestion-after"
        leading={<ArrowRight size={20} color={colors.textSecondary} />}
        title={t('search.date.after')}
        onPress={() => openPicker('>')}
      />
    ) : null,
  ].filter(Boolean);

  return (
    <Stack hAlign="stretch">
      {rows.length > 0 ? <List>{rows}</List> : null}
      {picker ? (
        <DateTimePicker
          value={new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={onPickDate}
        />
      ) : null}
    </Stack>
  );
}

function SuggestionLeading({ suggestion }: { suggestion: Suggestion }) {
  const { colors } = useTheme();
  if (suggestion.key === 'assigned') return <Avatar name={suggestion.label} size={28} />;
  return <View style={[styles.dot, { backgroundColor: suggestion.color ?? colors.border }]} />;
}

const styles = StyleSheet.create({
  dot: { width: 12, height: 12, borderRadius: 6, marginHorizontal: 8 },
});
