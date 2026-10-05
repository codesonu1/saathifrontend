import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  DeviceEventEmitter,
  PanResponder,
  Platform,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { userRoleManager } from '@/services/userRoleManager';
import * as Haptics from 'expo-haptics';

export interface InteractiveNotificationData {
  title: string;
  message: string;
  type: string;
  role?: 'driver' | 'passenger';
  actionRoute?: string;
  actionParams?: Record<string, any>;
  duration?: number;
}

const InteractiveNotification: React.FC = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [data, setData] = useState<InteractiveNotificationData | null>(null);

  const slideAnim = useRef(new Animated.Value(-120)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const autoHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pan responder for swiping up to dismiss
  const pan = useRef(new Animated.ValueXY()).current;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 6;
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy < 8) {
          pan.y.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy < -25) {
          dismissNotification();
        } else {
          Animated.spring(pan.y, {
            toValue: 0,
            useNativeDriver: true,
            tension: 50,
            friction: 7,
          }).start();
        }
      },
    })
  ).current;

  const dismissNotification = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -120,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setVisible(false);
      setData(null);
    });
  };

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      'showInteractiveNotification',
      (notificationData: InteractiveNotificationData) => {
        const currentActiveRole = userRoleManager.getRole();
        if (notificationData.role && notificationData.role !== currentActiveRole) {
          return;
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        setData(notificationData);
        setVisible(true);
        pan.y.setValue(0);

        if (autoHideTimer.current) clearTimeout(autoHideTimer.current);

        Animated.parallel([
          Animated.spring(slideAnim, {
            toValue: 0,
            useNativeDriver: true,
            tension: 45,
            friction: 8,
          }),
          Animated.timing(opacityAnim, {
            toValue: 1,
            duration: 150,
            useNativeDriver: true,
          }),
        ]).start();

        const dur = notificationData.duration || 4500;
        autoHideTimer.current = setTimeout(() => {
          dismissNotification();
        }, dur);
      }
    );

    return () => {
      subscription.remove();
      if (autoHideTimer.current) clearTimeout(autoHideTimer.current);
    };
  }, []);

  const handleCardPress = () => {
    if (!data) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const targetRoute = data.actionRoute;
    const targetParams = data.actionParams;
    dismissNotification();

    if (targetRoute) {
      router.push({
        pathname: targetRoute as any,
        params: targetParams,
      });
    }
  };

  const getVisuals = (type?: string) => {
    switch (type) {
      case 'wallet_low':
        return { icon: 'alert-circle', color: '#D97706' };
      case 'wallet_zero':
        return { icon: 'alert-circle', color: '#DC2626' };
      case 'ride_completed':
        return { icon: 'checkmark-circle', color: '#16A34A' };
      case 'ride_cancelled':
        return { icon: 'close-circle', color: '#DC2626' };
      case 'message':
        return { icon: 'chatbubble-ellipses', color: '#6366F1' };
      default:
        return { icon: 'notifications', color: '#BC001F' };
    }
  };

  if (!visible || !data) return null;

  const visuals = getVisuals(data.type);
  const topSafeOffset =
    insets.top > 0
      ? insets.top + (Platform.OS === 'android' ? 6 : 4)
      : Platform.OS === 'android'
      ? (StatusBar.currentHeight || 24) + 6
      : 44;

  // Strip any accidental emojis from title/message
  const cleanTitle = (data.title || '').replace(/[\u{1F300}-\u{1FAFF}\u{1F600}-\u{1F64F}\u{2600}-\u{27BF}]/gu, '').trim();
  const cleanMessage = (data.message || '').replace(/[\u{1F300}-\u{1FAFF}\u{1F600}-\u{1F64F}\u{2600}-\u{27BF}]/gu, '').trim();

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          top: topSafeOffset,
          transform: [{ translateY: slideAnim }, { translateY: pan.y }],
          opacity: opacityAnim,
        },
      ]}
      {...panResponder.panHandlers}
    >
      <TouchableOpacity
        style={styles.container}
        onPress={handleCardPress}
        activeOpacity={0.92}
      >
        <View style={[styles.iconCircle, { backgroundColor: `${visuals.color}15` }]}>
          <Ionicons name={visuals.icon as any} size={18} color={visuals.color} />
        </View>

        <View style={styles.textContainer}>
          <Text style={styles.title} numberOfLines={1}>
            {cleanTitle}
          </Text>
          <Text style={styles.message} numberOfLines={1}>
            {cleanMessage}
          </Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

export default InteractiveNotification;

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 9999,
    alignItems: 'center',
  },
  container: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 5,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 1,
  },
  message: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },
});
