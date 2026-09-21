import { Stack } from 'expo-router';

/**
 * The screen that belongs under any board opened directly, so a deep link to
 * `/boards/<id>` still has the board list to go back to.
 *
 * This covers deep links and reloads only. During in-app navigation the route
 * being navigated to becomes the anchor itself, so a push from another tab has
 * to ask for the list explicitly with `withAnchor: true` — see the Today and
 * Search screens.
 */
export const unstable_settings = { anchor: 'index' };

export default function BoardsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
