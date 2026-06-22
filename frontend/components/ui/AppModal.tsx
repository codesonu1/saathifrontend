import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet, Dimensions, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface AppModalProps {
  visible: boolean;
  type: 'success' | 'error' | 'info';
  title?: string;
  message: string;
  onClose: () => void;
  actionText?: string;
  onAction?: () => void;
}

const { width, height } = Dimensions.get('window');

const iconMap = {
  success: { icon: 'checkmark-circle', color: '#10B981', bg: '#ECFDF5' },
  error: { icon: 'close-circle', color: '#EF4444', bg: '#FEE2E2' },
  info: { icon: 'information-circle', color: '#3B82F6', bg: '#DBEAFE' },
};

const AppModal: React.FC<AppModalProps> = ({
  visible,
  type,
  title,
  message,
  onClose,
  actionText,
  onAction,
}) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.95,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  const { icon, color, bg } = iconMap[type];

  return (
    <>
      <StatusBar backgroundColor="rgba(0, 0, 0, 0.35)" barStyle="light-content" />
      <Animated.View style={[styles.overlay, { opacity }]}>  
        <Animated.View style={[styles.modal, { transform: [{ scale }] }]}>  
          <View style={[styles.iconCircle, { backgroundColor: bg }]}>  
            <Ionicons name={icon as any} size={40} color={color} />
          </View>
          {title && <Text style={styles.title}>{title}</Text>}
          <Text style={styles.message}>{message}</Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>{actionText ? 'Close' : 'OK'}</Text>
            </TouchableOpacity>
            {actionText && onAction && (
              <TouchableOpacity style={[styles.actionButton, { backgroundColor: color }]} onPress={onAction}>
                <Text style={styles.actionButtonText}>{actionText}</Text>
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
      </Animated.View>
    </>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: width,
    height: height,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
    paddingTop: StatusBar.currentHeight || 0,
  },
  modal: {
    width: width * 0.8,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 16,
    color: '#374151',
    textAlign: 'center',
    marginBottom: 24,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    justifyContent: 'center',
  },
  closeButton: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  closeButtonText: {
    color: '#374151',
    fontWeight: '600',
    fontSize: 16,
  },
  actionButton: {
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 24,
    marginLeft: 8,
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});

export default AppModal; 