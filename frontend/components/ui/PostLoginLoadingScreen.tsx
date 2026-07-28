import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  SafeAreaView,
  StatusBar,
  Dimensions,
} from 'react-native';

const { width } = Dimensions.get('window');

interface PostLoginLoadingScreenProps {
  statusText?: string;
  chipText?: string;
}

const PostLoginLoadingScreen: React.FC<PostLoginLoadingScreenProps> = ({
  statusText = 'Finding your location...',
  chipText = 'Secure Connection Established',
}) => {
  // Radar ring rotation and pulse animations
  const spinValue = useRef(new Animated.Value(0)).current;
  const pulseValue = useRef(new Animated.Value(1)).current;

  // 3-Dot pulsing animation
  const dot1Opacity = useRef(new Animated.Value(0.3)).current;
  const dot2Opacity = useRef(new Animated.Value(0.3)).current;
  const dot3Opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    // 1. Radar continuous rotation loop
    Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 2000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    // 2. Subtle outer ring pulse loop
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseValue, {
          toValue: 1.15,
          duration: 1000,
          easing: Easing.ease,
          useNativeDriver: true,
        }),
        Animated.timing(pulseValue, {
          toValue: 1,
          duration: 1000,
          easing: Easing.ease,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // 3. Sequential 3-dot pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(dot1Opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(dot2Opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(dot3Opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.parallel([
          Animated.timing(dot1Opacity, {
            toValue: 0.3,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(dot2Opacity, {
            toValue: 0.3,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(dot3Opacity, {
            toValue: 0.3,
            duration: 300,
            useNativeDriver: true,
          }),
        ]),
      ])
    ).start();
  }, [spinValue, pulseValue, dot1Opacity, dot2Opacity, dot3Opacity]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />

      {/* Top Center Branding */}
      <View style={styles.topBranding}>
        <Text style={styles.brandTitle}>Saathi</Text>
        <Text style={styles.brandTagline}>MOVEMENT SIMPLIFIED</Text>
      </View>

      {/* Center Radar Loading Animation */}
      <View style={styles.centerSection}>
        <View style={styles.radarContainer}>
          {/* Animated Pulsing Outer Aura Ring */}
          <Animated.View
            style={[
              styles.radarPulseRing,
              { transform: [{ scale: pulseValue }] },
            ]}
          />

          {/* Rotating Main Radar Ring */}
          <Animated.View
            style={[
              styles.radarRing,
              { transform: [{ rotate: spin }] },
            ]}
          >
            <View style={styles.radarSweepDot} />
          </Animated.View>

          {/* Central Red Point */}
          <View style={styles.centerDot} />
        </View>

        {/* Status Text & 3 Dots */}
        <Text style={styles.statusText}>{statusText}</Text>
        <View style={styles.dotsRow}>
          <Animated.View style={[styles.dot, { opacity: dot1Opacity }]} />
          <Animated.View style={[styles.dot, { opacity: dot2Opacity }]} />
          <Animated.View style={[styles.dot, { opacity: dot3Opacity }]} />
        </View>
      </View>

      {/* Bottom Secure Connection Chip */}
      <View style={styles.bottomContainer}>
        <View style={styles.securityChip}>
          <Text style={styles.securityChipText}>{chipText}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA', // Off-white neutral canvas
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 40,
  },
  topBranding: {
    alignItems: 'center',
    marginTop: 30,
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#B7102A', // Energetic Red
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  brandTagline: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8F6F6E',
    letterSpacing: 2,
  },
  centerSection: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarContainer: {
    width: 120,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  radarPulseRing: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 1.5,
    borderColor: 'rgba(183, 16, 42, 0.15)',
    backgroundColor: 'rgba(183, 16, 42, 0.03)',
  },
  radarRing: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 3.5,
    borderColor: '#B7102A',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  radarSweepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#B7102A',
    marginTop: -4,
  },
  centerDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#B7102A',
  },
  statusText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#191C1D',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E4BEBC',
    marginHorizontal: 3,
  },
  bottomContainer: {
    marginBottom: 20,
  },
  securityChip: {
    backgroundColor: 'rgba(238, 238, 238, 0.75)',
    paddingVertical: 9,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(228, 190, 188, 0.4)',
  },
  securityChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DB313F',
    letterSpacing: 0.2,
  },
});

export default PostLoginLoadingScreen;
