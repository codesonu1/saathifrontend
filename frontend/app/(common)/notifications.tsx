import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import websocketService from '../utils/websocketService';
import apiClient from '../utils/apiClient';
import Toast from '../../components/ui/Toast';
import { userRoleManager } from '../utils/userRoleManager';

const Notifications = () => {
  const router = useRouter();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: 'info' | 'success' | 'error';
  }>({
    visible: false,
    message: '',
    type: 'info',
  });

  const showToast = (message: string, type: 'info' | 'success' | 'error') => setToast({ visible: true, message, type });
  const hideToast = () => setToast(prev => ({ ...prev, visible: false }));

  const handleBackPress = () => {
    router.back();
  };

  // Get current user ID on component mount
  useEffect(() => {
    const getCurrentUser = async () => {
      try {
        const response = await apiClient.get('me');
        if (response.data.data && response.data.data.id) {
          setCurrentUserId(response.data.data.id);
          console.log('Notifications: Current user ID set:', response.data.data.id);
        }
      } catch (error) {
        console.error('Notifications: Failed to get current user:', error);
      }
    };
    getCurrentUser();
  }, []);

  useEffect(() => {
    let isMounted = true;
    let rideCompletedListener: any;

    async function setupWebSocket() {
      try {
        const userRole = await userRoleManager.getRole();
        if (userRole === 'driver') {
          await websocketService.connect(undefined, 'driver');
        } else {
          await websocketService.connect(undefined, 'passenger');
        }
        rideCompletedListener = (data: any) => {
          // Check if this completed ride belongs to the current user
          if (!currentUserId) {
            console.log('Notifications: No current user ID available, skipping notification');
            return;
          }

          // Extract user information from the completed ride data
          const rideData = data?.data || data;
          const ridePassengerId = rideData?.passengerId || rideData?.passenger?.id || rideData?.passenger?._id;
          const rideDriverId = rideData?.driverId || rideData?.driver?.id || rideData?.driver?._id;
          
          console.log('Notifications: Ride completed event received:', data);
          console.log('Notifications: Current user ID:', currentUserId);
          console.log('Notifications: Ride passenger ID:', ridePassengerId, 'Ride driver ID:', rideDriverId);
          
          // Check if current user is either the passenger or driver of this ride
          const isMyRide = ridePassengerId === currentUserId || rideDriverId === currentUserId;
          
          if (isMyRide && isMounted) {
            console.log('Notifications: Adding notification for my completed ride');
            setNotifications(prev => [{ type: 'rideCompleted', ...data, createdAt: new Date() }, ...prev]);
          } else {
            console.log('Notifications: Ignoring completed ride for different user');
          }
        };
        websocketService.on('rideCompleted', rideCompletedListener);
        websocketService.on('error', (err) => {
          showToast('WebSocket error: ' + (err?.message || 'Unknown error'), 'error');
        });
      } catch (err) {
        showToast('WebSocket connection failed', 'error');
      }
    }
    setupWebSocket();
    return () => {
      isMounted = false;
      if (rideCompletedListener) websocketService.off('rideCompleted', rideCompletedListener);
      websocketService.off('error');
    };
  }, [currentUserId]); // Add currentUserId as dependency

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBackPress} style={{
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
          marginTop: 27,
        }}>
          <Icon name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
      </View>
      <View style={styles.content}>
        {notifications.length === 0 ? (
          <>
            <Icon name="notifications" size={80} color="#333" style={styles.icon} />
            <Text style={styles.title}>You are all up to date</Text>
            <Text style={styles.subtitle}>No new notifications</Text>
          </>
        ) : (
          notifications.map((notif, idx) => (
            <View key={idx} style={{ marginBottom: 16 }}>
              <Text style={{ fontWeight: 'bold', color: '#075B5E' }}>{notif.type === 'rideCompleted' ? 'Ride Completed' : notif.type}</Text>
              <Text>{notif.message || 'Your ride has been completed successfully.'}</Text>
              <Text style={{ fontSize: 12, color: '#999' }}>{notif.createdAt?.toLocaleString?.() || ''}</Text>
            </View>
          ))
        )}
      </View>
      {toast.visible && (
        <Toast visible={toast.visible} message={toast.message} type={toast.type} onHide={hideToast} />
      )}
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
    paddingHorizontal: 16,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    marginTop: 25,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000',
    marginLeft: 18,
    marginTop: 25,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  icon: {
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 10,
  },
});

export default Notifications;