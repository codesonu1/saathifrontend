import { Stack} from 'expo-router';
import React from 'react';

export default function CommonLayout() {
  return (
    <Stack>
      <Stack.Screen name="homeScreen" options={{ headerShown: false }} />
      <Stack.Screen name="rideHistory" options={{ headerShown: false }} />
      <Stack.Screen name="profile" options={{ headerShown: false }} />
      <Stack.Screen name="sidepanel" options={{ headerShown: false }} />
      <Stack.Screen name="notifications" options={{ headerShown: false }} />
      <Stack.Screen name="support" options={{ headerShown: false }} />
      <Stack.Screen name="messaging" options={{ headerShown: false }} />
      <Stack.Screen name="rideDetails" options={{ headerShown: false }} />
      <Stack.Screen name="rideTracker" options={{ headerShown: false }} />
    </Stack>
    );
}
