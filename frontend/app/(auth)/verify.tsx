import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, Text, TextInput, TouchableOpacity, ActivityIndicator, BackHandler } from 'react-native';
import { Button } from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Icon from 'react-native-vector-icons/FontAwesome';
import apiClient, { setAccessToken } from '../utils/apiClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from '../../components/ui/Toast';
import ConfirmationModal from '../../components/ui/ConfirmationModal';
import * as Haptics from 'expo-haptics';

const CODE_LENGTH = 6;

const VerifyScreen = () => {
  const router = useRouter();
  const { mobile } = useLocalSearchParams();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [showBackConfirmation, setShowBackConfirmation] = useState(false);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: 'success' | 'error' | 'info';
  }>({
    visible: false,
    message: '',
    type: 'info',
  });
  const inputRef = useRef<TextInput | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ visible: true, message, type });
    if (type === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (type === 'error') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    else Haptics.selectionAsync();
  };

  const hideToast = () => {
    setToast(prev => ({ ...prev, visible: false }));
  };

  const handleVerify = async () => {
    if (code.length !== CODE_LENGTH) {
      showToast('Please enter the complete 6-digit code', 'error');
      return;
    }
    setLoading(true);
    try {
      const response = await apiClient.post('/auth/verify-otp', { mobile, otp: code });
      if (response.data.statusCode === 201) {
        await setAccessToken(response.data.data.accessToken);
        await AsyncStorage.setItem('refreshToken', response.data.data.refreshToken || '');
        // Store userRole for auto-login
        const role = response.data.data.role || 'passenger';
        await AsyncStorage.setItem('userRole', role);
        showToast('Login successful!', 'success');
        setTimeout(() => {
          router.replace(role === 'driver' ? '/(driver)' : '/(tabs)');
        }, 1500);
      } else {
        showToast('Invalid OTP. Please try again.', 'error');
      }
    } catch (err: any) {
      let errorMessage = 'Failed to verify OTP. Please try again.';
      if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      }
      showToast(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (text: string) => {
    // Only allow numbers, max CODE_LENGTH
    const clean = text.replace(/[^0-9]/g, '').slice(0, CODE_LENGTH);
    setCode(clean);
  };

  const handleBoxPress = () => {
    inputRef.current?.focus();
  };

  const resendOTP = async () => {
    if (!mobile) {
      showToast('Phone number not found', 'error');
      return;
    }
    try {
      const response = await apiClient.post('/auth/login', { mobile });
      if (response.data.statusCode === 201) {
        showToast('OTP resent successfully!', 'success');
      } else {
        showToast('Failed to resend OTP', 'error');
      }
    } catch (err: any) {
      showToast('Failed to resend OTP. Please try again.', 'error');
    }
  };

  const handleBackPress = () => {
    setShowBackConfirmation(true);
  };

  const handleConfirmBack = () => {
    setShowBackConfirmation(false);
    router.back();
  };

  const handleCancelBack = () => {
    setShowBackConfirmation(false);
  };

  useEffect(() => {
    const backAction = () => {
      setShowBackConfirmation(true);
      return true; 
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, []);

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
        <Icon name="arrow-left" size={20} color="#000" />
      </TouchableOpacity>
      <View style={styles.contentContainer}>
        <Text style={styles.title}>Enter the code</Text>
        <Text style={styles.subtitle}>We have sent you a verification code.</Text>
        <TouchableOpacity activeOpacity={1} onPress={handleBoxPress} style={styles.codeContainer}>
          {[...Array(CODE_LENGTH)].map((_, idx) => (
            <View
              key={idx}
              style={[styles.codeInput, code.length === idx && styles.codeInputActive, code[idx] && styles.codeInputFilled]}
            >
              <Text style={styles.codeDigit}>{code[idx] || ''}</Text>
            </View>
          ))}
          <TextInput
            ref={inputRef}
            value={code}
            onChangeText={handleChange}
            keyboardType="numeric"
            maxLength={CODE_LENGTH}
            style={styles.hiddenInput}
            autoFocus
            editable={!loading}
            caretHidden
            selection={{ start: code.length, end: code.length }}
            blurOnSubmit={false}
          />
        </TouchableOpacity>
        <Button
          mode="contained"
          style={styles.button}
          onPress={handleVerify}
          disabled={loading || code.length !== CODE_LENGTH}
          contentStyle={styles.buttonContent}
        >
          {loading ? <ActivityIndicator color="#fff" /> : 'Verify OTP'}
        </Button>
        <TouchableOpacity onPress={resendOTP} style={styles.resendContainer} disabled={loading}>
          <Text style={styles.resendText}>Didn't receive the code? </Text>
          <Text style={[styles.resendLink, loading && styles.resendLinkDisabled]}>Resend</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.keyboardPlaceholder} />
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={hideToast}
        duration={4000}
      />
      <ConfirmationModal
        visible={showBackConfirmation}
        title="Cancel Verification?"
        message="Are you sure you want to cancel OTP verification?"
        confirmText="Cancel"
        cancelText="Continue"
        onConfirm={handleConfirmBack}
        onCancel={handleCancelBack}
        type="warning"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
  },
  backButton: {
    padding: 10,
    marginTop: 40,
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 25,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
    color: '#333',
  },
  subtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
  },
  codeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 30,
    marginTop: 10,
    position: 'relative',
  },
  codeInput: {
    width: 45,
    height: 45,
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 8,
    textAlign: 'center',
    marginHorizontal: 5,
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    alignItems: 'center',
  },
  codeInputActive: {
    borderColor: '#00809D',
  },
  codeInputFilled: {
    borderColor: '#00809D',
    backgroundColor: '#e0f7fa',
  },
  codeDigit: {
    fontSize: 18,
    color: '#333',
    fontWeight: '600',
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1,
  },
  button: {
    width: '100%',
    backgroundColor: '#00809D',
    borderRadius: 12,
  },
  buttonContent: {
    height: 48,
  },
  resendContainer: {
    flexDirection: 'row',
    marginTop: 20,
    alignItems: 'center',
  },
  resendText: {
    fontSize: 14,
    color: '#666',
  },
  resendLink: {
    fontSize: 14,
    color: '#00809D',
    fontWeight: '600',
  },
  resendLinkDisabled: {
    color: '#ccc',
  },
  keyboardPlaceholder: {
    height: 200,
  },
});

export default VerifyScreen;