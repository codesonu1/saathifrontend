import { Stack, useRouter, usePathname } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import apiClient from '@/services/apiClient';

export default function DriverLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [isRegistered, setIsRegistered] = useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true;
    const verifyDriverRegistration = async () => {
      try {
        const response = await apiClient.get('driver-profile');
        const hasProfile = Boolean(response?.data?.data && (response.data.data._id || response.data.data.id));
        if (isMounted) {
          setIsRegistered(hasProfile);
          setChecking(false);
          
          // Protected driver routes that require completed registration
          const isProtectedDriverRoute = 
            pathname.includes('driverSection') || 
            pathname.includes('driverProfile') || 
            pathname.includes('earnings');

          if (!hasProfile && isProtectedDriverRoute) {
            console.log('[DriverLayout Guard] Unregistered driver attempted to access protected route:', pathname);
            router.replace('/(driver)/registration');
          }
        }
      } catch (error) {
        console.log('[DriverLayout Guard] Error checking driver profile:', error);
        if (isMounted) {
          setIsRegistered(false);
          setChecking(false);
          const isProtectedDriverRoute = 
            pathname.includes('driverSection') || 
            pathname.includes('driverProfile') || 
            pathname.includes('earnings');
          if (isProtectedDriverRoute) {
            router.replace('/(driver)/registration');
          }
        }
      }
    };

    verifyDriverRegistration();
    return () => { isMounted = false; };
  }, [pathname]);

  if (checking) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAF8FE' }}>
        <ActivityIndicator size="large" color="#BC001F" />
      </View>
    );
  }

  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="registerVehicle" options={{ headerShown: false }} />
      <Stack.Screen name="accountRestoration" options={{ headerShown: false }} />
      <Stack.Screen name="registration" options={{ headerShown: false }} />
      <Stack.Screen name="driverSection" options={{ headerShown: false }} />
      <Stack.Screen name="driverProfile" options={{ headerShown: false }} />
      <Stack.Screen name="earnings" options={{ headerShown: false }} />
    </Stack>
  );
}
