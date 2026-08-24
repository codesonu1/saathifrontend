import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  StatusBar,
  Dimensions,
  Easing,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApiClient, refreshAccessToken, getAccessToken } from '@/services/apiClient';

const { width } = Dimensions.get('window');

const SplashScreen = () => {
  const router = useRouter();
  const screenOpacityAnim = useRef(new Animated.Value(1)).current;
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    const checkAuthAndNavigate = async () => {
      const startTime = Date.now();
      try {
        await initializeApiClient();

        const token = await AsyncStorage.getItem('accessToken');
        const role = await AsyncStorage.getItem('userRole');

        let targetRoute = '/login';
        if (token && role) {
          const refreshed = await refreshAccessToken();
          const validToken = refreshed || (await getAccessToken());
          if (validToken) {
            targetRoute = role === 'driver' ? '/(driver)' : '/(tabs)/';
          }
        }

        // Animated GIF intro splash duration: 3.5 seconds (3500ms) to complete GIF playback
        const elapsedTime = Date.now() - startTime;
        const remainingTime = 3500 - elapsedTime;
        if (remainingTime > 0) {
          await new Promise(resolve => setTimeout(resolve, remainingTime));
        }

        if (!isMountedRef.current) return;

        // Smooth 400ms exit fade out into solid white background
        Animated.timing(screenOpacityAnim, {
          toValue: 0,
          duration: 400,
          easing: Easing.out(Easing.ease),
          useNativeDriver: false,
        }).start(() => {
          if (isMountedRef.current) {
            router.replace(targetRoute as any);
          }
        });
      } catch (err) {
        console.error('SplashScreen error:', err);
        if (isMountedRef.current) {
          router.replace('/login');
        }
      }
    };

    checkAuthAndNavigate();

    return () => {
      isMountedRef.current = false;
    };
  }, [router, screenOpacityAnim]);

  return (
    <View style={styles.rootBackground}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" translucent />
      <Animated.View style={[styles.container, { opacity: screenOpacityAnim }]}>
        <View style={styles.gifContainer}>
          <Image
            source={require('../../assets/images/saathi_intro_animation.gif')}
            style={styles.gifAnimation}
            contentFit="contain"
            autoplay={true}
          />
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  rootBackground: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gifContainer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gifAnimation: {
    width: Math.min(width * 0.85, 360),
    height: Math.min(width * 0.85, 360),
  },
});

export default SplashScreen;