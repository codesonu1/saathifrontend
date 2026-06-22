//This is mock as my old Ui-based layout used it for bargaing, changed based on client's request
"use client"

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
  StatusBar,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import Toast from '../../components/ui/Toast';
import ConfirmationModal from '../../components/ui/ConfirmationModal';
import ProfileImage from '../../components/ProfileImage';

interface Driver {
  id: string;
  name: string;
  photo: string;
  rating: number;
  distance: number;
  vehicle: string;
  fare: number;
  eta: number;
}

interface DriverResponse {
  message: string;
  fare: number;
}

const DriverSelectionScreen = () => {
  const router = useRouter();
  const params = useLocalSearchParams();
  const from = params.from as string;
  const to = params.to as string;
  const vehicle = params.vehicle as string;
  const fare = parseFloat(params.fare as string);

  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(false);
  const [bargainingDriver, setBargainingDriver] = useState<Driver | null>(null);
  const [bargainFare, setBargainFare] = useState(fare);
  const [bargainMessage, setBargainMessage] = useState('');
  const [driverResponse, setDriverResponse] = useState<DriverResponse | null>(null);
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

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ visible: true, message, type });
  };

  const hideToast = () => {
    setToast(prev => ({ ...prev, visible: false }));
  };

  useEffect(() => {
    // Simulate loading drivers
    setLoading(true);
    setTimeout(() => {
      const mockDrivers: Driver[] = [
        {
          id: '1',
          name: 'Rajesh Kumar',
          photo: '',
          rating: 4.8,
          distance: 0.5,
          vehicle: vehicle,
          fare: fare * 1.1,
          eta: 3,
        },
        {
          id: '2',
          name: 'Amit Singh',
          photo: '',
          rating: 4.6,
          distance: 0.8,
          vehicle: vehicle,
          fare: fare * 0.9,
          eta: 5,
        },
        {
          id: '3',
          name: 'Suresh Patel',
          photo: '',
          rating: 4.9,
          distance: 1.2,
          vehicle: vehicle,
          fare: fare * 1.2,
          eta: 7,
        },
      ];
      setDrivers(mockDrivers);
      setLoading(false);
    }, 2000);
  }, [fare, vehicle]);

  const handleBackPress = () => {
    if (loading || bargainingDriver) {
      setShowBackConfirmation(true);
    } else {
      router.back();
    }
  };

  const handleConfirmBack = () => {
    setShowBackConfirmation(false);
    if (bargainingDriver) {
      setBargainingDriver(null);
      setDriverResponse(null);
      setBargainMessage('');
      setBargainFare(fare);
    } else {
      router.back();
    }
  };

  const handleCancelBack = () => {
    setShowBackConfirmation(false);
  };

  const selectDriver = (driver: Driver) => {
    setBargainingDriver(driver);
    setBargainFare(driver.fare);
  };

  const cancelBargain = () => {
    setBargainingDriver(null);
    setDriverResponse(null);
    setBargainMessage('');
    setBargainFare(fare);
  };

  const adjustFare = (increase: boolean) => {
    const change = increase ? 10 : -10;
    setBargainFare(prev => Math.max(50, prev + change));
  };

  const sendBargain = async () => {
    if (!bargainingDriver) return;
    
    setLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Simulate driver response
      const response: DriverResponse = {
        message: 'I can do रू' + (bargainFare - 20).toFixed(0) + '. Is that okay?',
        fare: bargainFare - 20,
      };
      setDriverResponse(response);
      showToast('Offer sent to driver!', 'success');
    } catch (error) {
      showToast('Failed to send offer', 'error');
    } finally {
      setLoading(false);
    }
  };

  const confirmBargain = async () => {
    if (!driverResponse || !bargainingDriver) return;
    
    setLoading(true);
    try {
      // Simulate booking confirmation
      await new Promise(resolve => setTimeout(resolve, 1500));
      showToast('Ride booked successfully!', 'success');
      
      // Navigate to ride tracker
      setTimeout(() => {
        router.push({
          pathname: '../(common)/rideTracker',
          params: {
            rideId: 'mock-ride-id',
            driverName: bargainingDriver.name,
            passengerName: 'You',
            from,
            to,
            fare: driverResponse.fare.toString(),
            vehicle,
            rideInProgress: 'true',
            progress: '0',
          },
        });
      }, 1000);
    } catch (error) {
      showToast('Failed to book ride', 'error');
    } finally {
      setLoading(false);
    }
  };

  const renderDriverItem = ({ item }: { item: Driver }) => (
    <TouchableOpacity 
      style={styles.driverCard} 
      onPress={() => selectDriver(item)}
      disabled={loading}
    >
      <View style={styles.driverInfo}>
        <ProfileImage 
          photoUrl={item.photo}
          size={48}
          fallbackIconColor="#075B5E"
        />
        <View style={styles.driverDetails}>
          <Text style={styles.driverName}>{item.name}</Text>
          <View style={styles.driverMeta}>
            <MaterialIcons name="star" size={16} color="#FFD700" />
            <Text style={styles.driverRating}>{item.rating}</Text>
            <Text style={styles.driverDistance}>• {item.distance} km away</Text>
          </View>
          <Text style={styles.driverVehicle}>{item.vehicle}</Text>
        </View>
      </View>
      <View style={styles.driverActions}>
        <View style={styles.fareInfo}>
          <Text style={styles.fareAmount}>रू{item.fare.toFixed(0)}</Text>
          <Text style={styles.etaText}>{item.eta} min</Text>
        </View>
        <TouchableOpacity 
          style={[styles.selectButton, loading && styles.selectButtonDisabled]}
          onPress={() => selectDriver(item)}
          disabled={loading}
        >
          <Text style={styles.selectButtonText}>Select</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  if (bargainingDriver) {
    return (
      <SafeAreaView style={styles.container}>
          <StatusBar barStyle="light-content" backgroundColor="#075B5E" />

          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
              <MaterialIcons name="arrow-back" size={24} color="#000" />
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle}>Negotiate Fare</Text>
              <Text style={styles.headerSubtitle}>with {bargainingDriver.name}</Text>
            </View>
            <View style={styles.placeholder} />
          </View>

          <View style={styles.bargainContainer}>
            {/* Driver Info Card */}
            <View style={styles.bargainDriverCard}>
              <View style={styles.bargainDriverInfo}>
                <ProfileImage 
                  photoUrl={bargainingDriver.photo}
                  size={48}
                  fallbackIconColor="#075B5E"
                />
                <View>
                  <Text style={styles.bargainDriverName}>{bargainingDriver.name}</Text>
                  <View style={styles.driverMeta}>
                    <MaterialIcons name="star" size={16} color="#FFD700" />
                    <Text style={styles.driverRating}>{bargainingDriver.rating}</Text>
                    <Text style={styles.driverDistance}>• {bargainingDriver.distance} km away</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Fare Adjustment */}
            <View style={styles.fareCard}>
              <Text style={styles.fareCardTitle}>Adjust Your Offer</Text>
              <View style={styles.fareControls}>
                <TouchableOpacity style={styles.fareControlButton} onPress={() => adjustFare(false)} disabled={loading}>
                  <MaterialIcons name="remove" size={24} color="#fff" />
                </TouchableOpacity>
                <View style={styles.fareDisplay}>
                  <Text style={styles.bargainFareAmount}>रू{bargainFare.toFixed(0)}</Text>
                  <Text style={styles.bargainFareLabel}>Your Offer</Text>
                </View>
                <TouchableOpacity style={styles.fareControlButton} onPress={() => adjustFare(true)} disabled={loading}>
                  <MaterialIcons name="add" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Message Input */}
            <View style={styles.messageCard}>
              <Text style={styles.messageTitle}>Add a message</Text>
              <TextInput
                style={[styles.messageInput, loading && styles.messageInputDisabled]}
                placeholder="Message to driver"
                placeholderTextColor="#999"
                value={bargainMessage}
                onChangeText={setBargainMessage}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                editable={!loading}
              />
            </View>

            {/* Driver Response */}
            {driverResponse && (
              <View style={styles.responseCard}>
                <View style={styles.responseHeader}>
                  <MaterialIcons name="chat-bubble" size={20} color="#075B5E" />
                  <Text style={styles.responseTitle}>Driver's Response</Text>
                </View>
                <Text style={styles.responseMessage}>"{driverResponse.message}"</Text>
                <View style={styles.responseFare}>
                  <Text style={styles.responseFareLabel}>Counter Offer:</Text>
                  <Text style={styles.responseFareAmount}>रू{driverResponse.fare.toFixed(0)}</Text>
                </View>
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.actionButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={cancelBargain} disabled={loading}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              {driverResponse ? (
                <TouchableOpacity 
                  style={[styles.confirmButton, loading && styles.confirmButtonDisabled]} 
                  onPress={confirmBargain}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.confirmButtonText}>Accept & Book</Text>
                  )}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.sendButton, loading && styles.sendButtonDisabled]}
                  onPress={sendBargain}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.sendButtonText}>Send Offer</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>

          <Toast
            visible={toast.visible}
            message={toast.message}
            type={toast.type}
            onHide={hideToast}
            duration={4000}
          />

          <ConfirmationModal
            visible={showBackConfirmation}
            title="Cancel Process?"
            message={bargainingDriver 
              ? "You are currently negotiating with a driver. Are you sure you want to cancel this process?"
              : "You are currently searching for drivers. Are you sure you want to cancel this process?"
            }
            confirmText="Cancel"
            cancelText="Continue"
            onConfirm={handleConfirmBack}
            onCancel={handleCancelBack}
            type="warning"
          />
        </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#075B5E" />

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Available Drivers</Text>
            <Text style={styles.headerSubtitle}>{drivers.length} drivers nearby</Text>
          </View>
          <View style={styles.placeholder} />
        </View>

        {/* Trip Info */}
        <View style={styles.tripInfo}>
          <View style={styles.tripRoute}>
            <View style={styles.routePoint}>
              <View style={styles.pickupDot} />
              <Text style={styles.routeText} numberOfLines={1}>
                {from}
              </Text>
            </View>
            <View style={styles.routeLine} />
            <View style={styles.routePoint}>
              <View style={styles.dropDot} />
              <Text style={styles.routeText} numberOfLines={1}>
                {to}
              </Text>
            </View>
          </View>
          <View style={styles.tripVehicleInfo}>
            <MaterialIcons 
              name={
                (Array.isArray(vehicle) ? vehicle[0] : vehicle)?.toLowerCase().includes('bike')
                  ? "motorcycle" 
                  : "directions-car"
              } 
              size={20} 
              color="#075B5E" 
            />
            <Text style={styles.vehicleText}>{Array.isArray(vehicle) ? vehicle[0] : vehicle}</Text>
          </View>
        </View>

        {/* Drivers List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#075B5E" />
            <Text style={styles.loadingText}>Searching for drivers...</Text>
          </View>
        ) : (
          <FlatList
            data={drivers}
            renderItem={renderDriverItem}
            keyExtractor={(item) => item.id}
            style={styles.driversList}
            contentContainerStyle={styles.driversListContent}
            showsVerticalScrollIndicator={false}
          />
        )}

        <Toast
          visible={toast.visible}
          message={toast.message}
          type={toast.type}
          onHide={hideToast}
          duration={4000}
        />

        <ConfirmationModal
          visible={showBackConfirmation}
          title="Cancel Driver Search?"
          message="Are you sure you want to cancel driver search?"
          confirmText="Cancel"
          cancelText="Continue"
          onConfirm={handleConfirmBack}
          onCancel={handleCancelBack}
          type="warning"
        />
      </SafeAreaView>
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
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  backButton: {
    padding: 8,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  placeholder: {
    width: 40,
  },
  tripInfo: {
    backgroundColor: '#fff',
    padding: 20,
    marginBottom: 8,
  },
  tripRoute: {
    marginBottom: 12,
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  pickupDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#075B5E',
    marginRight: 12,
  },
  dropDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EA2F14',
    marginRight: 12,
  },
  routeText: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  routeLine: {
    width: 2,
    height: 20,
    backgroundColor: '#ddd',
    marginLeft: 3,
    marginVertical: 4,
  },
  tripVehicleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vehicleText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#666',
  },
  driversList: {
    flex: 1,
  },
  driversListContent: {
    padding: 16,
  },
  driverCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  driverInfo: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  driverDetails: {
    flex: 1,
    marginLeft: 12,
  },
  driverName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  driverMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  driverRating: {
    marginLeft: 4,
    fontSize: 14,
    color: '#666',
  },
  driverDistance: {
    marginLeft: 8,
    fontSize: 14,
    color: '#666',
  },
  driverVehicle: {
    fontSize: 14,
    color: '#075B5E',
  },
  driverActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fareInfo: {
    alignItems: 'flex-end',
  },
  fareAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  etaText: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  selectButton: {
    backgroundColor: '#075B5E',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
  },
  selectButtonDisabled: {
    backgroundColor: '#ccc',
  },
  selectButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  bargainContainer: {
    flex: 1,
    padding: 20,
  },
  bargainDriverCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  bargainDriverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bargainDriverName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  fareCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  fareCardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  fareControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fareControlButton: {
    backgroundColor: '#075B5E',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fareDisplay: {
    alignItems: 'center',
  },
  bargainFareAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  bargainFareLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  messageCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  messageTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  messageInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#333',
    minHeight: 80,
  },
  messageInputDisabled: {
    backgroundColor: '#f5f5f5',
    color: '#999',
    borderColor: '#ccc',
  },
  responseCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#075B5E',
  },
  responseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  responseTitle: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  responseMessage: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  responseFare: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  responseFareLabel: {
    fontSize: 14,
    color: '#666',
  },
  responseFareAmount: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#075B5E',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#666',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  sendButton: {
    flex: 1,
    backgroundColor: '#075B5E',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButton: {
    flex: 1,
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    backgroundColor: '#ccc',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
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
});

export default DriverSelectionScreen;
