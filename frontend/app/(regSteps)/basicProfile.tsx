import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Dimensions, StatusBar, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { TextInput, Button } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useDriverRegistration } from '../DriverRegistrationContext';
import ConfirmationModal from '../../components/ui/ConfirmationModal';
import AppModal from '../../components/ui/AppModal';

const { width, height } = Dimensions.get('window');

const ProfileSettingsScreen = () => {
  const router = useRouter();
  const { registrationData, updateRegistrationData } = useDriverRegistration();
  const [name, setName] = useState(registrationData.firstName || '');
  const [lastName, setLastName] = useState(registrationData.lastName || '');
  const [email, setEmail] = useState(registrationData.email || '');
  const [city, setCity] = useState(registrationData.city || '');
  const [profileImage, setProfileImage] = useState<string | null>(registrationData.profileImage || null);
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

  const handleSave = () => {
    if (!name.trim() || !lastName.trim() || !email.trim() || !city.trim()) {
      showModal('error', 'Error', 'Please fill in all required fields');
      return;
    }
    
    setLoading(true);
    try {
      updateRegistrationData({
        ...registrationData,
        firstName: name,
        lastName,
        email,
        city,
        profileImage,
      });
      router.push('/(regSteps)/driverLicense');
    } catch (error) {
      showModal('error', 'Error', 'Failed to save profile information');
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async () => {
    if (loading) return;
    
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permissionResult.granted === false) {
      showModal('info', 'Permission required', 'You need to allow access to your photos to upload an image.');
      return;
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: false,
    });

    if (!pickerResult.canceled) {
      setProfileImage(pickerResult.assets[0].uri);
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
        <Text style={styles.headerTitle}>Profile settings</Text>
      </View>
      <View style={styles.profileContainer}>
        <View style={styles.profileImageContainer}>
          <Image
            style={styles.profileImage}
            source={{ uri: profileImage || 'https://www.shutterstock.com/image-vector/default-avatar-photo-placeholder-grey-600nw-2007531536.jpg' }} // Placeholder image
          />
          <TouchableOpacity style={styles.addImageButton} onPress={handleImageUpload} disabled={loading}>
            <Icon name="add" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.inputContainer}>
        <TextInput
          mode="flat"
          placeholder='Enter your first name'
          placeholderTextColor={'#ccc'}
          value={name}
          onChangeText={setName}
          style={[styles.input, loading && styles.inputDisabled]}
          underlineColor="transparent"
          activeUnderlineColor="transparent"
          editable={!loading}
          cursorColor="#075B5E"
        />
        <TextInput
          mode="flat"
          placeholder='Enter your last name'
          placeholderTextColor={'#ccc'}
          value={lastName}
          onChangeText={setLastName}
          style={[styles.input, loading && styles.inputDisabled]}
          underlineColor="transparent"
          activeUnderlineColor="transparent"
          editable={!loading}
          cursorColor="#075B5E"
        />
        <TextInput
          mode="flat"
          value={email}
          onChangeText={setEmail}
          placeholder='Enter your email'
          placeholderTextColor={'#ccc'}      
          keyboardType="email-address"
          autoCapitalize="none"
          style={[styles.input, loading && styles.inputDisabled]}
          underlineColor="transparent"
          activeUnderlineColor="transparent"
          editable={!loading}
          cursorColor="#075B5E"
        />
        <TextInput
            mode="flat"
            value={city}
            onChangeText={setCity}
            style={[styles.input, loading && styles.inputDisabled]}
            underlineColor="transparent"
            placeholder='Enter your city'
            placeholderTextColor={'#ccc'}
            activeUnderlineColor="transparent"
            editable={!loading}
            cursorColor="#075B5E"
        />
      </View>
      <TouchableOpacity style={[styles.saveButton, loading && styles.saveButtonDisabled]} onPress={handleSave} disabled={loading}>
        <Text style={styles.saveButtonText}>{loading ? 'Saving...' : 'Save'}</Text>
      </TouchableOpacity>

      <ConfirmationModal
        visible={showBackConfirmation}
        title="Cancel Profile Setup?"
        message="Are you sure you want to cancel profile setup?"
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
  profileContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  profileImageContainer: {
    position: 'relative',
  },
  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  addImageButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#075B5E',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputContainer: {
    paddingHorizontal: 20,
    marginBottom: 30,
  },
  input: {
    backgroundColor: '#f8f9fa',
    marginBottom: 15,
    borderRadius: 8,
  },
  inputDisabled: {
    backgroundColor: '#f5f5f5',
    color: '#999',
  },
  saveButton: {
    backgroundColor: '#075B5E',
    marginHorizontal: 20,
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#ccc',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ProfileSettingsScreen;