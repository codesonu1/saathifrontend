import React, { useState } from 'react';
import { View, StyleSheet, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Button } from 'react-native-paper';
import { useRouter } from 'expo-router';
import Icon from 'react-native-vector-icons/FontAwesome';
import apiClient from '../utils/apiClient';
import Toast from '../../components/ui/Toast';
import ConfirmationModal from '../../components/ui/ConfirmationModal';

const PhoneInputScreen = () => {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
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

  const validateName = (name: string) => {
    return name.trim().length >= 2;
  };

  const handleVerify = async () => {
    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();
    const trimmedPhone = phone.trim();

    // Validation
    if (!trimmedFirstName || !validateName(trimmedFirstName)) {
      showToast('Please enter a valid first name (at least 2 characters)', 'error');
      return;
    }

    if (!trimmedLastName || !validateName(trimmedLastName)) {
      showToast('Please enter a valid last name (at least 2 characters)', 'error');
      return;
    }

    if (!trimmedPhone || !validatePhone(trimmedPhone)) {
      showToast('Please enter a valid phone number', 'error');
      return;
    }

    setLoading(true);
    
    try {
      const response = await apiClient.post('/auth/register', { 
        firstName: trimmedFirstName, 
        lastName: trimmedLastName, 
        mobile: trimmedPhone 
      });

      if (response.data.statusCode === 200) {
        showToast('Phone number already exists. Please log in or use a different number.', 'error');
      } else if (response.data.statusCode === 201) {
        showToast('Registration successful! Please verify your OTP.', 'success');
        setTimeout(() => {
          router.push({
            pathname: '/(auth)/verify',
            params: { mobile: trimmedPhone }
          });
        }, 2000);
      } else {
        showToast('Unexpected response. Please try again.', 'error');
      }
    } catch (err: any) {
      if (err.response?.status === 400) {
        showToast('Phone number already exists. Please log in or use a different number.', 'error');
      } else {
        let errorMessage = 'Failed to register. Please try again.';
        if (err.response?.data?.message) {
          errorMessage = err.response.data.message;
        }
        showToast(errorMessage, 'error');
      }
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
        <Text style={styles.title}>Join us via phone number</Text>
        <Text style={styles.subtitle}>Enter your details to register</Text>
        
        <TextInput
          style={[styles.input, loading && styles.inputDisabled]}
          value={firstName}
          onChangeText={setFirstName}
          placeholder="Enter your First Name"
          placeholderTextColor="#ccc"
          autoFocus
          maxLength={30}
          editable={!loading}
        />
        
        <TextInput
          style={[styles.input, loading && styles.inputDisabled]}
          value={lastName}
          onChangeText={setLastName}
          placeholder="Enter your Last Name"
          placeholderTextColor="#ccc"
          maxLength={30}
          editable={!loading}
        />
        
        <TextInput
          style={[styles.input, loading && styles.inputDisabled]}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="Enter your phone number"
          placeholderTextColor="#ccc"
          maxLength={15}
          editable={!loading}
        />
        
        <Button
          mode="contained"
          style={styles.button}
          onPress={handleVerify}
          disabled={loading || !firstName.trim() || !lastName.trim() || !phone.trim()}
          contentStyle={styles.buttonContent}
        >
          {loading ? <ActivityIndicator color="#fff" /> : 'Register'}
        </Button>
        
        <TouchableOpacity onPress={() => router.push('/(auth)/phoneLogin')} disabled={loading}>
          <Text style={[styles.link, loading && styles.linkDisabled]}>Already have an account? Log in</Text>
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
        title="Cancel Registration?"
        message="Are you sure you want to cancel registration?"
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
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    width: '80%',
    alignItems: 'center',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginLeft: 10,
    color: '#333',
  },
  modalMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: 10,
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: '#666',
  },
  modalButtonConfirm: {
    backgroundColor: '#F44336',
  },
  modalButtonCancelText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtonConfirmText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default PhoneInputScreen;