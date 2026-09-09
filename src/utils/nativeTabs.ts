import { Platform } from 'react-native';

export function nativeTabsEnabled(): boolean {
  return Platform.OS === 'ios' && parseInt(Platform.Version as string, 10) >= 26;
}
