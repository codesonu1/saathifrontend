import { Stack} from 'expo-router';
import React from 'react';

export default function DriverLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="registerVehicle" options={{ headerShown: false }} />
      <Stack.Screen name="accountRestoration" options={{ headerShown: false }} />
      <Stack.Screen name="registration" options={{ headerShown: false }} />
      <Stack.Screen name="driverSection" options={{ headerShown: false }} />
    </Stack>
    );
}
