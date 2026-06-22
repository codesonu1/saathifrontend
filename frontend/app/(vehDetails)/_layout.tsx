import { Stack} from 'expo-router';
import React from 'react';

export default function DetailsLayout() {
  return (
    <Stack>
      <Stack.Screen name="vBillbook" options={{ headerShown: false }} />
      <Stack.Screen name="vBrand" options={{ headerShown: false }} />
      <Stack.Screen name="vPicture" options={{ headerShown: false }} />
      <Stack.Screen name="regPlate" options={{ headerShown: false }} />
    </Stack>
    );
}
