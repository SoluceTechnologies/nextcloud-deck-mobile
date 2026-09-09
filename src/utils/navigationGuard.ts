import type { useRouter } from 'expo-router';

export function goBackOrHome(router: ReturnType<typeof useRouter>): void {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/calendar');
}

export function createNavigationGuard(windowMs = 700) {
  let last = -Infinity;
  return (action: () => void): void => {
    const now = Date.now();
    if (now - last < windowMs) return;
    last = now;
    action();
  };
}
