import { LogBox } from 'react-native';
LogBox.ignoreAllLogs(true);

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useColorScheme } from '@/hooks/useColorScheme';
import React, { useEffect, useState } from 'react';
import { DriverRegistrationProvider } from './DriverRegistrationContext';
import { initializeApiClient } from './utils/apiClient';
import { userRoleManager } from './utils/userRoleManager';
import { View, ActivityIndicator } from 'react-native';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });
  const [roleReady, setRoleReady] = useState(false);

  useEffect(() => {
    initializeApiClient();
    userRoleManager.init().then(() => setRoleReady(true));
  }, []);

  if (!loaded || !roleReady) {
    // Show a centered loading spinner while initializing
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#075B5E" />
      </View>
    );
  }

  return (
    <DriverRegistrationProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack initialRouteName="(auth)">
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(common)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="(driver)" options={{ headerShown: false }} />
          <Stack.Screen name="(regSteps)" options={{ headerShown: false }} />
          <Stack.Screen name="(vehDetails)" options={{ headerShown: false }} />  
          <Stack.Screen name="+not-found" />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </DriverRegistrationProvider>
  );
}
