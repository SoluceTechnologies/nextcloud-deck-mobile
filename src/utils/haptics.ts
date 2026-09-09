import * as Haptics from 'expo-haptics';

import { useSettingsStore } from '@/stores/settingsStore';

export function haptic(
  style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light,
): void {
  if (!useSettingsStore.getState().hapticsEnabled) return;
  Haptics.impactAsync(style).catch(() => {});
}

export { ImpactFeedbackStyle } from 'expo-haptics';
