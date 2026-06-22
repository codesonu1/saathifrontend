import React, { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, SafeAreaView, StatusBar, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import apiClient, { setAccessToken, initializeApiClient } from '../utils/apiClient';
import webSocketService from '../utils/websocketService';
import ConfirmationModal from '../../components/ui/ConfirmationModal';
import AppModal from '../../components/ui/AppModal';
import Toast from '../../components/ui/Toast';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { userRoleManager } from '../utils/userRoleManager';

const CODE_LENGTH = 6;

const AccountRestoration = () => {
  const router = useRouter();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [currentUserMobile, setCurrentUserMobile] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [accessToken, setAccessToken] = useState('');
  const [showBackConfirmation, setShowBackConfirmation] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' | 'info' }>({ visible: false, message: '', type: 'info' });
  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ visible: true, message, type });
    if (type === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (type === 'error') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    else Haptics.selectionAsync();
  };
  const hideToast = () => setToast(prev => ({ ...prev, visible: false }));
  const [modal, setModal] = useState<{
    visible: boolean;
    type: 'success' | 'error' | 'info';
    title: string;
    message: string;
    actionText?: string;
    onAction?: (() => void);
  }>({
    visible: false,
    type: 'info',
    title: '',
    message: '',
    actionText: undefined,
    onAction: undefined,
  });
  const inputRef = useRef<TextInput | null>(null);

  const showModal = (type: 'success' | 'error' | 'info', title: string, message: string, actionText?: string, onAction?: (() => void)) => {
    setModal({ visible: true, type, title, message, actionText, onAction });
  };
  const hideModal = () => setModal((prev) => ({ ...prev, visible: false }));

  const handleBack = () => {
    setShowBackConfirmation(true);
  };

  const handleConfirmBack = () => {
    setShowBackConfirmation(false);
    if (step === 'otp') {
      setStep('phone');
      setOtp('');
    } else {
      router.back();
    }
  };

  const handleCancelBack = () => {
    setShowBackConfirmation(false);
  };

  // On mount, fetch the current user's mobile from /me
  React.useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.get('me');
        setCurrentUserMobile(res.data.data?.mobile || null);
      } catch (err) {
        setCurrentUserMobile(null);
      }
    })();
  }, []);

  const handleSendOtp = async () => {
    if (!phoneNumber.trim()) {
      showToast('Please enter a phone number', 'error');
      return;
    }
    if (currentUserMobile && phoneNumber !== currentUserMobile) {
      showToast('You can only restore your own account.', 'error');
      return;
    }
    setLoading(true);
    try {
      const response = await apiClient.post('auth/login', { mobile: phoneNumber });
      if (response.data.statusCode === 201 || response.data.statusCode === 200) {
        // Check if this user has a driver profile
        try {
          const profileRes = await apiClient.get('me', { headers: { Authorization: `Bearer ${response.data.data.accessToken}` } });
          const userData = profileRes.data.data;
          const hasDriverProfile = !!userData?.driverProfile || (userData?.role === 'driver' && userData?.vehicles && userData.vehicles.length > 0);
          if (!hasDriverProfile) {
            showToast('No vehicle registered for this account.', 'error');
            setLoading(false);
            return;
          }
          setStep('otp');
          showToast('OTP sent successfully!', 'success');
        } catch (profileErr) {
          showToast('No vehicle registered for this account.', 'error');
          setLoading(false);
          return;
        }
      } else {
        showModal('error', 'Error', 'No user exists with this phone number. Please register a vehicle.', 'Register Vehicle', () => router.push('/registerVehicle'));
      }
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Failed to send OTP. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp.trim() || otp.length !== CODE_LENGTH) {
      showToast('Please enter a valid 6-digit OTP', 'error');
      return;
    }
    setLoading(true);
    try {
      const response = await apiClient.post('auth/verify-otp', { mobile: phoneNumber, otp });
      if (response.data.statusCode === 201) {
        await setAccessToken(response.data.data.accessToken);
        await initializeApiClient();
        await webSocketService.reconnectAllWithNewToken();
        // Fetch user profile to determine role
        const profileRes = await apiClient.get('me');
        const userData = profileRes.data.data;
        const hasDriverProfile = !!userData?.driverProfile || (userData?.role === 'driver' && userData?.vehicles && userData.vehicles.length > 0);
        await AsyncStorage.setItem('userRole', hasDriverProfile ? 'driver' : 'passenger');
        if (hasDriverProfile) {
          await userRoleManager.setRole('driver');
        } else {
          await userRoleManager.setRole('passenger');
        }
        showToast('Account restored successfully!', 'success');
        setTimeout(() => router.push(hasDriverProfile ? '/(driver)' : '/(tabs)'), 1500);
      } else {
        showToast('Invalid OTP. Please try again.', 'error');
      }
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Failed to verify OTP. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleChangeOtp = (text: string) => {
    const clean = text.replace(/[^0-9]/g, '').slice(0, CODE_LENGTH);
    setOtp(clean);
  };

  const handleBoxPress = () => {
    inputRef.current?.focus();
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f5f5f5" />
      <TouchableOpacity onPress={handleBack} style={styles.backButton}>
        <ArrowLeft size={24} color="#333" />
      </TouchableOpacity>
      <View style={styles.contentContainer}>
        {step === 'phone' ? (
          <>
            <Text style={styles.title}>Account Restoration</Text>
            <Text style={styles.subtitle}>Enter the phone number linked to your previous account</Text>
            <TextInput
              style={[styles.input, loading && styles.inputDisabled]}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              placeholder="Enter your phone number"
              keyboardType="phone-pad"
              maxLength={10}
              editable={!loading}
              autoFocus
              placeholderTextColor="#ccc"
            />
            <TouchableOpacity
              style={[styles.button, phoneNumber.length > 0 && styles.buttonActive]}
              onPress={handleSendOtp}
              disabled={phoneNumber.length === 0 || loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={[styles.buttonText, phoneNumber.length > 0 && styles.buttonTextActive]}>Next</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.title}>Enter OTP</Text>
            <Text style={styles.subtitle}>Enter the 6-digit OTP sent to your phone</Text>
            <TouchableOpacity activeOpacity={1} onPress={handleBoxPress} style={styles.codeContainer}>
              {[...Array(CODE_LENGTH)].map((_, idx) => (
                <View
                  key={idx}
                  style={[styles.codeInput, otp.length === idx && styles.codeInputActive, otp[idx] && styles.codeInputFilled]}
                >
                  <Text style={styles.codeDigit}>{otp[idx] || ''}</Text>
                </View>
              ))}
              <TextInput
                ref={inputRef}
                value={otp}
                onChangeText={handleChangeOtp}
                keyboardType="numeric"
                maxLength={CODE_LENGTH}
                style={styles.hiddenInput}
                autoFocus
                editable={!loading}
                caretHidden
                selection={{ start: otp.length, end: otp.length }}
                blurOnSubmit={false}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, otp.length === CODE_LENGTH && styles.buttonActive]}
              onPress={handleVerifyOtp}
              disabled={otp.length !== CODE_LENGTH || loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={[styles.buttonText, otp.length === CODE_LENGTH && styles.buttonTextActive]}>Verify OTP</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSendOtp} disabled={loading} style={{ marginTop: 20 }}>
              <Text style={[styles.resendText, loading && styles.resendTextDisabled]}>Resend OTP</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
      <Toast visible={toast.visible} message={toast.message} type={toast.type} onHide={hideToast} />
      <ConfirmationModal
        visible={showBackConfirmation}
        title={step === 'otp' ? 'Cancel Verification?' : 'Cancel Process?'}
        message={step === 'otp' ? 'Are you sure you want to cancel OTP verification?' : 'Are you sure you want to cancel OTP process?'}
        confirmText="Cancel"
        cancelText="Continue"
        onConfirm={handleConfirmBack}
        onCancel={handleCancelBack}
        type="warning"
      />
      <AppModal
        visible={modal.visible}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        onClose={hideModal}
        actionText={modal.actionText}
        onAction={modal.onAction}
      />
    </SafeAreaView>
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
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginTop: 30,
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
  input: {
    width: '100%',
    height: 48,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 10,
    marginBottom: 15,
    color: '#000',
    fontSize: 16,
    backgroundColor: '#fff',
  },
  inputDisabled: {
    backgroundColor: '#f5f5f5',
    color: '#999',
  },
  button: {
    width: '100%',
    backgroundColor: '#ccc',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonActive: {
    backgroundColor: '#075B5E',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#999',
  },
  buttonTextActive: {
    color: '#fff',
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
  resendText: {
    color: '#007AFF',
    textAlign: 'center',
    fontSize: 16,
  },
  resendTextDisabled: {
    color: '#ccc',
  },
});

export default AccountRestoration;