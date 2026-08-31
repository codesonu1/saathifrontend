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
  actionLabel?: string;
  actionRoute?: string;
  actionParams?: Record<string, any>;
  duration?: number;
}

const InteractiveNotification: React.FC = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [data, setData] = useState<InteractiveNotificationData | null>(null);
  
  const slideAnim = useRef(new Animated.Value(-200)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const autoHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pan responder for swiping up to dismiss
  const pan = useRef(new Animated.ValueXY()).current;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 10;
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy < 10) {
          pan.y.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy < -40) {
          dismissNotification();
        } else {
          Animated.spring(pan.y, {
            toValue: 0,
            useNativeDriver: true,
            tension: 40,
            friction: 5,
          }).start();
        }
      },
    })
  ).current;

  const dismissNotification = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -200,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 200,
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
          // Do not display notifications meant for the other mode
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
            tension: 35,
            friction: 7,
          }),
          Animated.timing(opacityAnim, {
            toValue: 1,
            duration: 180,
            useNativeDriver: true,
          }),
        ]).start();

        const dur = notificationData.duration || 5500;
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

  const handleActionPress = () => {
    if (!data) return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    dismissNotification();
    
    if (data.actionRoute) {
      router.push({
        pathname: data.actionRoute as any,
        params: data.actionParams,
      });
    }
  };

  const getHeaderDetails = (type?: string) => {
    switch (type) {
      case 'wallet_credit':
        return { icon: 'wallet-outline', color: '#2E7D32', label: 'WALLET CREDITED' };
      case 'wallet_low':
        return { icon: 'alert-circle-outline', color: '#D97706', label: 'LOW WALLET BALANCE' };
      case 'wallet_zero':
        return { icon: 'alert-circle', color: '#DC2626', label: 'ZERO WALLET BALANCE' };
      case 'wallet_debit':
        return { icon: 'receipt-outline', color: '#475569', label: 'WALLET DEBIT' };
      case 'ride_request':
        return { icon: 'car-outline', color: '#BC001F', label: 'NEW RIDE REQUEST' };
      case 'ride_accepted':
        return { icon: 'checkmark-circle-outline', color: '#2563EB', label: 'RIDE ACCEPTED' };
      case 'driver_arrived':
        return { icon: 'location-outline', color: '#059669', label: 'DRIVER ARRIVED' };
      case 'ride_started':
        return { icon: 'navigate-outline', color: '#2563EB', label: 'RIDE IN PROGRESS' };
      case 'ride_completed':
        return { icon: 'checkmark-done-outline', color: '#16A34A', label: 'RIDE COMPLETED' };
      case 'ride_cancelled':
        return { icon: 'close-circle-outline', color: '#DC2626', label: 'RIDE CANCELLED' };
      case 'rating_received':
      case 'rating_prompt':
        return { icon: 'star-outline', color: '#EAB308', label: 'RATING UPDATE' };
      case 'message':
        return { icon: 'chatbubble-ellipses-outline', color: '#6366F1', label: 'NEW MESSAGE' };
      default:
        return { icon: 'notifications-outline', color: '#64748B', label: 'NOTIFICATION' };
    }
  };

  if (!visible || !data) return null;

  const header = getHeaderDetails(data.type);
  const topSafeOffset = insets.top > 0 
    ? insets.top + (Platform.OS === 'android' ? 6 : 4) 
    : (Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 6 : 44);

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          top: topSafeOffset,
          transform: [
            { translateY: slideAnim },
            { translateY: pan.y }
          ],
          opacity: opacityAnim,
        },
      ]}
      {...panResponder.panHandlers}
    >
      <View style={styles.container}>
        {/* Header Row */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Ionicons name={header.icon as any} size={14} color={header.color} />
            <Text style={[styles.headerLabel, { color: header.color }]}>{header.label}</Text>
          </View>
          <Text style={styles.timeTag}>Just now</Text>
        </View>

        {/* Content Row */}
        <View style={styles.contentRow}>
          <View style={[styles.avatarCircle, { backgroundColor: `${header.color}15` }]}>
            <Ionicons name={header.icon as any} size={20} color={header.color} />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.title} numberOfLines={1}>
              {data.title}
            </Text>
            <Text style={styles.message} numberOfLines={2}>
              {data.message}
            </Text>
          </View>
        </View>

        {/* Action Row */}
        <View style={styles.actionRow}>
          <TouchableOpacity 
            style={styles.dismissButton} 
            onPress={dismissNotification}
            activeOpacity={0.7}
          >
            <Text style={styles.dismissText}>Dismiss</Text>
          </TouchableOpacity>
          
          {data.actionRoute && (
            <TouchableOpacity 
              style={[styles.actionButton, { backgroundColor: header.color }]} 
              onPress={handleActionPress}
              activeOpacity={0.85}
            >
              <Text style={styles.actionText}>{data.actionLabel || 'View'}</Text>
              <Ionicons name="chevron-forward" size={13} color="#FFF" style={{ marginLeft: 2 }} />
            </TouchableOpacity>
          )}
        </View>

        {/* Swipe Handle Pill */}
        <View style={styles.swipeIndicator} />
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 9999,
    alignItems: 'center',
  },
  container: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 5,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginLeft: 5,
  },
  timeTag: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '500',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  message: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 16,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  dismissButton: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    marginRight: 6,
  },
  dismissText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  swipeIndicator: {
    width: 28,
    height: 3,
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 4,
  },
});

export default InteractiveNotification;
