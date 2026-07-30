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
import { initializeApiClient, refreshAccessToken, getAccessToken } from '@/services/apiClient';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';

const SplashScreen = () => {
  const router = useRouter();

  // Animations
  const contentFadeAnim = useRef(new Animated.Value(0)).current;
  const contentScaleAnim = useRef(new Animated.Value(0.85)).current;
  const screenOpacityAnim = useRef(new Animated.Value(1)).current;

  // Subtle breathing/pulsing animation for the S logo
  const breathingAnim = useRef(new Animated.Value(1)).current;

  // Sequential pulsing animation for loading dots
  const dot1Opacity = useRef(new Animated.Value(0.3)).current;
  const dot2Opacity = useRef(new Animated.Value(0.3)).current;
  const dot3Opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    // 0-0.5s Entrance animation for logo and brand title
    Animated.parallel([
      Animated.timing(contentFadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.spring(contentScaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    // Subtle continuous logo breathing effect
    Animated.loop(
      Animated.sequence([
        Animated.timing(breathingAnim, {
          toValue: 1.06,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(breathingAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Pulsing dots animation
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
  }, [contentFadeAnim, contentScaleAnim, breathingAnim, dot1Opacity, dot2Opacity, dot3Opacity]);

  useEffect(() => {
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
        
        // Professional mobile splash duration: 2.8 seconds (2800ms)
        const elapsedTime = Date.now() - startTime;
        const remainingTime = 2800 - elapsedTime;
        if (remainingTime > 0) {
          await new Promise(resolve => setTimeout(resolve, remainingTime));
        }

        // Smooth exit fade out before navigating
        Animated.timing(screenOpacityAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start(() => {
          router.replace(targetRoute as any);
        });
      } catch (err) {
        console.error('SplashScreen error:', err);
        router.replace('/login');
      }
    };
    checkAuthAndNavigate();
  }, [router, screenOpacityAnim]);

  return (
    <Animated.View style={[styles.container, { opacity: screenOpacityAnim }]}>
      <StatusBar barStyle="light-content" backgroundColor="#B90E2B" translucent />

      {/* Top Right Route/Node Watermark Illustration */}
      <View style={styles.topRightWatermark} pointerEvents="none">
        <Ionicons name="git-network-outline" size={260} color="rgba(255, 255, 255, 0.08)" />
      </View>

      {/* Bottom Left Map Watermark Illustration */}
      <View style={styles.bottomLeftWatermark} pointerEvents="none">
        <Ionicons name="map-outline" size={320} color="rgba(255, 255, 255, 0.07)" />
      </View>

      {/* Center Content with Entrance Animation */}
      <Animated.View 
        style={[
          styles.centerContent, 
          { 
            opacity: contentFadeAnim, 
            transform: [{ scale: contentScaleAnim }] 
          }
        ]}
      >
        {/* Circle Logo Badge */}
        <View style={styles.iconCircle}>
          <Animated.Image
            source={require('../../assets/images/SplashLogo.png')}
            style={{
              width: 54,
              height: 54,
              resizeMode: 'contain',
              transform: [{ scale: breathingAnim }],
            }}
          />
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
      </Animated.View>

      {/* Footer */}
      <View style={styles.footerContainer}>
        <Text style={styles.footerText}>Powered by Saathi Global © 2024</Text>
      </View>
    </Animated.View>
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