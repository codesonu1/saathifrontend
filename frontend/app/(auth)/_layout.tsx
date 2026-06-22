import { Stack } from 'expo-router';

export default function Layout() {
  return (
    <Stack screenOptions={{animation: 'fade_from_bottom'}}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="phoneLogin" options={{ headerShown: false }} />
      <Stack.Screen name="phoneRegister" options={{ headerShown: false }} />
      <Stack.Screen name="setup" options={{ headerShown: false }} />
      <Stack.Screen name="verify" options={{ headerShown: false }} />
    </Stack>
  );
}