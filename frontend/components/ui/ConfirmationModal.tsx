import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet, Modal, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ConfirmationModalProps {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  type?: 'warning' | 'danger' | 'info';
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  visible,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  type = 'warning',
}) => {
  const scale = useRef(new Animated.Value(0.97)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(scale, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(scale, {
          toValue: 0.97,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 120,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const getTypeConfig = () => {
    switch (type) {
      case 'danger':
        return {
          icon: 'alert-circle',
          color: '#EF4444',
          bg: '#FEF2F2',
          borderColor: '#EF4444'
        };
      case 'info':
        return {
          icon: 'information-circle',
          color: '#3B82F6',
          bg: '#EFF6FF',
          borderColor: '#3B82F6'
        };
      default: // warning
        return {
          icon: 'warning',
          color: '#F59E0B',
          bg: '#FFFBEB',
          borderColor: '#F59E0B'
        };
    }
  };

  const { icon, color, bg, borderColor } = getTypeConfig();

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="none"
      onRequestClose={onCancel}
      statusBarTranslucent={true}
    >
      <StatusBar backgroundColor="rgba(0, 0, 0, 0.4)" barStyle="light-content" />
      <Animated.View style={[styles.overlay, { opacity }]}> 
        <Animated.View style={[styles.container, { transform: [{ scale }], borderColor }]}> 
          <View style={[styles.iconCircle, { backgroundColor: bg }]}>
            <Ionicons name={icon as any} size={28} color={color} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelButtonText}>{cancelText}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.confirmButton, { backgroundColor: color }]} onPress={onConfirm}>
              <Text style={styles.confirmButtonText}>{confirmText}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: StatusBar.currentHeight || 0,
  },
  container: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 24,
    paddingHorizontal: 20,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    justifyContent: 'space-between',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginRight: 6,
  },
  cancelButtonText: {
    color: '#374151',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  confirmButton: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginLeft: 6,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default ConfirmationModal; 