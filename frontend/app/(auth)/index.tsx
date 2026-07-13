import React from 'react';
import { View, Image, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApiClient, refreshAccessToken, getAccessToken } from '../utils/apiClient';

const SplashScreen = () => {
  const router = useRouter();

  React.useEffect(() => {
    const checkAuthAndNavigate = async () => {
      console.log('SplashScreen: Starting checkAuthAndNavigate...');
      const startTime = Date.now();
      try {
        console.log('SplashScreen: Initializing API Client...');
        await initializeApiClient();
        console.log('SplashScreen: API Client Initialized.');
        
        console.log('SplashScreen: Fetching token from AsyncStorage...');
        const token = await AsyncStorage.getItem('accessToken');
        console.log('SplashScreen: Token fetched:', token);
        
        console.log('SplashScreen: Fetching role from AsyncStorage...');
        const role = await AsyncStorage.getItem('userRole');
        console.log('SplashScreen: Role fetched:', role);
        
        let targetRoute = '/login';
        if (token && role) {
          console.log('SplashScreen: Stored token and role found. Refreshing token...');
          const refreshed = await refreshAccessToken();
          console.log('SplashScreen: Token refresh result:', refreshed);
          const validToken = refreshed || (await getAccessToken());
          if (validToken) {
            targetRoute = role === 'driver' ? '/(driver)' : '/(tabs)';
          }
        }
        
        // Enforce a minimum display time of 1.8 seconds (1800ms) for a premium experience
        const elapsedTime = Date.now() - startTime;
        const remainingTime = 1800 - elapsedTime;
        if (remainingTime > 0) {
          await new Promise(resolve => setTimeout(resolve, remainingTime));
        }

        console.log('SplashScreen: Navigating to target:', targetRoute);
        router.replace(targetRoute as any);
      } catch (err) {
        console.error('SplashScreen: Error in checkAuthAndNavigate:', err);
        router.replace('/login');
      }
    };
    checkAuthAndNavigate();
  }, [router]);

  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/images/logotra.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      <Text style={styles.title}>Saathi</Text>
      <Text style={styles.tagline}>Your Ride, Your Way</Text>
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#075B5E', // Brand teal background
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 200,
    height: 100,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff', // White title text
    marginTop: 10,
  },
  tagline: {
    fontSize: 16,
    color: '#ffffff', // White tagline text
    opacity: 0.85,
    marginBottom: 20,
  },
  loadingContainer: {
    position: 'absolute',
    bottom: 40,
    alignItems: 'center',
  },
});

export default SplashScreen;