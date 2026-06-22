import { Stack} from 'expo-router';
import React from 'react';

export default function TabLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="driverSelect" options={{ headerShown: false }} />
      <Stack.Screen name="rideRate" options={{ headerShown: false }} />
      <Stack.Screen name="rideOffers" options={{ headerShown: false }} />
    </Stack>
    );
}
