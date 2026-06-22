import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, StatusBar, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialIcons';
import apiClient from '../utils/apiClient';
import { useDriverRegistration } from '../DriverRegistrationContext';
import ConfirmationModal from '../../components/ui/ConfirmationModal';
import AppModal from '../../components/ui/AppModal';

const { width, height } = Dimensions.get('window');

const VehicleInfo = () => {
  const router = useRouter();
  const { registrationData } = useDriverRegistration();
  const [loading, setLoading] = useState(false);
  const [showBackConfirmation, setShowBackConfirmation] = useState(false);
  const [modal, setModal] = useState<{
    visible: boolean;
    type: 'success' | 'error' | 'info';
    title: string;
    message: string;
  }>({
    visible: false,
    type: 'info',
    title: '',
    message: '',
  });

  const showModal = (type: 'success' | 'error' | 'info', title: string, message: string) => {
    setModal({ visible: true, type, title, message });
  };
  const hideModal = () => setModal((prev) => ({ ...prev, visible: false }));

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

  const handleNavigate = (screen: string) => {
    if (loading) return;
    
    switch (screen) {
      case 'brand':
        router.push('/(vehDetails)/vBrand');
        break;
      case 'registrationPlate':
        router.push('/(vehDetails)/regPlate');
        break;
      case 'picture':
        router.push('/(vehDetails)/vPicture');
        break;
      case 'billbook':
        router.push('/(vehDetails)/vBillbook');
        break;
      default:
        break;
    }
  };

  // Example: check if all required fields are present (customize as needed)
  const isComplete = registrationData &&
    registrationData.citizenship &&
    registrationData.citizenshipNumber &&
    registrationData.citizenshipDocFrontImgPath &&
    registrationData.citizenshipDocBackImgPath &&
    registrationData.licenseNum &&
    registrationData.licenseExpiry &&
    registrationData.licenseFrontImgPath &&
    registrationData.vehicleType &&
    registrationData.vehicleRegNum &&
    registrationData.vehicleMake &&
    registrationData.vehicleModel &&
    registrationData.vehicleYear &&
    registrationData.vehicleColor &&
    registrationData.blueBookFrontImgPath &&
    registrationData.blueBookBackImgPath;

  const handleSubmit = () => {
    if (!isComplete) {
      showModal('error', 'Error', 'Please complete all registration steps.');
      return;
    }
    
    setLoading(true);
    try {
      router.push('/(regSteps)/reviewAndSubmit');
    } catch (error) {
      showModal('error', 'Error', 'Failed to proceed to review');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBackPress}>
          <Icon name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Vehicle Info</Text>
        <TouchableOpacity onPress={handleBackPress} style={styles.closeButton}>
          <Text style={styles.closeText}>Close</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.content}>
        <TouchableOpacity style={styles.option} onPress={() => handleNavigate('brand')} disabled={loading}>
          <Text style={[styles.optionText, loading && styles.optionTextDisabled]}>Brand</Text>
          <Icon name="chevron-right" size={24} color={loading ? "#ccc" : "#075B5E"} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.option} onPress={() => handleNavigate('registrationPlate')} disabled={loading}>
          <Text style={[styles.optionText, loading && styles.optionTextDisabled]}>Registration plate</Text>
          <Icon name="chevron-right" size={24} color={loading ? "#ccc" : "#075B5E"} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.option} onPress={() => handleNavigate('picture')} disabled={loading}>
          <Text style={[styles.optionText, loading && styles.optionTextDisabled]}>Picture</Text>
          <Icon name="chevron-right" size={24} color={loading ? "#ccc" : "#075B5E"} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.option} onPress={() => handleNavigate('billbook')} disabled={loading}>
          <Text style={[styles.optionText, loading && styles.optionTextDisabled]}>Billbook</Text>
          <Icon name="chevron-right" size={24} color={loading ? "#ccc" : "#075B5E"} />
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.doneButton, (!isComplete || loading) && { backgroundColor: '#ccc' }]}
          onPress={handleSubmit}
          disabled={!isComplete || loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.doneButtonText}>Submit Registration</Text>
          )}
        </TouchableOpacity>
      </View>

      <ConfirmationModal
        visible={showBackConfirmation}
        title="Cancel Vehicle Setup?"
        message="Are you sure you want to cancel vehicle setup?"
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
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    padding: 8,
  },
  closeText: {
    color: '#075B5E',
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  optionText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  optionTextDisabled: {
    color: '#ccc',
  },
  doneButton: {
    backgroundColor: '#075B5E',
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 30,
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default VehicleInfo;