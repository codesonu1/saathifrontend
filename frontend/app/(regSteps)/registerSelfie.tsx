import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Alert, Dimensions, StatusBar, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as ImagePicker from 'expo-image-picker';
import { useDriverRegistration } from '../DriverRegistrationContext';
import ConfirmationModal from '../../components/ui/ConfirmationModal';
import AppModal from '../../components/ui/AppModal';

const { width, height } = Dimensions.get('window');

const Selfie = () => {
  const router = useRouter();
  const { registrationData, updateRegistrationData } = useDriverRegistration();
  const [selfiePhoto, setSelfiePhoto] = useState<string | null>(registrationData.selfiePhoto || null);
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

  const handleAddPhoto = async () => {
    if (loading) return;
    
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permissionResult.granted === false) {
      showModal('info', 'Permission required', 'You need to allow access to your photos to upload an image.');
      return;
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [4, 4],
      quality: 0.8,
      base64: false,
    });

    if (!pickerResult.canceled) {
      setSelfiePhoto(pickerResult.assets[0].uri);
    }
  };

  const handleDone = () => {
    if (!selfiePhoto) {
      showModal('error', 'Error', 'Please upload a selfie with your driver license');
      return;
    }
    
    setLoading(true);
    try {
      updateRegistrationData({
        ...registrationData,
        selfiePhoto,
      });
      router.push('/(vehDetails)/vBrand');
    } catch (error) {
      showModal('error', 'Error', 'Failed to save selfie information');
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
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBackPress}>
          <Icon name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Selfie with ID</Text>
      </View>
      <View style={styles.content}>
        <View style={styles.photoSection}>
          <Text style={styles.sectionTitle}>Selfie with ID (Optional)</Text>
          <View style={styles.imagePlaceholder}>
            {selfiePhoto ? (
              <Image source={{ uri: selfiePhoto }} style={styles.image} />
            ) : (
              <Image
                source={require('../../assets/images/selfiewithid.jpg')} // Replace with actual placeholder
                style={styles.image}
                resizeMode="contain"
              />
            )}
          </View>
          <TouchableOpacity style={styles.addButton} onPress={handleAddPhoto} disabled={loading}>
            <Text style={[styles.addButtonText, loading && styles.addButtonTextDisabled]}>Add a photo</Text>
          </TouchableOpacity>
          <Text style={styles.instructions}>
            Take a selfie with your driver license next to your face. Make sure your face and information on your document are clearly visible.
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.saveButton, (!selfiePhoto || loading) && styles.saveButtonDisabled]}
          onPress={handleDone}
          disabled={!selfiePhoto || loading}
        >
          <Text style={[styles.saveButtonText, (!selfiePhoto || loading) && styles.saveButtonTextDisabled]}>
            {loading ? 'Saving...' : 'Done'}
          </Text>
        </TouchableOpacity>
        <Text style={styles.supportText}>
          If you have questions, please contact Support.
        </Text>
      </View>

      <ConfirmationModal
        visible={showBackConfirmation}
        title="Cancel Selfie Setup?"
        message="Are you sure you want to cancel selfie setup?"
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
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  photoSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  imagePlaceholder: {
    width: width - 80,
    height: width - 80,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    marginBottom: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  addButton: {
    backgroundColor: '#075B5E',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
    marginBottom: 20,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  addButtonTextDisabled: {
    color: '#ccc',
  },
  instructions: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  saveButton: {
    backgroundColor: '#075B5E',
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 15,
  },
  saveButtonDisabled: {
    backgroundColor: '#ccc',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButtonTextDisabled: {
    color: '#999',
  },
  supportText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
});

export default Selfie;