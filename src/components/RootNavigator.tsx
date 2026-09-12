import { Stack } from 'expo-router';

export function RootNavigator() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="card/[id]" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
