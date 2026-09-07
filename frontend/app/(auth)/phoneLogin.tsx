import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons, Ionicons, FontAwesome5 } from '@expo/vector-icons';
import apiClient from '@/services/apiClient';
import Toast from '../../components/ui/Toast';
import ConfirmationModal from '../../components/ui/ConfirmationModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const PhoneLoginScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPadding = insets.top > 0 ? insets.top + 8 : (Platform.OS === 'android' ? 32 : 16);
  const bottomPadding = insets.bottom > 0 ? insets.bottom + 8 : 24;
  const [phone, setPhone] = useState('');
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

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ visible: true, message, type });
  };

  const hideToast = () => {
    setToast(prev => ({ ...prev, visible: false }));
  };

  const validatePhone = (phoneNumber: string) => {
    const phoneRegex = /^(\+977|977)?[9][6-8]\d{8}$/;
    return phoneRegex.test(phoneNumber.replace(/\s/g, ''));
  };

  const handleVerify = async () => {
    const trimmedPhone = phone.trim();
    
    if (!trimmedPhone) {
      showToast('Please enter your phone number', 'error');
      return;
    }

    if (!validatePhone(trimmedPhone)) {
      showToast('Please enter a valid phone number', 'error');
      return;
    }

    setLoading(true);
    
    try {
      const response = await apiClient.post('/auth/login', { mobile: trimmedPhone });

      if (response.data.statusCode === 201) {
        showToast('OTP sent successfully!', 'success');
        setTimeout(() => {
          router.push({
            pathname: '/(auth)/verify',
            params: { mobile: trimmedPhone }
          });
        }, 1500);
      } else {
        showToast('Failed to send OTP. Please try again.', 'error');
      }
    } catch (err: any) {
      let errorMessage = 'Failed to send OTP. Please try again.';
      if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      }
      showToast(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
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

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingTop: topPadding, paddingBottom: bottomPadding }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header Bar */}
          <View style={styles.headerBar}>
            <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color="#191C1D" />
            </TouchableOpacity>
          </View>

          {/* Top Brand Header */}
          <View style={styles.brandContainer}>
            <View style={styles.logoBadge}>
              <MaterialIcons name="directions-car" size={30} color="#FFFFFF" />
            </View>
            <Text style={styles.brandTitle}>Saathi</Text>
          </View>

          {/* Floating Card Container */}
          <View style={styles.card}>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Log in to your account to continue</Text>

            {/* Input Label */}
            <Text style={styles.inputLabel}>Phone Number</Text>

            {/* Split Country Code + Phone Input Container */}
            <View style={styles.inputContainer}>
              <View style={styles.countrySelector}>
                <Text style={styles.countryText}>+977</Text>
                <Ionicons name="chevron-down" size={14} color="#5B403F" style={{ marginLeft: 4 }} />
              </View>
              <TextInput
                style={[styles.input, loading && styles.inputDisabled]}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="98XXXXXXXX"
                placeholderTextColor="#A0A0A0"
                maxLength={15}
                editable={!loading}
              />
            </View>

            {/* Primary Action Button (Energetic Red) */}
            <TouchableOpacity
              style={[
                styles.primaryButton,
                (loading || !phone.trim()) && styles.buttonDisabled
              ]}
              onPress={handleVerify}
              disabled={loading || !phone.trim()}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.primaryButtonText}>Send OTP</Text>
              )}
            </TouchableOpacity>

          </View>

          {/* Footer Links */}
          <View style={styles.footer}>
            <TouchableOpacity
              onPress={() => router.push('/(auth)/phoneRegister')}
              disabled={loading}
              activeOpacity={0.7}
            >
              <Text style={styles.footerLinkText}>
                Don't have an account? <Text style={styles.signUpHighlight}>Sign up</Text>
              </Text>
            </TouchableOpacity>

            <View style={styles.legalRow}>
              <TouchableOpacity>
                <Text style={styles.legalText}>Terms of Service</Text>
              </TouchableOpacity>
              <Text style={styles.legalDot}> • </Text>
              <TouchableOpacity>
                <Text style={styles.legalText}>Privacy Policy</Text>
              </TouchableOpacity>
            </View>
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
        title="Cancel Process?"
        message="Are you sure you want to cancel OTP process?"
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
    backgroundColor: '#F8F9FA', // Canvas neutral background
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 24,
    alignItems: 'center',
  },
  headerBar: {
    width: '100%',
    paddingTop: 0,
    paddingBottom: 8,
    alignItems: 'flex-start',
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logoBadge: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#B7102A', // Energetic Red
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#B7102A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
    marginBottom: 8,
  },
  brandTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#B7102A',
    letterSpacing: -0.5,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF', // Pure White surface
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 6,
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#191C1D',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '400',
    color: '#5B403F',
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5B403F',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F5',
    borderRadius: 12,
    height: 52,
    paddingHorizontal: 14,
    marginBottom: 20,
  },
  countrySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 12,
    borderRightWidth: 1,
    borderRightColor: '#E4BEBC',
  },
  countryText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#191C1D',
  },
  input: {
    flex: 1,
    height: '100%',
    paddingLeft: 12,
    fontSize: 15,
    color: '#191C1D',
    fontWeight: '500',
  },
  inputDisabled: {
    opacity: 0.6,
  },
  primaryButton: {
    width: '100%',
    height: 50,
    backgroundColor: '#B7102A', // Energetic Red
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#B7102A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 8,
  },
  buttonDisabled: {
    backgroundColor: '#E4BEBC',
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E4BEBC',
    opacity: 0.6,
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 12,
    fontWeight: '600',
    color: '#8F6F6E',
    letterSpacing: 0.5,
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E4BEBC',
    backgroundColor: '#F8F9FA',
    marginBottom: 12,
  },
  socialButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#191C1D',
  },
  footer: {
    alignItems: 'center',
    marginTop: 4,
  },
  footerLinkText: {
    fontSize: 14,
    color: '#5B403F',
    fontWeight: '400',
    marginBottom: 14,
  },
  signUpHighlight: {
    color: '#B7102A',
    fontWeight: '700',
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legalText: {
    fontSize: 12,
    color: '#5B403F',
    opacity: 0.85,
    fontWeight: '500',
  },
  legalDot: {
    fontSize: 12,
    color: '#5B403F',
    opacity: 0.5,
  },
});

export default PhoneLoginScreen;