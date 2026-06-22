import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Dimensions, StatusBar, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useDriverRegistration } from '../DriverRegistrationContext';
import AppModal from '../../components/ui/AppModal';

const { width, height } = Dimensions.get('window');

const RegistrationPlate = () => {
  const router = useRouter();
  const { registrationData, updateRegistrationData } = useDriverRegistration();
  const [plateNumber, setPlateNumber] = useState(registrationData.vehicleRegNum || '');
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

  const handleDone = () => {
    if (!plateNumber.trim()) {
      showModal('error', 'Error', 'Please enter a registration plate number');
      return;
    }
    updateRegistrationData({
      ...registrationData,
      vehicleRegNum: plateNumber,
    });
    router.push('/(vehDetails)/vPicture');
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack}>
          <Icon name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Registration plate</Text>
        <TouchableOpacity onPress={handleBack} style={styles.closeButton}>
          <Text style={styles.closeText}>Close</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.content}>
        <TextInput
          style={styles.input}
          value={plateNumber}
          onChangeText={setPlateNumber}
          placeholder="Enter registration plate"
          placeholderTextColor="#ccc"
        />
        <TouchableOpacity style={styles.doneButton} onPress={handleDone} disabled={!plateNumber.trim()}>
          <Text style={[styles.doneButtonText, !plateNumber.trim() && styles.doneButtonTextDisabled]}>
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
    marginTop:34,
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
  input: {
    width: '100%',
    height: 50,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 10,
    marginBottom: 20,
    backgroundColor: '#f5f5f5',
  },
  doneButton: {
    backgroundColor: '#075B5E',
    borderRadius: 25,
    paddingVertical: 16,
    alignItems: 'center',
    width: 350,
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

export default RegistrationPlate;