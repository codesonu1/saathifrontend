import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  StatusBar,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApiClient, refreshAccessToken, getAccessToken } from '../utils/apiClient';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';

const SplashScreen = () => {
  const router = useRouter();

  // Sequential pulsing animation for the 3 loading dots
  const dot1Opacity = useRef(new Animated.Value(0.3)).current;
  const dot2Opacity = useRef(new Animated.Value(0.3)).current;
  const dot3Opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animateDots = () => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(dot1Opacity, {
            toValue: 1,
            duration: 350,
            useNativeDriver: true,
          }),
          Animated.timing(dot2Opacity, {
            toValue: 1,
            duration: 350,
            useNativeDriver: true,
          }),
          Animated.timing(dot3Opacity, {
            toValue: 1,
            duration: 350,
            useNativeDriver: true,
          }),
          Animated.parallel([
            Animated.timing(dot1Opacity, {
              toValue: 0.3,
              duration: 350,
              useNativeDriver: true,
            }),
            Animated.timing(dot2Opacity, {
              toValue: 0.3,
              duration: 350,
              useNativeDriver: true,
            }),
            Animated.timing(dot3Opacity, {
              toValue: 0.3,
              duration: 350,
              useNativeDriver: true,
            }),
          ]),
        ])
      ).start();
    };

    animateDots();
  }, [dot1Opacity, dot2Opacity, dot3Opacity]);

  useEffect(() => {
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
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#B90E2B" translucent />

      {/* Top Right Route/Node Watermark Illustration */}
      <View style={styles.topRightWatermark} pointerEvents="none">
        <Ionicons name="git-network-outline" size={260} color="rgba(255, 255, 255, 0.08)" />
      </View>

      {/* Bottom Left Map Watermark Illustration */}
      <View style={styles.bottomLeftWatermark} pointerEvents="none">
        <Ionicons name="map-outline" size={320} color="rgba(255, 255, 255, 0.07)" />
      </View>

      {/* Center Content */}
      <View style={styles.centerContent}>
        {/* Circle Car Badge */}
        <View style={styles.iconCircle}>
          <MaterialIcons name="directions-car" size={38} color="#B90E2B" />
        </View>

        {/* Brand Name */}
        <Text style={styles.brandTitle}>Saathi</Text>

        {/* Loading Indicator & Subtitle */}
        <View style={styles.loaderSection}>
          <View style={styles.dotsRow}>
            <Animated.View style={[styles.dot, { opacity: dot1Opacity }]} />
            <Animated.View style={[styles.dot, { opacity: dot2Opacity }]} />
            <Animated.View style={[styles.dot, { opacity: dot3Opacity }]} />
          </View>
          <Text style={styles.subtitle}>EFFORTLESS MOVEMENT</Text>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footerContainer}>
        <Text style={styles.footerText}>Powered by Saathi Global © 2024</Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#B90E2B', // Google Stitch splash deep rich red
    justifyContent: 'center',
    alignItems: 'center',
  },
  topRightWatermark: {
    position: 'absolute',
    top: -50,
    right: -40,
    transform: [{ rotate: '25deg' }],
  },
  bottomLeftWatermark: {
    position: 'absolute',
    bottom: 60,
    left: -60,
    transform: [{ rotate: '-12deg' }],
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  iconCircle: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
    marginBottom: 20,
  },
  brandTitle: {
    fontSize: 44,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
    marginBottom: 34,
  },
  loaderSection: {
    alignItems: 'center',
    marginTop: 10,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#FFFFFF',
    marginHorizontal: 4,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.75)',
    letterSpacing: 2.5,
  },
  footerContainer: {
    position: 'absolute',
    bottom: 36,
    alignSelf: 'center',
  },
  footerText: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.6)',
  },
});

export default SplashScreen;