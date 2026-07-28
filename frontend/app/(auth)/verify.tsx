import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  BackHandler,
  SafeAreaView,
  StatusBar,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialIcons, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
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
    const clean = text.replace(/[^0-9]/g, '').slice(0, CODE_LENGTH);
    setCode(clean);
  };

  const handleBoxPress = () => {
    inputRef.current?.focus();
  };

  const handleBackPress = () => {
    if (loading) {
      setShowBackConfirmation(true);
    } else {
      router.back();
    }
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
      if (loading) {
        setShowBackConfirmation(true);
        return true;
      }
      return false;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [loading]);

  const resendOTP = async () => {
    setLoading(true);
    try {
      const response = await apiClient.post('/auth/login', { mobile });
      if (response.data.statusCode === 201) {
        showToast('OTP resent successfully!', 'success');
      } else {
        showToast('Failed to resend OTP. Please try again.', 'error');
      }
    } catch (err: any) {
      let errorMessage = 'Failed to resend OTP. Please try again.';
      if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      }
      showToast(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header Bar with Centered Red Title */}
          <View style={styles.headerBar}>
            <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
              <Ionicons name="arrow-back" size={22} color="#191C1D" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Verify Phone</Text>
            <View style={{ width: 38 }} />
          </View>

          {/* Floating White Card */}
          <View style={styles.card}>
            {/* Top Soft Pink Circle Badge */}
            <View style={styles.iconBadge}>
              <MaterialCommunityIcons name="cellphone-lock" size={28} color="#B7102A" />
            </View>

            <Text style={styles.title}>Enter Code</Text>
            <Text style={styles.subtitle}>
              Enter the 6-digit code sent to{' '}
              <Text style={styles.mobileHighlight}>{mobile || 'your phone number'}</Text>
            </Text>

            {/* Change Number Link */}
            <TouchableOpacity onPress={handleBackPress} style={styles.changeNumberButton}>
              <Text style={styles.changeNumberText}>Change Number</Text>
            </TouchableOpacity>

            {/* OTP 6-Digit Boxes */}
            <TouchableOpacity activeOpacity={1} onPress={handleBoxPress} style={styles.codeContainer}>
              {[...Array(CODE_LENGTH)].map((_, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.codeInput,
                    code.length === idx && styles.codeInputActive,
                    code[idx] && styles.codeInputFilled,
                  ]}
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

            {/* Pill Primary Verify Button */}
            <TouchableOpacity
              style={[
                styles.primaryPillButton,
                (loading || code.length !== CODE_LENGTH) && styles.buttonDisabled
              ]}
              onPress={handleVerify}
              disabled={loading || code.length !== CODE_LENGTH}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.primaryButtonText}>Verify</Text>
              )}
            </TouchableOpacity>

            {/* Resend Link */}
            <TouchableOpacity onPress={resendOTP} style={styles.resendContainer} disabled={loading}>
              <Text style={styles.resendText}>Didn't receive code? </Text>
              <Text style={[styles.resendLink, loading && styles.resendLinkDisabled]}>Resend</Text>
            </TouchableOpacity>
          </View>

          {/* End-to-End Secure Badge */}
          <View style={styles.secureFooter}>
            <MaterialIcons name="security" size={14} color="#8F6F6E" style={{ marginRight: 6 }} />
            <Text style={styles.secureText}>END-TO-END SECURE</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA', // Neutral off-white canvas
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 24,
    alignItems: 'center',
  },
  headerBar: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'android' ? 12 : 6,
    paddingBottom: 20,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#B7102A', // Energetic Red header title
    letterSpacing: -0.3,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 6,
    marginBottom: 24,
  },
  iconBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFDAD8', // Soft energetic red badge background
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#191C1D',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '400',
    color: '#5B403F',
    textAlign: 'center',
    lineHeight: 20,
  },
  mobileHighlight: {
    color: '#191C1D',
    fontWeight: '600',
  },
  changeNumberButton: {
    marginTop: 6,
    marginBottom: 24,
  },
  changeNumberText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#B7102A',
  },
  codeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    width: '100%',
    marginBottom: 28,
  },
  codeInput: {
    width: 44,
    height: 54,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F5',
    marginHorizontal: 3,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  codeInputActive: {
    borderColor: '#B7102A', // Energetic Red border on active focus
    backgroundColor: '#FFFFFF',
    shadowColor: '#B7102A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  codeInputFilled: {
    backgroundColor: '#FFFFFF',
    borderColor: '#B7102A',
  },
  codeDigit: {
    fontSize: 22,
    fontWeight: '700',
    color: '#B7102A',
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1,
  },
  primaryPillButton: {
    width: '100%',
    height: 52,
    backgroundColor: '#B7102A', // Energetic Red
    borderRadius: 26, // Full Pill button shape
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#B7102A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 18,
  },
  buttonDisabled: {
    backgroundColor: '#E4BEBC',
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  resendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  resendText: {
    color: '#5B403F',
    fontSize: 14,
  },
  resendLink: {
    color: '#B7102A',
    fontWeight: '700',
    fontSize: 14,
  },
  resendLinkDisabled: {
    color: '#E4BEBC',
  },
  secureFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  secureText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8F6F6E',
    letterSpacing: 1.5,
  },
});

export default VerifyScreen;