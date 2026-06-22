import React, { useState } from 'react';
import { View, StyleSheet, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Button } from 'react-native-paper';
import { useRouter } from 'expo-router';
import Icon from 'react-native-vector-icons/FontAwesome';
import apiClient from '../utils/apiClient';
import Toast from '../../components/ui/Toast';
import ConfirmationModal from '../../components/ui/ConfirmationModal';

const PhoneLoginScreen = () => {
  const router = useRouter();
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
    // Basic phone validation for Nepal numbers
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
      <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
        <Icon name="arrow-left" size={20} color="#000" />
      </TouchableOpacity>
      
      <View style={styles.contentContainer}>
        <Text style={styles.title}>Continue with Phone</Text>
        <Text style={styles.subtitle}>Enter your phone number to proceed</Text>
        
        <TextInput
          style={[styles.input, loading && styles.inputDisabled]}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="Enter your phone number"
          placeholderTextColor="#ccc"
          autoFocus
          maxLength={15}
          editable={!loading}
        />
        
        <Button
          mode="contained"
          style={styles.button}
          onPress={handleVerify}
          disabled={loading || !phone.trim()}
          contentStyle={styles.buttonContent}
        >
          {loading ? <ActivityIndicator color="#fff" /> : 'Send OTP'}
        </Button>
        
        <TouchableOpacity onPress={() => router.push('/(auth)/phoneRegister')} disabled={loading}>
          <Text style={[styles.link, loading && styles.linkDisabled]}>Don't have an account? Register</Text>
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
    backgroundColor: '#fff', 
    paddingHorizontal: 16 
  },
  backButton: { 
    padding: 10, 
    marginTop: 40 
  },
  contentContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  title: { 
    fontSize: 25, 
    fontWeight: 'bold', 
    marginBottom: 10, 
    textAlign: 'center', 
    color: '#333' 
  },
  subtitle: { 
    fontSize: 15, 
    color: '#666', 
    textAlign: 'center', 
    marginBottom: 30 
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
    fontSize: 16
  },
  inputDisabled: {
    backgroundColor: '#f5f5f5',
    color: '#999',
  },
  button: { 
    width: '100%', 
    backgroundColor: '#00809D', 
    borderRadius: 12 
  },
  buttonContent: { 
    height: 48 
  },
  link: { 
    color: '#00809D', 
    marginTop: 15, 
    textDecorationLine: 'underline',
    fontSize: 16
  },
  linkDisabled: {
    color: '#ccc',
  },
  keyboardPlaceholder: { 
    height: 200 
  },
});

export default PhoneLoginScreen;