import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  TouchableOpacity,
  DeviceEventEmitter,
  PanResponder,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');

export interface InteractiveNotificationData {
  title: string;
  message: string;
  type: 'ride_request' | 'ride_accepted' | 'message' | 'ride_completed' | 'info';
  actionLabel?: string;
  actionRoute?: string;
  actionParams?: Record<string, any>;
  duration?: number;
}

const InteractiveNotification: React.FC = () => {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [data, setData] = useState<InteractiveNotificationData | null>(null);
  
  const slideAnim = useRef(new Animated.Value(-200)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const autoHideTimer = useRef<NodeJS.Timeout | null>(null);

  // Pan responder for swiping up to dismiss
  const pan = useRef(new Animated.ValueXY()).current;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to vertical swipes
        return Math.abs(gestureState.dy) > 10;
      },
      onPanResponderMove: (_, gestureState) => {
        // Drag only upwards, limit downward dragging
        if (gestureState.dy < 10) {
          pan.y.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy < -50) {
          // Swiped up far enough: dismiss
          dismissNotification();
        } else {
          // Spring back to original position
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

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      'showInteractiveNotification',
      (notificationData: InteractiveNotificationData) => {
        // Trigger haptic feedback
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        
        setData(notificationData);
        setVisible(true);
        pan.y.setValue(0); // Reset drag position
        
        // Cancel any existing hide timers
        if (autoHideTimer.current) clearTimeout(autoHideTimer.current);

        // Slide down spring animation
        Animated.parallel([
          Animated.spring(slideAnim, {
            toValue: 0,
            useNativeDriver: true,
            tension: 30,
            friction: 7,
          }),
          Animated.timing(opacityAnim, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
        ]).start();

        // Set auto hide timer (default 6 seconds)
        const dur = notificationData.duration || 6000;
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

  const dismissNotification = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -200,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setVisible(false);
      setData(null);
    });
  };

  const handleActionPress = () => {
    if (!data) return;
    
    // Light haptic feedback on action click
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    dismissNotification();
    
    if (data.actionRoute) {
      router.push({
        pathname: data.actionRoute as any,
        params: data.actionParams,
      });
    }
  };

  if (!visible || !data) return null;

  // Determine icon & color based on type
  const getHeaderDetails = () => {
    switch (data.type) {
      case 'ride_request':
        return { icon: 'car-sport', color: '#10B981', label: 'NEW RIDE REQUEST' };
      case 'ride_accepted':
        return { icon: 'checkmark-done-circle', color: '#00B0FF', label: 'RIDE ACCEPTED' };
      case 'message':
        return { icon: 'chatbubble-ellipses', color: '#FF9800', label: 'NEW CHAT MESSAGE' };
      case 'ride_completed':
        return { icon: 'flag', color: '#4CAF50', label: 'TRIP COMPLETED' };
      default:
        return { icon: 'notifications', color: '#075B5E', label: 'SAATHI ALERT' };
    }
  };

  const header = getHeaderDetails();

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          transform: [
            { translateY: slideAnim },
            { translateY: pan.y } // Bind vertical drag gesture
          ],
          opacity: opacityAnim,
        },
      ]}
      {...panResponder.panHandlers}
    >
      <View style={styles.container}>
        {/* Top small header info row */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Ionicons name={header.icon as any} size={15} color={header.color} />
            <Text style={[styles.headerLabel, { color: header.color }]}>{header.label}</Text>
          </View>
          <Text style={styles.timeTag}>just now</Text>
        </View>

        {/* Content body row */}
        <View style={styles.contentRow}>
          <View style={[styles.avatarCircle, { backgroundColor: `${header.color}15` }]}>
            <Ionicons name={header.icon as any} size={22} color={header.color} />
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

        {/* Interactive Action Buttons Row */}
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
              activeOpacity={0.8}
            >
              <Text style={styles.actionText}>{data.actionLabel || 'View'}</Text>
              <Ionicons name="chevron-forward" size={14} color="#FFF" style={{ marginLeft: 2 }} />
            </TouchableOpacity>
          )}
        </View>

        {/* Swipe indicator bar at bottom */}
        <View style={styles.swipeIndicator} />
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 25,
    left: 12,
    right: 12,
    zIndex: 9999,
    alignItems: 'center',
  },
  container: {
    width: '100%',
    backgroundColor: '#0F1E1F', // Sleek dark teal/grey premium background
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
    paddingBottom: 6,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.8,
    marginLeft: 6,
  },
  timeTag: {
    fontSize: 9,
    color: '#889B9D',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 2,
  },
  message: {
    fontSize: 12,
    color: '#CFDFE0',
    lineHeight: 16,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 2,
  },
  dismissButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginRight: 8,
  },
  dismissText: {
    color: '#889B9D',
    fontSize: 12,
    fontWeight: '600',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  actionText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  swipeIndicator: {
    width: 32,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 6,
    marginBottom: -4,
  },
});

export default InteractiveNotification;
