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
import AsyncStorage from '@react-native-async-storage/async-storage';
import webSocketService from '@/services/websocketService';
import notificationService from '@/services/notificationService';

// Global listener that keeps online drivers receiving ride offers on any app screen
function GlobalDriverListener() {
  useEffect(() => {
    let isMounted = true;
    let newRideListener: ((data: any) => void) | null = null;
    let offerAcceptedListener: ((data: any) => void) | null = null;

    const setupGlobalDriverSocket = async () => {
      try {
        const role = userRoleManager.getRole();
        const isOnline = await AsyncStorage.getItem('@saathi_driver_is_online');

        if (role === 'driver' && isOnline === 'true') {
          await webSocketService.connect(undefined, 'driver');

          if (!newRideListener) {
            newRideListener = (data: any) => {
              if (!isMounted) return;
              const ride = data?.data || data;
              const pickup = ride?.pickUp?.location || ride?.pickUpLocation || 'Nearby Passenger';
              const dropoff = ride?.dropOff?.location || ride?.dropOffLocation || 'Destination';
              const fare = ride?.offerPrice || ride?.fare || 150;

              notificationService.addNotification({
                type: 'ride_request',
                title: `🚗 New Ride Request: रू ${fare}`,
                message: `${pickup} ➔ ${dropoff}`,
                role: 'driver',
                actionRoute: '/(driver)/driverSection',
                actionParams: { rideId: ride?._id || ride?.id },
                showBanner: true,
                duration: 8500,
              });
            };
            webSocketService.on('newRideRequest', newRideListener, 'driver');
          }

          if (!offerAcceptedListener) {
            offerAcceptedListener = (data: any) => {
              if (!isMounted) return;
              const ride = data?.data?.ride || data?.ride || data?.data;
              notificationService.addNotification({
                type: 'ride_accepted',
                title: '🎉 Passenger Accepted Your Offer!',
                message: 'Tap to view live navigation to pickup.',
                role: 'driver',
                actionRoute: '/(common)/rideTracker',
                actionParams: { rideId: ride?._id || ride?.id },
                showBanner: true,
                duration: 8500,
              });
            };
            webSocketService.on('offerAccepted', offerAcceptedListener, 'driver');
          }
        }
      } catch (err) {
        console.log('[GlobalDriverListener] Setup error:', err);
      }
    };

    setupGlobalDriverSocket();
    const interval = setInterval(setupGlobalDriverSocket, 8000);

    return () => {
      isMounted = false;
      clearInterval(interval);
      if (newRideListener) webSocketService.off('newRideRequest', newRideListener, 'driver');
      if (offerAcceptedListener) webSocketService.off('offerAccepted', offerAcceptedListener, 'driver');
    };
  }, []);

  return null;
}

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
          <GlobalDriverListener />
          <InteractiveNotification />
        </ThemeProvider>
      </DriverRegistrationProvider>
    </SafeAreaProvider>
  );
}
