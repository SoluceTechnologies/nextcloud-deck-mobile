import { useEffect } from 'react';
import dayjs from 'dayjs';
import i18n from '@/utils/i18n';
import { useSettingsStore } from '@/stores/settingsStore';
import { isSupported } from '@/utils/i18n';

export function useLanguageSync(): void {
  const language = useSettingsStore((s) => s.language);

  useEffect(() => {
    const lang = isSupported(language) ? language : 'en';
    i18n.changeLanguage(lang);
    dayjs.locale(lang);
  }, [language]);
}
