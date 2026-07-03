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
        
        if (token && role) {
          console.log('SplashScreen: Stored token and role found. Refreshing token...');
          const refreshed = await refreshAccessToken();
          console.log('SplashScreen: Token refresh result:', refreshed);
          const validToken = refreshed || (await getAccessToken());
          if (validToken) {
            if (role === 'driver') {
              console.log('SplashScreen: Navigating to Driver dashboard...');
              router.replace('/(driver)');
            } else {
              console.log('SplashScreen: Navigating to Passenger dashboard...');
              router.replace('/(tabs)');
            }
            return;
          }
        }
        console.log('SplashScreen: No valid session. Navigating to Login...');
        router.replace('/login');
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
        <ActivityIndicator size="large" color="#00809D" />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
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
    color: '#000',
    marginTop: 10,
  },
  tagline: {
    fontSize: 16,
    color: '#000',
    marginBottom: 20,
  },
  loadingContainer: {
    position: 'absolute',
    bottom: 40,
    alignItems: 'center',
  },
});

export default SplashScreen;