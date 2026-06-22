import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useDriverRegistration } from '../DriverRegistrationContext';
import apiClient from '../utils/apiClient';
import { userRoleManager } from '../utils/userRoleManager';
import Toast from '../../components/ui/Toast';
import ConfirmationModal from '../../components/ui/ConfirmationModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ReviewAndSubmit = () => {
  const insets = useSafeAreaInsets();
  const { registrationData } = useDriverRegistration();
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

  const handleEdit = (step: string) => {
    if (loading) return;
    router.push(step as any);
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ visible: true, message, type });
  };

  const hideToast = () => {
    setToast(prev => ({ ...prev, visible: false }));
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

  const handleSubmit = async () => {
    // Validate required fields first
    const requiredFields = [
      'citizenship', 'citizenshipNumber', 'licenseNum', 'licenseExpiry',
      'vehicleType', 'vehicleRegNum', 'vehicleMake', 'vehicleModel',
      'vehicleYear', 'vehicleColor', 'billbookNumber'
    ];
    const missingFields = requiredFields.filter(field => !registrationData[field]);
    if (missingFields.length > 0) {
      showToast(`Please complete the following fields: ${missingFields.join(', ')}`, 'error');
      return;
    }

    setLoading(true);
    try {
      // Helper function to upload image and return backend file path
      const uploadImageIfNeeded = async (imageUri: string | undefined | null): Promise<string | undefined> => {
        if (!imageUri) return undefined;
        // If already a backend path or URL, return as is
        if (imageUri.startsWith('/uploads/') || imageUri.startsWith('http')) return imageUri;
        // Otherwise, upload
        const data = new FormData();
        data.append('file', {
          uri: imageUri,
          name: imageUri.split('/').pop() || 'photo.jpg',
          type: 'image/jpeg',
        } as any);
        const response = await apiClient.post('/uploads/private', data, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        return response.data.data; // backend returns file path
      };

      // Upload all images and get their backend paths
      const profileImage = await uploadImageIfNeeded(registrationData.profileImage);
      const selfiePhoto = await uploadImageIfNeeded(registrationData.selfiePhoto);
      const licenseFrontImgPath = await uploadImageIfNeeded(registrationData.licenseFrontImgPath);
      const citizenshipDocFrontImgPath = await uploadImageIfNeeded(registrationData.citizenshipDocFrontImgPath);
      const citizenshipDocBackImgPath = await uploadImageIfNeeded(registrationData.citizenshipDocBackImgPath);
      const vehiclePhoto = await uploadImageIfNeeded(registrationData.vehiclePhoto);
      const blueBookFrontImgPath = await uploadImageIfNeeded(registrationData.blueBookFrontImgPath);
      const blueBookBackImgPath = await uploadImageIfNeeded(registrationData.blueBookBackImgPath);

      // Prepare JSON payload matching backend expectations
      const payload = {
        citizenship: String(registrationData.citizenship || ''),
        citizenshipNumber: String(registrationData.citizenshipNumber || ''),
        licenseNum: String(registrationData.licenseNum || ''),
        licenseExpiry: new Date(registrationData.licenseExpiry).toISOString(),
        vehicleType: String(registrationData.vehicleType || ''),
        vehicleRegNum: String(registrationData.vehicleRegNum || ''),
        vehicleMake: String(registrationData.vehicleMake || ''),
        vehicleModel: String(registrationData.vehicleModel || ''),
        vehicleYear: Number(registrationData.vehicleYear) || 2020,
        vehicleColor: String(registrationData.vehicleColor || ''),
        billbookNumber: String(registrationData.billbookNumber || ''),
        profileImage,
        selfiePhoto,
        licenseFrontImgPath,
        citizenshipDocFrontImgPath,
        citizenshipDocBackImgPath,
        vehiclePhoto,
        blueBookFrontImgPath,
        blueBookBackImgPath,
      };

      const response = await apiClient.post('/driver-profile', payload, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      await userRoleManager.setRole('driver');
      showToast('Driver profile created successfully! 🎉', 'success');
      setTimeout(() => {
        router.replace('/(driver)?registrationComplete=true');
      }, 1500);
    } catch (err: any) {
      let errorMessage = 'Failed to submit driver profile.';
      if (err.response?.data?.message) {
        const messages = Array.isArray(err.response.data.message)
          ? err.response.data.message.join(', ')
          : err.response.data.message;
        errorMessage = messages;
      } else if (err.message) {
        errorMessage = err.message;
      }
      showToast(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  };

  const imageFields = [
    'profileImage',
    'selfiePhoto',
    'licenseFrontImgPath',
    'citizenshipDocFrontImgPath',
    'vehiclePhoto',
    'blueBookFrontImgPath',
    'blueBookBackImgPath'
  ];

  const renderSection = (
    title: string,
    data: { label: string; value: any; key: string }[],
    editRoute: string
  ) => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <TouchableOpacity onPress={() => handleEdit(editRoute)} disabled={loading}>
          <MaterialIcons name="edit" size={20} color={loading ? "#ccc" : "#007AFF"} />
        </TouchableOpacity>
      </View>
      {data.map((item, index) => (
        <View key={index} style={styles.row}>
          <Text style={styles.label}>{item.label}</Text>
          {imageFields.includes(item.key) && item.value ? (
            <Image source={{ uri: item.value }} style={styles.image} />
          ) : (
            <Text style={styles.value}>{String(item.value)}</Text>
          )}
        </View>
      ))}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={{ paddingTop: 26, paddingBottom: 10, backgroundColor: '#fff', zIndex: 2 }}>
        <Text style={styles.title}>Review & Submit</Text>
      </View>
      <ScrollView style={styles.scrollView} contentContainerStyle={{ paddingTop: 0 }}>
        {renderSection('Basic Profile', [
          { label: 'Profile Photo', value: registrationData.profileImage, key: 'profileImage' },
          { label: 'First Name', value: registrationData.firstName, key: 'firstName' },
          { label: 'Last Name', value: registrationData.lastName, key: 'lastName' },
          { label: 'Email', value: registrationData.email, key: 'email' },
          { label: 'City', value: registrationData.city, key: 'city' },
        ], '/(regSteps)/basicProfile')}

        {renderSection('License and ID', [
          { label: 'Driver License', value: registrationData.licenseFrontImgPath, key: 'licenseFrontImgPath' },
          { label: 'National ID', value: registrationData.citizenshipDocFrontImgPath, key: 'citizenshipDocFrontImgPath' },
        ], '/(regSteps)/driverLicense')}
        
        {renderSection('Selfie', [
          { label: 'Selfie with ID', value: registrationData.selfiePhoto, key: 'selfiePhoto' },
        ], '/(regSteps)/registerSelfie')}

        {renderSection('Vehicle Information', [
          { label: 'Brand', value: registrationData.vehicleBrand || registrationData.vehicleMake, key: 'vehicleBrand' },
          { label: 'Color', value: registrationData.vehicleColor, key: 'vehicleColor' },
          { label: 'Registration Plate', value: registrationData.vehicleRegNum, key: 'vehicleRegNum' },
          { label: 'Vehicle Photo', value: registrationData.vehiclePhoto, key: 'vehiclePhoto' },
          { label: 'Billbook Front', value: registrationData.blueBookFrontImgPath, key: 'blueBookFrontImgPath' },
          { label: 'Billbook Back', value: registrationData.blueBookBackImgPath, key: 'blueBookBackImgPath' },
          { label: 'Billbook Number', value: registrationData.billbookNumber, key: 'billbookNumber' },
        ], '/(vehDetails)/vBrand')}

        <TouchableOpacity style={[
          styles.submitButton,
          loading && styles.submitButtonDisabled,
          { marginBottom: insets.bottom + 40, marginTop: 10 }
        ]} onPress={handleSubmit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Submit Registration</Text>}
        </TouchableOpacity>
      </ScrollView>

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={hideToast}
        duration={4000}
      />

      <ConfirmationModal
        visible={showBackConfirmation}
        title="Cancel Submission?"
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
  },
  scrollView: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
    marginTop: 26,
  },
  section: {
    marginBottom: 25,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 15,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  label: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  value: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
    flex: 2,
    textAlign: 'right',
  },
  image: {
    width: 60,
    height: 40,
    borderRadius: 4,
  },
  submitButton: {
    backgroundColor: '#075B5E',
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 30,
  },
  submitButtonDisabled: {
    backgroundColor: '#ccc',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ReviewAndSubmit; 

