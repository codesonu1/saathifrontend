import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, Dimensions, Platform, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ToastProps {
  visible: boolean;
  message: string;
  type: 'success' | 'error' | 'info';
  onHide: () => void;
  duration?: number;
}

const Toast: React.FC<ToastProps> = ({ 
  visible, 
  message, 
  type, 
  onHide, 
  duration = 3000 
}) => {
  const insets = useSafeAreaInsets();
  const topSafeOffset = insets.top > 0
    ? insets.top + (Platform.OS === 'android' ? 10 : 8)
    : (Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 10 : 48);

  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Show toast with smooth spring animation
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 40,
          friction: 8,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();

      // Hide toast after duration
      const timer = setTimeout(() => {
        hideToast();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [visible]);

  const hideToast = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -120,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setTimeout(onHide, 0);
    });
  };

  const getToastStyle = () => {
    switch (type) {
      case 'success':
        return {
          backgroundColor: '#10B981',
          icon: 'checkmark-circle',
          iconColor: '#FFFFFF',
        };
      case 'error':
        return {
          backgroundColor: '#EF4444',
          icon: 'close-circle',
          iconColor: '#FFFFFF',
        };
      case 'info':
        return {
          backgroundColor: '#3B82F6',
          icon: 'information-circle',
          iconColor: '#FFFFFF',
        };
      default:
        return {
          backgroundColor: '#6B7280',
          icon: 'information-circle',
          iconColor: '#FFFFFF',
        };
    }
  };

  const toastStyle = getToastStyle();

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          top: topSafeOffset,
          transform: [{ translateY }],
          opacity,
          backgroundColor: toastStyle.backgroundColor,
        },
      ]}
    >
      <View style={styles.content}>
        <Ionicons 
          name={toastStyle.icon as any} 
          size={20} 
          color={toastStyle.iconColor} 
        />
        <Text style={styles.message}>{message}</Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    maxWidth: 480,
    alignSelf: 'center',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 9999,
    zIndex: 99999,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  message: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
    marginLeft: 8,
    flex: 1,
  },
});

export default Toast; 