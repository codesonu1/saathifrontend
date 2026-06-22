import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Dimensions, StatusBar, Image, Alert, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as ImagePicker from 'expo-image-picker';
import { useDriverRegistration } from '../DriverRegistrationContext';
import AppModal from '../../components/ui/AppModal';

const { width, height } = Dimensions.get('window');

const Billbook = () => {
  const router = useRouter();
  const { registrationData, updateRegistrationData } = useDriverRegistration();
  const [regPhoto, setRegPhoto] = useState<string | null>(registrationData.blueBookFrontImgPath || null);
  const [descPhoto, setDescPhoto] = useState<string | null>(registrationData.blueBookBackImgPath || null);
  const [billbookNumber, setBillbookNumber] = useState(registrationData.billbookNumber || '');
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

  const handleAddPhoto = async (setPhoto: React.Dispatch<React.SetStateAction<string | null>>) => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permissionResult.granted === false) {
      showModal('info', 'Permission required', 'You need to allow access to your photos to upload an image.');
      return;
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [10, 7],
      quality: 0.8,
      base64: false,
    });

    if (!pickerResult.canceled) {
      const uri = pickerResult.assets[0].uri;
      setPhoto(uri);
    }
  };

  const handleDone = () => {
    if (!regPhoto || !descPhoto || !billbookNumber.trim()) {
      showModal('error', 'Error', 'Please upload both billbook photos and enter the billbook number');
      return;
    }
    updateRegistrationData({
      ...registrationData,
      blueBookFrontImgPath: regPhoto,
      blueBookBackImgPath: descPhoto,
      billbookNumber,
    });
    router.push('/(regSteps)/reviewAndSubmit');
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack}>
          <Icon name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Billbook</Text>
        <TouchableOpacity onPress={handleBack} style={styles.closeButton}>
          <Text style={styles.closeText}>Close</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.contentContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <Text style={styles.sectionTitle}>Billbook Number</Text>
          <TextInput
            style={styles.input}
            value={billbookNumber}
            onChangeText={setBillbookNumber}
            placeholder="Enter billbook number"
            placeholderTextColor="#ccc"
            numberOfLines={2}
          />
          <Text style={styles.sectionTitle}>Billbook page with vehicle registration number</Text>
          <View style={styles.imagePlaceholder}>
            {regPhoto ? (
              <Image source={{ uri: regPhoto }} style={styles.image} />
            ) : (
              <Image
                source={require('../../assets/images/billbookpc.png')} // Replace with actual placeholder
                style={styles.image}
                resizeMode="contain"
              />
            )}
          </View>
          <TouchableOpacity style={styles.addButton} onPress={() => handleAddPhoto(setRegPhoto)}>
            <Text style={styles.addButtonText}>Add a photo</Text>
          </TouchableOpacity>
          <Text style={styles.instructions}>
            Upload the billbook page with vehicle registration number or other relevant details.
          </Text>
          <Text style={styles.sectionTitle}>Billbook page with detailed description of the vehicle</Text>
          <View style={styles.imagePlaceholder}>
            {descPhoto ? (
              <Image source={{ uri: descPhoto }} style={styles.image} />
            ) : (
              <Image
                source={require('../../assets/images/billbook2pc.png')} // Replace with actual placeholder
                style={styles.image}
                resizeMode="contain"
              />
            )}
          </View>
          <TouchableOpacity style={styles.addButton} onPress={() => handleAddPhoto(setDescPhoto)}>
            <Text style={styles.addButtonText}>Add a photo</Text>
          </TouchableOpacity>
          <Text style={styles.instructions}>
            Upload the billbook page with detailed description or other relevant details.
          </Text>
          <TouchableOpacity style={styles.doneButton} onPress={handleDone} disabled={!regPhoto || !descPhoto || !billbookNumber.trim()}>
            <Text style={[styles.doneButtonText, (!regPhoto || !descPhoto || !billbookNumber.trim()) && styles.doneButtonTextDisabled]}>
              Done
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  contentContainer: {
    flex: 1,
  },
  content: {
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
  },
  sectionTitle: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
    marginBottom: 8,
    marginTop: 15,
  },
  input: {
    width: '100%',
    height: 60,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 20,
    backgroundColor: '#f8f9fa',
    textAlignVertical: 'top',
  },
  imagePlaceholder: {
    width: '100%',
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
    marginBottom: 15,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  instructions: {
    fontSize: 12,
    color: '#666',
    textAlign: 'left',
    marginBottom: 15,
  },
  doneButton: {
    backgroundColor: '#075B5E',
    borderRadius: 25,
    paddingVertical: 16,
    alignItems: 'center',
    width: '100%',
    marginTop: 20,
    marginBottom: 20,
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

export default Billbook;