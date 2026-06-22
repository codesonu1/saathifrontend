import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, StatusBar, Image, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as ImagePicker from 'expo-image-picker';
import { useDriverRegistration } from '../DriverRegistrationContext';
import AppModal from '../../components/ui/AppModal';

const { width, height } = Dimensions.get('window');

const Picture = () => {
  const router = useRouter();
  const { registrationData, updateRegistrationData } = useDriverRegistration();
  const [vehiclePhoto, setVehiclePhoto] = useState<string | null>(registrationData.vehiclePhoto || null);
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

  const handleBack = () => {
    router.back();
  };

  const handleAddPhoto = async () => {
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
        setVehiclePhoto(pickerResult.assets[0].uri);
    }
  };

  const handleDone = () => {
    if (!vehiclePhoto) {
      showModal('error', 'Error', 'Please upload a vehicle photo');
      return;
    }
    updateRegistrationData({
      ...registrationData,
      vehiclePhoto,
    });
    router.push('/(vehDetails)/vBillbook');
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack}>
          <Icon name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Picture</Text>
        <TouchableOpacity onPress={handleBack} style={styles.closeButton}>
          <Text style={styles.closeText}>Close</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.content}>
        <Text style={styles.sectionTitle}>Photo of your vehicle</Text>
        <View style={styles.imagePlaceholder}>
          {vehiclePhoto ? (
            <Image source={{ uri: vehiclePhoto }} style={styles.image} />
          ) : (
            <Image
              source={{ uri: 'https://halacarly.com/assets/images/loadingCar.png' }} // Replace with actual placeholder
              style={styles.image}
              resizeMode="contain"
            />
          )}
        </View>
        <TouchableOpacity style={styles.addButton} onPress={handleAddPhoto}>
          <Text style={styles.addButtonText}>Add a photo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.doneButton} onPress={handleDone} disabled={!vehiclePhoto}>
          <Text style={[styles.doneButtonText, !vehiclePhoto && styles.doneButtonTextDisabled]}>
            Done
          </Text>
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
    paddingTop: 30,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#fff',
    marginTop:30,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  closeButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  closeText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 20,
    backgroundColor: '#fff',
    borderRadius: 16,
    margin: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
    marginBottom: 10,
  },
  imagePlaceholder: {
    width: 200,
    height: 150,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  addButton: {
    backgroundColor: '#3D74B6',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  doneButton: {
    backgroundColor: '#075B5E',
    borderRadius: 25,
    paddingVertical: 16,
    alignItems: 'center',
    width: 340,
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  doneButtonTextDisabled: {
    color: '#999',
  },
});

export default Picture;