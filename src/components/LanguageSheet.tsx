import { useDeferredValue } from 'react';
import { View, StyleSheet } from 'react-native';
import CountryFlag from 'react-native-country-flag';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '@/stores/settingsStore';
import { Select, type SelectOption } from '@/ui/components';
import { LANGUAGES, type AppLanguage } from '@/utils/i18n';

function Flag({ code, size = 28 }: { code: AppLanguage; size?: number }) {
  const region = LANGUAGES.find((l) => l.code === code)?.region ?? 'US';
  return (
    <View style={[styles.flagCircle, { width: size, height: size, borderRadius: size / 2 }]}>
      <CountryFlag isoCode={region.toLowerCase()} size={size} />
    </View>
  );
}

export function LanguageSheet({ variant = 'row' }: { variant?: 'row' | 'icon' } = {}) {
  const { t } = useTranslation();
  const language = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);

  const deferredLanguage = useDeferredValue(language);
  const switching = language !== deferredLanguage;

  const options: SelectOption<AppLanguage>[] = LANGUAGES.map((l) => ({
    value: l.code,
    label: l.label,
    hint: `(${l.region})`,
    leading: (size) => <Flag code={l.code} size={size} />,
  }));

  return (
    <Select<AppLanguage>
      value={language}
      options={options}
      onChange={setLanguage}
      variant={variant}
      glass={variant === 'icon'}
      busy={switching}
      accessibilityLabel={t('common.language')}
      icon={() => <Flag code={language} size={26} />}
    />
  );
}

const styles = StyleSheet.create({
  flagCircle: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
});
