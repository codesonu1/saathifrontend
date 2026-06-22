import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Dimensions,
  BackHandler,
} from 'react-native';
import { useRouter, useLocalSearchParams, useNavigation } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import Toast from '../../components/ui/Toast';
import ConfirmationModal from '../../components/ui/ConfirmationModal';

import { rideService, RideOffer } from '../utils/rideService';
import webSocketService from '../utils/websocketService';
import { useUserRole } from '../utils/userRoleManager';
import { userRoleManager } from '../utils/userRoleManager';
import ProfileImage from '../../components/ProfileImage';
import * as Haptics from 'expo-haptics';

const { width, height } = Dimensions.get('window');

const RideOffersScreen = () => {
  const params = useLocalSearchParams();
  const router = useRouter();
  const navigation = useNavigation();
  
  const rideId = params.rideId as string;
  const from = params.from as string;
  const to = params.to as string;
  const fare = params.fare as string;
  const vehicle = params.vehicle as string;

  // Get current user role from global manager
  const userRole = useUserRole();

  const [offers, setOffers] = useState<RideOffer[]>([]);
  const [previousOffersCount, setPreviousOffersCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newOffer, setNewOffer] = useState<any>(null);
  const [acceptLoading, setAcceptLoading] = useState<{ [key: string]: boolean }>({});
  const [rejectLoading, setRejectLoading] = useState<{ [key: string]: boolean }>({});
  const [selectedOffer, setSelectedOffer] = useState<RideOffer | null>(null);
  const [processing, setProcessing] = useState(false);
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [rideCancelled, setRideCancelled] = useState(false);

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
    if (type === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (type === 'error') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    else Haptics.selectionAsync();
  };

  const hideToast = () => {
    setToast(prev => ({ ...prev, visible: false }));
  };

  // Handle back button press and swipe gestures
  useEffect(() => {
    const backAction = () => {
      // Show confirmation dialog when back is pressed
      setShowCancelConfirmation(true);
      return true; // Prevent default back action
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    
    // Handle swipe gestures - only for this screen
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      // Only prevent navigation if we're on this screen and haven't confirmed
      if (!cancelling && !rideCancelled) {
        e.preventDefault();
        setShowCancelConfirmation(true);
      }
    });

    return () => {
      backHandler.remove();
      unsubscribe();
      setShowCancelConfirmation(false); // Reset modal state on unmount
    };
  }, [navigation, cancelling, rideCancelled]);

  useEffect(() => {
    console.log('RideOffers: Setting up for rideId:', rideId);
    
    // Clean up any existing WebSocket connections first
    webSocketService.disconnect('ride');
    webSocketService.disconnect('passenger');
    
    loadOffers();
    setupWebSocket();
    
    return () => {
      // Cleanup WebSocket connection
      webSocketService.disconnect('ride');
      webSocketService.disconnect('passenger');
    };
      }, [rideId]);

  const loadOffers = async () => {
    try {
      setLoading(true);
      console.log('RideOffers: Loading offers for rideId:', rideId);
      
      // First try WebSocket
      try {
        if (webSocketService.isSocketConnected()) {
          console.log('RideOffers: Using WebSocket for offers...');
          // WebSocket method would be implemented here
          // For now, fall back to REST API
        }
      } catch (wsError) {
        console.log('RideOffers: WebSocket failed, using REST API...');
      }
      
      // Use REST API to get offers
      const offers = await rideService.getRideOffersForPassenger(rideId);
      console.log('RideOffers: Received offers:', offers);
      
      // Check if any offers were removed (driver went offline)
      if (offers.length > 0 && previousOffersCount > offers.length) {
        console.log('RideOffers: Some drivers went offline, offers reduced from', previousOffersCount, 'to', offers.length);
        showToast('Some drivers went offline. Offers updated.', 'info');
      }
      
      setPreviousOffersCount(offers.length);
      setOffers(offers);
      
    } catch (error) {
      console.error('RideOffers: Error loading offers:', error);
      showToast('Failed to load ride offers', 'error');
      setOffers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadOffers();
    setRefreshing(false);
  };

  const handleAcceptOffer = async (offerId: string) => {
    try {
      setAcceptLoading(prev => ({ ...prev, [offerId]: true }));
      setLoading(true);
      
      // First check the current ride status
      try {
        const rideDetails = await rideService.getRideDetails(rideId);
        console.log('RideOffers: Current ride status before accepting offer:', rideDetails?.status);
        
        // If ride is not in searching status, refresh and show error
        if (rideDetails?.status && rideDetails.status !== 'searching') {
          showToast('Ride status has changed. Please refresh and try again.', 'error');
          await loadOffers();
          return;
        }
        
        // Verify that the offer belongs to the current ride
        const currentOffers = await rideService.getRideOffersForPassenger(rideId);
        const offerExists = currentOffers.some(offer => offer._id === offerId);
        if (!offerExists) {
          showToast('Offer not found. Please refresh and try again.', 'error');
          await loadOffers();
          return;
        }
      } catch (error) {
        console.log('RideOffers: Could not check ride status, proceeding with offer acceptance');
      }
      
      // Connect to RIDE namespace for ride-specific events
      await webSocketService.connect(rideId, 'ride');
      
      // Add callback handler for confirmation with timeout
      let callbackFired = false;
      const timeout = setTimeout(() => {
        if (!callbackFired) {
          console.log('Accept offer timeout - no response received');
          showToast('Network timeout. Please try again.', 'error');
          callbackFired = true;
        }
      }, 10000); // 10 second timeout
      
      webSocketService.emitEvent('acceptRideOffer', { rideOfferId: offerId, rideId: rideId }, (response: any) => {
        if (callbackFired) return; // Prevent duplicate handling
        callbackFired = true;
        clearTimeout(timeout);
        
        console.log('Accept offer response:', response);
        if (response?.code === 201) {
          showToast('Offer accepted! Redirecting to ride...', 'success');
        } else if (response?.code === 400 && response?.message?.includes('not in searching status')) {
          showToast('Ride status has changed. Please refresh and try again.', 'error');
          // Optionally refresh the offers
          setTimeout(() => {
            loadOffers();
          }, 1000);
        } else if (response?.code === 400) {
          showToast('Failed to accept offer: ' + (response?.message || 'Unknown error'), 'error');
        } else {
          showToast('Failed to accept offer. Please try again.', 'error');
        }
      }, 'ride');
      
      // Show loading toast - be more specific about what's happening
      showToast('Accepting offer...', 'info');
      // Do NOT reload offers or navigate here!
    } catch (error) {
      console.error('Error accepting offer:', error);
      showToast('Error accepting offer. Please try again.', 'error');
    } finally {
      setAcceptLoading(prev => ({ ...prev, [offerId]: false }));
      setLoading(false);
    }
  };

  const handleRejectOffer = async (offerId: string) => {
    try {
      setRejectLoading(prev => ({ ...prev, [offerId]: true }));
      setLoading(true);
      
      // Connect to RIDE namespace for ride-specific events
      await webSocketService.connect(rideId, 'ride');
      
      // Add callback handler for confirmation
      webSocketService.emitEvent('rejectRideOffer', { rideOfferId: offerId, rideId: rideId }, (response: any) => {
        console.log('Reject offer response:', response);
        if (response?.code === 201) {
          // Remove the rejected offer from the list
          setOffers(prev => prev.filter(offer => offer._id !== offerId));
          showToast('Offer rejected', 'success');
        } else {
          showToast('Failed to reject offer: ' + (response?.message || 'Unknown error'), 'error');
        }
      }, 'ride');
      
      showToast('Rejecting offer...', 'info');
      // Do NOT reload offers or navigate here!
    } catch (error) {
      console.error('Error rejecting offer:', error);
      showToast('Error rejecting offer. Please try again.', 'error');
    } finally {
      setRejectLoading(prev => ({ ...prev, [offerId]: false }));
      setLoading(false);
    }
  };

  const handleBackPress = () => {
    // If we're already cancelling, ride is cancelled, or have no offers, just go back
    if (cancelling || rideCancelled || offers.length === 0) {
      router.replace('/(tabs)');
    } else {
      setShowCancelConfirmation(true);
    }
  };

  const handleCancelRideRequest = () => {
    setShowCancelConfirmation(true);
  };

  const confirmCancelRideRequest = async () => {
    try {
      setCancelling(true);
      setShowCancelConfirmation(false);
      
      // Cancel the ride request
      const success = await rideService.cancelRide(rideId, 'Cancelled by passenger');
      
      if (success) {
        // Emit passenger cancelled event to notify drivers
        try {
          console.log('RideOffers: Cancelling ride request, rideId:', rideId);
          
          // Connect to driver namespace to notify all drivers
          await webSocketService.connect(undefined, 'driver');
          console.log('RideOffers: Connected to driver namespace, emitting passengerCancelledRide');
          webSocketService.emit('passengerCancelledRide', { rideId }, 'driver');
          
          // Also emit to ride namespace for any ride-specific listeners
          await webSocketService.connect(rideId, 'ride');
          console.log('RideOffers: Connected to ride namespace, emitting passengerCancelledRide');
          webSocketService.emit('passengerCancelledRide', { rideId }, 'ride');
          
          console.log('RideOffers: Successfully emitted cancellation events');
        } catch (wsError) {
          console.log('WebSocket error when notifying drivers of cancellation:', wsError);
        }
        
        showToast('Ride request cancelled', 'info');
        setRideCancelled(true);
        // Navigate back to home screen immediately
        router.replace('/(tabs)');
      } else {
        showToast('Failed to cancel ride request', 'error');
      }
    } catch (error) {
      console.error('Error cancelling ride request:', error);
      showToast('Error cancelling ride request', 'error');
    } finally {
      setCancelling(false);
    }
  };

  const cancelCancelRideRequest = () => {
    setShowCancelConfirmation(false);
  };



  const setupWebSocket = async () => {
    try {
      console.log('RideOffers: Setting up WebSocket for rideId:', rideId);
      
      // Connect to passenger namespace for passenger-specific events
      await webSocketService.connect(undefined, 'passenger');
      // Connect to ride namespace for ride-specific events
      await webSocketService.connect(rideId, 'ride');
      
      let isMounted = true;
      let newOfferListener: any;
      let rideAcceptedListener: any;
      let rideCancelledListener: any;
      let rideStatusUpdateListener: any;
      let rideErrorListener: any;
      
      // Listen for new offers (passenger namespace)
      newOfferListener = (data: any) => {
        if (!isMounted) return;
        console.log('RideOffers: New offer received:', data);
        if (data && data.rideId) {
          setNewOffer(data);
          showToast('New ride offer received!', 'info');
        }
      };
      webSocketService.on('newOffer', newOfferListener, 'passenger');
      
      // Listen for ride accepted (ride namespace)
      rideAcceptedListener = async (data: any) => {
        console.log('RideOffers: rideAccepted event received:', data);
        if (data && data.data && data.data.acceptedOffer) {
          // Check if this accepted offer belongs to the current passenger
          const currentRideId = data.data.id || data.data.rideId;
          if (currentRideId && currentRideId === rideId) {
            console.log('RideOffers: Processing accepted offer for current passenger');
            // Update offers list in state
            setOffers(prev =>
              prev.map(offer =>
                offer._id === data.data.acceptedOffer._id
                  ? { ...offer, status: 'accepted' }
                  : offer
              )
            );
            // Only navigate if the accepted offer belongs to the current user (passenger)
            await userRoleManager.setRole('passenger');
            router.push({
              pathname: '../(common)/rideTracker',
              params: {
                rideId: data.data.id,
                driverName: data.data.driver?.firstName + ' ' + data.data.driver?.lastName,
                from: data.data.pickUp?.location,
                to: data.data.dropOff?.location,
                fare: data.data.offerPrice,
                vehicle: data.data.vehicle?.name,
              },
            });
          } else {
            console.log('RideOffers: Ignoring accepted offer for different passenger');
          }
        } else if (data && data.code && data.code !== 201) {
          // Show error toast if backend returns an error
          showToast(data.message || 'Failed to accept offer. Please try again.', 'error');
        }
      };
      webSocketService.on('rideAccepted', rideAcceptedListener, 'ride');
      
      // Listen for ride cancelled (ride namespace)
      rideCancelledListener = (data: any) => {
        console.log('RideOffers: rideCancelled event received:', data);
        if (data && data.data) {
          // Check if this cancelled ride belongs to the current passenger
          const cancelledRideId = data.data.rideId || data.data.id;
          if (cancelledRideId && cancelledRideId === rideId) {
            console.log('RideOffers: Processing cancelled ride for current passenger');
            showToast('Ride request has been cancelled', 'info');
            // Navigate back to home screen
            setTimeout(() => {
              router.push('/(tabs)');
            }, 2000);
          } else {
            console.log('RideOffers: Ignoring cancelled ride for different passenger');
          }
        }
      };
      webSocketService.on('rideCancelled', rideCancelledListener, 'ride');
      
      // Listen for ride status updates (ride namespace)
      rideStatusUpdateListener = (data: any) => {
        console.log('RideOffers: rideStatusUpdate event received:', data);
        if (data && data.data && data.data.status) {
          console.log('RideOffers: Ride status updated to:', data.data.status);
          // If ride status changes to something other than searching, refresh offers
          if (data.data.status !== 'searching') {
            setTimeout(() => {
              loadOffers();
            }, 500);
          }
        }
      };
      webSocketService.on('rideStatusUpdate', rideStatusUpdateListener, 'ride');
      
      // Listen for ride errors (ride namespace)
      rideErrorListener = (data: any) => {
        console.log('RideOffers: ride error event received:', data);
        if (data && data.code === 400 && data.message?.includes('not in searching status')) {
          showToast('Ride status has changed. Please refresh and try again.', 'error');
          setTimeout(() => {
            loadOffers();
          }, 1000);
        } else if (data && data.code === 400) {
          // Handle other 400 errors
          showToast('Error: ' + (data.message || 'Unknown error'), 'error');
        }
      };
            webSocketService.on('error', rideErrorListener, 'ride');
      
      // Cleanup function
      return () => {
        isMounted = false;
        if (newOfferListener) webSocketService.off('newOffer', newOfferListener, 'passenger');
        if (rideAcceptedListener) webSocketService.off('rideAccepted', rideAcceptedListener, 'ride');
        if (rideCancelledListener) webSocketService.off('rideCancelled', rideCancelledListener, 'ride');
                if (rideStatusUpdateListener) webSocketService.off('rideStatusUpdate', rideStatusUpdateListener, 'ride');
        if (rideErrorListener) webSocketService.off('error', rideErrorListener, 'ride');
      };
      
    } catch (error) {
      console.error('RideOffers: WebSocket setup failed:', error);
    }
  };

  console.log('All offer statuses:', offers.map(o => o.status));
  const filteredOffers = offers.filter(o => ['submitted', 'pending', 'accepted'].includes(String(o.status)));

  const renderOffer = ({ item }: { item: RideOffer }) => (
    <View style={styles.offerCard}>
      <View style={styles.offerHeader}>
        <View style={styles.driverInfo}>
          <ProfileImage 
            photoUrl={item.driver.photo}
            size={50}
            fallbackIconColor="#075B5E"
          />
          <View style={styles.driverDetails}>
            <Text style={styles.driverName}>
              {item.driver.firstName} {item.driver.lastName}
            </Text>
            <View style={styles.ratingContainer}>
              <MaterialIcons name="star" size={16} color="#FFD700" />
              <Text style={styles.rating}>{item.driver.rating.toFixed(1)}</Text>
            </View>
            <Text style={styles.vehicleInfo}>
              {item.driver.vehicleDetails.vehicleModel} • {item.driver.vehicleDetails.vehicleRegNum}
            </Text>
          </View>
        </View>
        <View style={styles.priceContainer}>
          <Text style={styles.priceLabel}>Driver&apos;s Offer</Text>
          <Text style={styles.price}>रू {item.offeredPrice.toFixed(0)}</Text>
          <Text style={styles.priceDifference}>
                          {item.offeredPrice > parseFloat(fare) ? '+' : ''}रू {(item.offeredPrice - parseFloat(fare)).toFixed(0)}
          </Text>
        </View>
      </View>

      {item.message && (
        <View style={styles.messageContainer}>
          <MaterialIcons name="chat" size={16} color="#666" />
          <Text style={styles.message}>{item.message}</Text>
        </View>
      )}



      <View style={styles.offerActions}>
        <TouchableOpacity
          style={[styles.actionButton, styles.rejectButton]}
          onPress={() => handleRejectOffer(item._id)}
          disabled={processing}
        >
          <MaterialIcons name="close" size={18} color="#EA2F14" />
          <Text style={styles.rejectButtonText}>Reject</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.actionButton, styles.acceptButton]}
          onPress={() => handleAcceptOffer(item._id)}
          disabled={processing}
        >
          <MaterialIcons name="check" size={18} color="#fff" />
          <Text style={styles.acceptButtonText}>Accept</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <MaterialIcons name="local-taxi" size={64} color="#ccc" />
      <Text style={styles.emptyStateTitle}>No offers yet</Text>
      <Text style={styles.emptyStateSubtitle}>
        We&apos;re searching for drivers in your area. This may take a few moments.
      </Text>
      <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh}>
        <MaterialIcons name="refresh" size={20} color="#075B5E" />
        <Text style={styles.refreshButtonText}>Refresh</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBackPress}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Driver Offers</Text>
        <TouchableOpacity 
          style={styles.cancelButton}
          onPress={handleCancelRideRequest}
          disabled={cancelling}
        >
          <MaterialIcons name="close" size={24} color="#EA2F14" />
        </TouchableOpacity>
      </View>

      <View style={styles.rideInfo}>
        <View style={styles.routeInfo}>
          <View style={styles.locationRow}>
            <MaterialIcons name="location-on" size={16} color="#075B5E" />
            <Text style={styles.locationText} numberOfLines={1}>{from}</Text>
          </View>
          <View style={styles.locationRow}>
            <MaterialIcons name="location-on" size={16} color="#EA2F14" />
            <Text style={styles.locationText} numberOfLines={1}>{to}</Text>
          </View>
        </View>
        <View style={styles.rideDetails}>
          <Text style={styles.vehicleType}>{vehicle}</Text>
          <Text style={styles.yourOffer}>Your offer: रू {parseFloat(fare).toFixed(0)}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#075B5E" />
          <Text style={styles.loadingText}>Searching for drivers...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredOffers}
          renderItem={renderOffer}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.offersList}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          ListEmptyComponent={renderEmptyState}
          showsVerticalScrollIndicator={true}
          scrollEnabled={true}
          bounces={true}
        />
      )}

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={hideToast}
      />

      <ConfirmationModal
        visible={showCancelConfirmation}
        title="Leave Ride Offers?"
        message="Are you sure you want to cancel your ride request?"
        confirmText="Leave"
        cancelText="Stay"
        onConfirm={confirmCancelRideRequest}
        onCancel={cancelCancelRideRequest}
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
    marginTop: 33,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  placeholder: {
    width: 24,
  },
  cancelButton: {
    padding: 8,
  },
  rideInfo: {
    backgroundColor: '#fff',
    padding: 16,
    marginBottom: 8,
  },
  routeInfo: {
    marginBottom: 12,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  locationText: {
    fontSize: 16,
    color: '#333',
    marginLeft: 8,
    flex: 1,
  },
  rideDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  vehicleType: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  yourOffer: {
    fontSize: 14,
    color: '#075B5E',
    fontWeight: '600',
  },
  offersList: {
    padding: 16,
    paddingBottom: 20,
    flexGrow: 1,
  },
  offerCard: {
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
  offerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  driverInfo: {
    flexDirection: 'row',
    flex: 1,
  },
  driverAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f0f8ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  driverDetails: {
    flex: 1,
  },
  driverName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
    marginLeft: 4,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    marginLeft: 4,
  },
  rating: {
    fontSize: 14,
    color: '#666',
    marginLeft: 4,
  },
  vehicleInfo: {
    fontSize: 12,
    color: '#999',
  },
  priceContainer: {
    alignItems: 'flex-end',
  },
  price: {
    fontSize: 20,
    fontWeight: '700',
    color: '#075B5E',
  },
  priceLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  priceDifference: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  messageContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  message: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
    flex: 1,
  },
  offerActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 48,
  },
  rejectButton: {
    backgroundColor: '#fff',
    borderColor: '#EA2F14',
  },
  rejectButtonText: {
    color: '#EA2F14',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  acceptButton: {
    backgroundColor: '#075B5E',
    borderColor: '#075B5E',
  },
  acceptButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  raiseFareButton: {
    backgroundColor: '#fff',
    borderColor: '#075B5E',
    borderWidth: 1,
  },
  raiseFareButtonText: {
    color: '#075B5E',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 16,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 24,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 24,
    borderWidth: 1,
    borderColor: '#075B5E',
  },
  refreshButtonText: {
    color: '#075B5E',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});

export default RideOffersScreen; 