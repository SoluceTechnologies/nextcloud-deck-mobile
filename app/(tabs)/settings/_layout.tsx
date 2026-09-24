import { useEffect } from 'react';
import { Stack, useNavigation } from 'expo-router';

export default function SettingsLayout() {
  const navigation = useNavigation();

  useEffect(() => {
    return navigation.addListener('blur', () => {
      const state = navigation.getState();
      const settingsRoute = state?.routes?.find((r) => r.name === 'settings');
      const nested = settingsRoute?.state as { key?: string; index?: number } | undefined;

      if (!nested?.key || !nested.index) return;
      navigation.dispatch({
        type: 'RESET',
        target: nested.key,
        payload: { index: 0, routes: [{ name: 'index' }] },
      });
    });
  }, [navigation]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
