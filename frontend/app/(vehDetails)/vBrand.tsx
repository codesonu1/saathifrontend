import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, ScrollView, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useDriverRegistration } from '../DriverRegistrationContext';
import ConfirmationModal from '../../components/ui/ConfirmationModal';

const Brand = () => {
  const router = useRouter();
  const { registrationData, updateRegistrationData } = useDriverRegistration();
  const [brand, setBrand] = useState(registrationData.vehicleBrand || registrationData.vehicleMake || '');
  const [model, setModel] = useState(registrationData.vehicleModel || '');
  const [year, setYear] = useState(registrationData.vehicleYear || '');
  const [color, setColor] = useState(registrationData.vehicleColor || '');
  const [loading, setLoading] = useState(false);
  const [showBackConfirmation, setShowBackConfirmation] = useState(false);

  const handleBack = () => {
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

  const handleSave = async () => {
    if (!brand.trim() || !model.trim() || !year.trim() || !color.trim()) {
      return;
    }

    setLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      updateRegistrationData({
        vehicleBrand: brand,
        vehicleMake: brand, // ensure backend receives vehicleMake
        vehicleModel: model,
        vehicleYear: year,
        vehicleColor: color,
      });
      
      router.push('/(vehDetails)/regPlate');
    } catch (error) {
      // Handle error
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = brand.trim() && model.trim() && year.trim() && color.trim();

  return (
    <View style={styles.container}>
      <ScrollView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} disabled={loading}>
            <Icon name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Brand Details</Text>
          <TouchableOpacity onPress={handleBack} style={styles.closeButton} disabled={loading}>
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.content}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Vehicle Information</Text>
            
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Brand</Text>
              <TextInput
                style={[styles.input, loading && styles.inputDisabled]}
                value={brand}
                onChangeText={setBrand}
                placeholder="Vehicle brand"
                editable={!loading}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Model</Text>
              <TextInput
                style={[styles.input, loading && styles.inputDisabled]}
                value={model}
                onChangeText={setModel}
                placeholder="Vehicle model"
                editable={!loading}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Year</Text>
              <TextInput
                style={[styles.input, loading && styles.inputDisabled]}
                value={year}
                onChangeText={setYear}
                placeholder="Year"
                keyboardType="numeric"
                editable={!loading}
              />
            </View>
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Color</Text>
              <TextInput
                style={[styles.input, loading && styles.inputDisabled]}
                value={color}
                onChangeText={setColor}
                placeholder="Color"
                editable={!loading}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveButton, (!isFormValid || loading) && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={!isFormValid || loading}
          >
            {loading ? (
              <Text style={styles.saveButtonText}>Saving...</Text>
            ) : (
              <Text style={styles.saveButtonText}>Save</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      <ConfirmationModal
        visible={showBackConfirmation}
        title="Cancel Process?"
        message="Are you sure you want to cancel vehicle setup?"
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
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#f8f9fa',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
    marginTop: 30,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    padding: 8,
  },
  closeText: {
    fontSize: 16,
    color: '#075B5E',
    fontWeight: '600',
  },
  content: {
    padding: 20,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#333',
    backgroundColor: '#fff',
  },
  inputDisabled: {
    backgroundColor: '#f5f5f5',
    color: '#999',
    borderColor: '#ccc',
  },
  saveButton: {
    backgroundColor: '#075B5E',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
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

export default Brand;