import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Alert, Dimensions, StatusBar, TextInput, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as ImagePicker from 'expo-image-picker';
import { useDriverRegistration } from '../DriverRegistrationContext';
import ConfirmationModal from '../../components/ui/ConfirmationModal';
import AppModal from '../../components/ui/AppModal';
import DateTimePicker from '@react-native-community/datetimepicker';

const { width, height } = Dimensions.get('window');

const License = () => {
  const router = useRouter();
  const { registrationData, updateRegistrationData } = useDriverRegistration();
  const [driverLicensePhoto, setDriverLicensePhoto] = useState<string | null>(registrationData.licenseFrontImgPath || null);
  const [nationalIdPhoto, setNationalIdPhoto] = useState<string | null>(registrationData.citizenshipDocFrontImgPath || null);
  const [nationalIdBackPhoto, setNationalIdBackPhoto] = useState<string | null>(registrationData.citizenshipDocBackImgPath || null);
  const [licenseNumber, setLicenseNumber] = useState(registrationData.licenseNum || '');
  const [licenseExpiry, setLicenseExpiry] = useState(registrationData.licenseExpiry || '');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [citizenship, setCitizenship] = useState(registrationData.citizenship || '');
  const [citizenshipNumber, setCitizenshipNumber] = useState(registrationData.citizenshipNumber || '');
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

  const handleAddPhoto = async (type: string) => {
    if (loading) return;
    
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permissionResult.granted === false) {
      showModal('info', 'Permission required', 'You need to allow access to your photos to upload an image.');
      return;
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
      base64: false,
    });

    if (!pickerResult.canceled) {
      switch (type) {
        case 'driver_license':
          setDriverLicensePhoto(pickerResult.assets[0].uri);
          break;
        case 'national_id_front':
          setNationalIdPhoto(pickerResult.assets[0].uri);
          break;
        case 'national_id_back':
          setNationalIdBackPhoto(pickerResult.assets[0].uri);
          break;
      }
    }
  };

  const handleNext = () => {
    if (!driverLicensePhoto || !nationalIdPhoto || !nationalIdBackPhoto) {
      showModal('error', 'Error', 'Please upload all required photos');
      return;
    }
    if (!licenseNumber.trim() || !licenseExpiry.trim() || !citizenship.trim() || !citizenshipNumber.trim()) {
      showModal('error', 'Error', 'Please fill in all required fields');
      return;
    }
    
    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(licenseExpiry)) {
      showModal('error', 'Error', 'Please enter license expiry date in YYYY-MM-DD format (e.g., 2025-12-31)');
      return;
    }
    
    // Validate date is not in the past
    const expiryDate = new Date(licenseExpiry);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (expiryDate < today) {
      showModal('error', 'Error', 'License expiry date cannot be in the past');
      return;
    }
    
    setLoading(true);
    try {
      updateRegistrationData({
        ...registrationData,
        licenseFrontImgPath: driverLicensePhoto,
        citizenshipDocFrontImgPath: nationalIdPhoto,
        citizenshipDocBackImgPath: nationalIdBackPhoto,
        licenseNum: licenseNumber,
        licenseExpiry: licenseExpiry,
        citizenship: citizenship,
        citizenshipNumber: citizenshipNumber,
      });
      router.push('/(regSteps)/registerSelfie');
    } catch (error) {
      showModal('error', 'Error', 'Failed to save license information');
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
      <ScrollView style={styles.scrollView}>
        <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBackPress}>
            <Icon name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Driver License</Text>
        </View>
        <View style={styles.content}>
          {/* License Information */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>License Information</Text>
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>License Number</Text>
              <TextInput
                style={[styles.input, loading && styles.inputDisabled]}
                value={licenseNumber}
                onChangeText={setLicenseNumber}
                placeholder="Enter license number"
                editable={!loading}
              />
            </View>
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>License Expiry Date</Text>
              <TouchableOpacity
                style={[styles.input, loading && styles.inputDisabled, { justifyContent: 'center' }]}
                onPress={() => !loading && setShowDatePicker(true)}
                activeOpacity={0.7}
                disabled={loading}
              >
                <Text style={{ color: licenseExpiry ? '#000' : '#ccc', fontSize: 16 }}>
                  {licenseExpiry ? licenseExpiry : 'Select expiry date'}
                </Text>
              </TouchableOpacity>
              <Text style={styles.inputHint}>Format: YYYY-MM-DD</Text>
              {showDatePicker && (
                <DateTimePicker
                  value={licenseExpiry ? new Date(licenseExpiry) : new Date()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(event, selectedDate) => {
                    setShowDatePicker(false);
                    if (selectedDate) {
                      // Format as YYYY-MM-DD
                      const yyyy = selectedDate.getFullYear();
                      const mm = String(selectedDate.getMonth() + 1).padStart(2, '0');
                      const dd = String(selectedDate.getDate()).padStart(2, '0');
                      setLicenseExpiry(`${yyyy}-${mm}-${dd}`);
                    }
                  }}
                  minimumDate={new Date()}
                />
              )}
            </View>
          </View>

          {/* Citizenship Information */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Citizenship Information</Text>
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Citizenship Type</Text>
              <TextInput
                style={[styles.input, loading && styles.inputDisabled]}
                value={citizenship}
                onChangeText={setCitizenship}
                placeholder="Citizenship type"
                editable={!loading}
              />
            </View>
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Citizenship Number</Text>
              <TextInput
                style={[styles.input, loading && styles.inputDisabled]}
                value={citizenshipNumber}
                onChangeText={setCitizenshipNumber}
                placeholder="Enter citizenship number"
                editable={!loading}
              />
            </View>
          </View>

          {/* Driver License Photo */}
          <View style={styles.photoSection}>
            <Text style={styles.sectionTitle}>Front of Driver&apos;s License</Text>
            <View style={styles.imagePlaceholder}>
              {driverLicensePhoto ? (
                <Image source={{ uri: driverLicensePhoto }} style={styles.image} />
              ) : (
                <Image
                  source={require('../../assets/images/driverlicenseplaceholder.jpg')}
                  style={styles.image}
                  resizeMode="contain"
                />
              )}
            </View>
            <TouchableOpacity style={styles.addButton} onPress={() => handleAddPhoto('driver_license')} disabled={loading}>
              <Text style={[styles.addButtonText, loading && styles.addButtonTextDisabled]}>Add a photo</Text>
            </TouchableOpacity>
          </View>
          
          {/* National ID Front */}
          <View style={styles.photoSection}>
            <Text style={styles.sectionTitle}>Front of National ID</Text>
            <View style={styles.imagePlaceholder}>
              {nationalIdPhoto ? (
                <Image source={{ uri: nationalIdPhoto }} style={styles.image} />
              ) : (
                <Image
                  source={require('../../assets/images/nidplaceholder.png')}
                  style={styles.image}
                  resizeMode="contain"
                />
              )}
            </View>
            <TouchableOpacity style={styles.addButton} onPress={() => handleAddPhoto('national_id_front')} disabled={loading}>
              <Text style={[styles.addButtonText, loading && styles.addButtonTextDisabled]}>Add a photo</Text>
            </TouchableOpacity>
          </View>

          {/* National ID Back */}
          <View style={styles.photoSection}>
            <Text style={styles.sectionTitle}>Back of National ID</Text>
            <View style={styles.imagePlaceholder}>
              {nationalIdBackPhoto ? (
                <Image source={{ uri: nationalIdBackPhoto }} style={styles.image} />
              ) : (
                <Image
                  source={require('../../assets/images/nidplaceholder.png')}
                  style={styles.image}
                  resizeMode="contain"
                />
              )}
            </View>
            <TouchableOpacity style={styles.addButton} onPress={() => handleAddPhoto('national_id_back')} disabled={loading}>
              <Text style={[styles.addButtonText, loading && styles.addButtonTextDisabled]}>Add a photo</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.nextButton, loading && styles.nextButtonDisabled]}
            onPress={handleNext}
            disabled={loading}
          >
            <Text style={[styles.nextButtonText, loading && styles.nextButtonTextDisabled]}>
              {loading ? 'Saving...' : 'Next'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <ConfirmationModal
        visible={showBackConfirmation}
        title="Cancel License Setup?"
        message="Are you sure you want to cancel license setup?"
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
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginLeft: 20,
    color: '#333',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  inputContainer: {
    marginBottom: 15,
  },
  inputLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  inputDisabled: {
    backgroundColor: '#f5f5f5',
    color: '#999',
    borderColor: '#ccc',
  },
  inputHint: {
    fontSize: 12,
    color: '#999',
    marginTop: 5,
  },
  photoSection: {
    marginBottom: 30,
  },
  imagePlaceholder: {
    width: '100%',
    height: 200,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    marginBottom: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  addButton: {
    backgroundColor: '#3D74B6',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  addButtonTextDisabled: {
    color: '#ccc',
  },
  nextButton: {
    backgroundColor: '#075B5E',
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  nextButtonDisabled: {
    backgroundColor: '#ccc',
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  nextButtonTextDisabled: {
    color: '#999',
  },
});

export default License;