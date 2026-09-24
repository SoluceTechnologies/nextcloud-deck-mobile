import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { legacyBackedStorage } from '@/stores/legacyStorage';
import { getInitialLanguage, type AppLanguage } from '@/utils/i18n';

export type ThemePreference = 'system' | 'light' | 'dark';

interface SettingsState {
  themePreference: ThemePreference;
  language: AppLanguage;
  hapticsEnabled: boolean;
  reduceMotion: boolean;
  setThemePreference: (pref: ThemePreference) => void;
  setLanguage: (lang: AppLanguage) => void;
  setHapticsEnabled: (v: boolean) => void;
  setReduceMotion: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      themePreference: 'system',
      language: getInitialLanguage(),
      hapticsEnabled: true,
      reduceMotion: false,
      setThemePreference: (pref) => set({ themePreference: pref }),
      setLanguage: (lang) => set({ language: lang }),
      setHapticsEnabled: (v) => set({ hapticsEnabled: v }),
      setReduceMotion: (v) => set({ reduceMotion: v }),
    }),
    {
      name: 'settings-store',
      version: 1,
      migrate: (persisted) => {
        return persisted as Partial<SettingsState> | undefined;
      },
      storage: createJSONStorage(() =>
        legacyBackedStorage(['themePreference', 'language'])
      ),
      partialize: (state) => ({
        themePreference: state.themePreference,
        language: state.language,
        hapticsEnabled: state.hapticsEnabled,
        reduceMotion: state.reduceMotion,
      }),
    }
  )
);
