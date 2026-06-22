import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Dimensions, StatusBar, Alert, ActivityIndicator } from 'react-native';
import { TextInput, Button } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import apiClient from '../utils/apiClient';
import * as ImagePicker from 'expo-image-picker';
import AppModal from '../../components/ui/AppModal';
import Constants from 'expo-constants';

const { width } = Dimensions.get('window');
const ASSET_BASE_URL = Constants.expoConfig?.extra?.PUBLIC_ASSET_URL || 'http://192.168.1.71:9000';
const DEFAULT_BASE_URL = Constants.expoConfig?.extra?.DEFAULT_BASE_URL || 'http://localhost:3000';

const ProfileSettingsScreen = () => {
  const router = useRouter();
  const [name, setName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [loading, setLoading] = useState(true);
  const [imageUri, setImageUri] = useState('https://www.shutterstock.com/image-vector/default-avatar-photo-placeholder-grey-600nw-2007531536.jpg'); // Default image
  const [uploading, setUploading] = useState(false);
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

  // Helper function to get full image URL
  const getFullImageUrl = (imageUrl: string | null | undefined) => {
    if (!imageUrl) return 'https://www.shutterstock.com/image-vector/default-avatar-photo-placeholder-grey-600nw-2007531536.jpg';
    if (imageUrl.startsWith('http')) return imageUrl;
    return `${ASSET_BASE_URL}${imageUrl}`;
  };

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const response = await apiClient.get('me');
        const userData = response.data.data;
        
        setName(userData.firstName || '');
        setLastName(userData.lastName || '');
        setEmail(userData.email || '');
        setMobile(userData.mobile || '');
        
        const photoUrl = getFullImageUrl(userData.photo);
        setImageUri(photoUrl);
      } catch (err) {
        console.error('Failed to fetch user data:', err);
        showModal('error', 'Error', 'Failed to load profile data. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchUserData();
  }, []);

  const handleSave = async () => {
    setLoading(true);
    try {
      const updateUserDto = { firstName: name, lastName, email };
      const response = await apiClient.patch('me', updateUserDto);
      if (response.data.statusCode === 200) {
        showModal('success', 'Success', 'Profile updated successfully');
        setTimeout(() => {
          hideModal();
          router.back();
        }, 1200);
      }
    } catch (err) {
      console.error('Failed to update profile:', err);
      showModal('error', 'Error', 'Failed to update profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permissionResult.granted === false) {
      showModal('info', 'Permission required', 'You need to allow access to your photos to upload an image.');
      return;
    }
    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: false, 
    });
    if (!pickerResult.canceled) {
      setUploading(true);
      try {
        const uri = pickerResult.assets[0].uri;
        
        // Create form data for file upload
        const formData = new FormData();
        formData.append('file', {
          uri: uri,
          type: 'image/jpeg',
          name: 'profile.jpg',
        } as any);

        
        // First, upload the file to uploads endpoint
        const uploadResponse = await apiClient.post('uploads/public', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });

        

        if (uploadResponse.data.statusCode === 201) {
          const imageUrl = uploadResponse.data.data.url;

          let fixedImageUrl = imageUrl;
          if (imageUrl.includes('localhost:3000')) {
            fixedImageUrl = imageUrl.replace(DEFAULT_BASE_URL, ASSET_BASE_URL);

          }
          
          // Then update the profile with the image URL
          const profileUpdateData = { photo: fixedImageUrl };

          
          const profileResponse = await apiClient.patch('me', profileUpdateData);
   
          if (profileResponse.data.statusCode === 200) {
            const newUrl = getFullImageUrl(profileResponse.data.data.photo);
            
            setImageUri(newUrl);
            showModal('success', 'Success', 'Profile image updated successfully');
          } else {
            console.error('Profile update failed:', profileResponse.data);
            showModal('error', 'Error', 'Failed to update profile with new image.');
          }
        } else {
          console.error('Image upload failed:', uploadResponse.data);
          showModal('error', 'Error', 'Failed to upload image.');
        }
      } catch (err: any) {
        console.error('Failed to upload image:', err);
        console.error('Error details:', {
          message: err.message,
          response: err.response?.data,
          status: err.response?.status,
          config: err.config
        });
        
        if (err.code === 'NETWORK_ERROR') {
          showModal('error', 'Network Error', 'Please check your internet connection and try again.');
        } else if (err.response?.status === 413) {
          showModal('error', 'Error', 'Image file is too large. Please select a smaller image.');
        } else if (err.response?.status === 400) {
          showModal('error', 'Error', 'Invalid image format. Please select a valid image file.');
        } else {
          showModal('error', 'Error', `Failed to upload image: ${err.message || 'Unknown error'}`);
        }
      } finally {
        setUploading(false);
      }
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#00809D" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{
          backgroundColor: '#075B5E',
          borderRadius: 20,
          width: 40,
          height: 40,
          justifyContent: 'center',
          alignItems: 'center',
          elevation: 3,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
        }}>
          <Icon name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile Settings</Text>
      </View>
      <View style={styles.profileContainer}>
        <View style={styles.profileImageContainer}>
          <Image
            style={styles.profileImage}
            source={{ uri: imageUri }}
          />
          <TouchableOpacity style={styles.addImageButton} onPress={handleImageUpload} disabled={uploading}>
            {uploading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Icon name="add" size={24} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.inputContainer}>
        <TextInput
          mode="flat"
          placeholder="Enter your first name"
          placeholderTextColor="#ccc"
          value={name}
          onChangeText={setName}
          style={styles.input}
          underlineColor="transparent"
          activeUnderlineColor="transparent"
          cursorColor="#075B5E"
        />
        <TextInput
          mode="flat"
          placeholder="Enter your last name"
          placeholderTextColor="#ccc"
          value={lastName}
          onChangeText={setLastName}
          style={styles.input}
          underlineColor="transparent"
          activeUnderlineColor="transparent"
          cursorColor="#075B5E"
        />
        <TextInput
          mode="flat"
          value={email}
          onChangeText={setEmail}
          placeholder="Enter your email"
          placeholderTextColor="#ccc"
          keyboardType="email-address"
          autoCapitalize="none"
          style={styles.input}
          underlineColor="transparent"
          activeUnderlineColor="transparent"
          cursorColor="#075B5E"
        />
        <TextInput
          mode="flat"
          value={mobile}
          style={styles.input}
          underlineColor="transparent"
          placeholder="Your phone number"
          placeholderTextColor="#ccc"
          activeUnderlineColor="transparent"
          editable={false}
        />
        <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={loading}>
          <Text style={styles.saveButtonText}>{loading ? 'Saving...' : 'Save'}</Text>
        </TouchableOpacity>
      </View>
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
    paddingTop: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    marginTop: 25,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginLeft: 16,
  },
  profileContainer: {
    alignItems: 'center',
    marginVertical: 20,
  },
  profileImageContainer: {
    position: 'relative',
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#f0f0f0',
    marginBottom: 20,
  },
  addImageButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  inputContainer: {
    paddingHorizontal: 16,
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginBottom: 16,
    paddingHorizontal: 12,
    height: 50,
  },
  saveButton: {
    backgroundColor: '#075B5E',
    borderRadius: 12,
    paddingVertical: 16,
    marginHorizontal: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ProfileSettingsScreen;