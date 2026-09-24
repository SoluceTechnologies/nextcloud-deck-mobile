import { useSettingsStore } from '../../src/stores/settingsStore';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

describe('settingsStore', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      themePreference: 'system',
      language: 'en',
    });
  });

  it('setLanguage updates the language', () => {
    useSettingsStore.getState().setLanguage('de');
    expect(useSettingsStore.getState().language).toBe('de');
  });

  it('setThemePreference updates the theme', () => {
    useSettingsStore.getState().setThemePreference('dark');
    expect(useSettingsStore.getState().themePreference).toBe('dark');
  });
});
