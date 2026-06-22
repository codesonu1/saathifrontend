import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, ChevronRight} from 'lucide-react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDriverRegistration } from '../DriverRegistrationContext';
import apiClient from '../utils/apiClient';
import AppModal from '../../components/ui/AppModal';

type Vehicle = {
  _id: string;
  name: string;
  description?: string;
  basePrice?: number;
};

const ChooseVehicle = () => {
  const router = useRouter();
  const { updateRegistrationData } = useDriverRegistration();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    fetchVehicleTypes();
  }, []);

  const fetchVehicleTypes = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('vehicle-types');
      if (response.data.statusCode === 200) {
        setVehicles(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch vehicle types:', error);
      showModal('error', 'Error', 'Failed to load vehicle types. Please try again.');
      // Fallback to default vehicles
      setVehicles([
        { _id: 'car', name: 'Car', description: '4-seater car' },
        { _id: 'rickshaw', name: 'Rickshaw', description: '3-wheeler rickshaw' },
        { _id: 'motorcycle', name: 'Motorcycle', description: '2-wheeler motorcycle' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    router.back();
  };

  const handleClose = () => {
    router.push('/');
  };

  const handleVehicleSelect = (vehicleType: string) => {
    updateRegistrationData({ vehicleType });
    router.push(`/registration?vehicle=${vehicleType}`);
  };

  const getVehicleIcon = (vehicleName: string) => {
    const name = vehicleName.toLowerCase();
    if (name.includes('car')) return 'car';
    if (name.includes('motorcycle') || name.includes('bike')) return 'motorbike';
    if (name.includes('rickshaw')) return 'rickshaw';
    return 'car'; // default
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#f5f5f5" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#075B5E" />
          <Text style={styles.loadingText}>Loading vehicle types...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f5f5f5" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <ArrowLeft size={24} color="#333" />
        </TouchableOpacity>
        {/* Removed close button */}
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>Choose your vehicle</Text>

        <View style={styles.vehicleList}>
          {vehicles.map((vehicle) => (
            <TouchableOpacity
              key={vehicle._id}
              style={styles.vehicleItem}
              onPress={() => handleVehicleSelect(vehicle._id)}
            >
              <View style={styles.vehicleContent}>
                <View style={styles.vehicleIcon}>
                  <MaterialCommunityIcons name={getVehicleIcon(vehicle.name)} size={32} color="#333" />
                </View>
                <View style={styles.vehicleInfo}>
                  <Text style={styles.vehicleName}>{vehicle.name}</Text>
                  {vehicle.description && (
                    <Text style={styles.vehicleDescription}>{vehicle.description}</Text>
                  )}
                  {vehicle.basePrice && (
                    <Text style={styles.vehiclePrice}>Base: रू{vehicle.basePrice}</Text>
                  )}
                </View>
              </View>
              <ChevronRight size={20} color="#666" />
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <AppModal
        visible={modal.visible}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        onClose={hideModal}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    marginTop: 30,
  },
  closeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 30,
  },
  closeText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#333',
    marginBottom: 40,
  },
  vehicleList: {
    gap: 16,
  },
  vehicleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  vehicleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  vehicleIcon: {
    marginRight: 16,
  },
  vehicleInfo: {
    flex: 1,
  },
  vehicleName: {
    fontSize: 18,
    color: '#333',
    fontWeight: '500',
    marginBottom: 4,
  },
  vehicleDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  vehiclePrice: {
    fontSize: 12,
    color: '#075B5E',
    fontWeight: '500',
  },
});

export default ChooseVehicle;