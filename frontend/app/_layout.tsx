import { LogBox } from 'react-native';
LogBox.ignoreAllLogs(true);

// Suppress useInsertionEffect react core warnings in Metro/console
const originalWarn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('useInsertionEffect')) return;
  originalWarn(...args);
};
const originalError = console.error;
console.error = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('useInsertionEffect')) return;
  originalError(...args);
};

import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useColorScheme } from '@/hooks/useColorScheme';
import React, { useEffect, useState } from 'react';
import { DriverRegistrationProvider } from '@/context/DriverRegistrationContext';
import { initializeApiClient } from '@/services/apiClient';
import { userRoleManager } from '@/services/userRoleManager';
import { View, ActivityIndicator } from 'react-native';
import InteractiveNotification from '../components/ui/InteractiveNotification';
import * as SplashScreen from 'expo-splash-screen';

// Prevent the native splash screen from auto-hiding at startup
SplashScreen.preventAutoHideAsync().catch(() => {});

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

  // Hide the native splash screen once resources are ready
  useEffect(() => {
    if (loaded && roleReady) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [loaded, roleReady]);

  if (!loaded || !roleReady) {
    return null; // Keep native splash showing
  }

  return (
    <SafeAreaProvider>
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
          <InteractiveNotification />
        </ThemeProvider>
      </DriverRegistrationProvider>
    </SafeAreaProvider>
  );
}
