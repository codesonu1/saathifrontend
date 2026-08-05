import React, { useState, useEffect, useRef } from 'react';
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
  Animated,
  Easing,
  Platform,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams, useNavigation } from 'expo-router';
import { MaterialIcons, Ionicons, FontAwesome5 } from '@expo/vector-icons';
import Toast from '../../components/ui/Toast';
import ConfirmationModal from '../../components/ui/ConfirmationModal';

import { rideService, RideOffer } from '@/services/rideService';
import webSocketService from '@/services/websocketService';
import { useUserRole } from '@/services/userRoleManager';
import { userRoleManager } from '@/services/userRoleManager';
import ProfileImage from '../../components/ProfileImage';
import * as Haptics from 'expo-haptics';

const { width, height } = Dimensions.get('window');

const AnimatedOfferCard = ({ children }: { children: React.ReactNode }) => {
  const slideAnim = useRef(new Animated.Value(-width)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 25,
      friction: 7,
    }).start();
  }, [slideAnim]);

  return (
    <Animated.View style={{ transform: [{ translateX: slideAnim }] }}>
      {children}
    </Animated.View>
  );
};

const RideOffersScreen = () => {
  const params = useLocalSearchParams();
  const router = useRouter();
  const navigation = useNavigation();
  const timeoutsRef = useRef<any[]>([]);
  const isNavigatingToTrackerRef = useRef(false);

  const rideId = params.rideId as string;
  const from = params.from as string;
  const to = params.to as string;
  const fare = params.fare as string;
  const vehicle = params.vehicle as string;

  const userRole = useUserRole();

  const [fromAddress, setFromAddress] = useState(from || '');
  const [toAddress, setToAddress] = useState(to || '');
  const [rideFare, setRideFare] = useState(fare || '');
  const [vehicleName, setVehicleName] = useState(vehicle || '');

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

  // Radar spin animation for Searching Hero card
  const spinValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 2000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, [spinValue]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

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

  useEffect(() => {
    if (!rideId) {
      showToast('No ride ID provided', 'error');
      router.push('/(tabs)/');
      return;
    }
    loadOffers();
    setupWebSocket();

    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBackPress();
      return true;
    });

    return () => {
      backHandler.remove();
      timeoutsRef.current.forEach(clearTimeout);
    };
  }, [rideId]);

  const TEST_DRIVER_MODE = true;

  const loadOffers = async () => {
    try {
      setLoading(true);
      const data = await rideService.getRideOffers(rideId);
      console.log('Fetched offers from API:', data);

      if (data && Array.isArray(data) && data.length > 0) {
        setOffers(data);
        if (data.length > previousOffersCount && previousOffersCount > 0) {
          showToast('New offer received!', 'info');
        }
        setPreviousOffersCount(data.length);
      } else {
        setOffers([]);
      }
    } catch (error: any) {
      console.error('Failed to load offers:', error);
      showToast('Failed to load offers', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadOffers();
  };

  const handleAcceptOffer = async (offerId: string) => {
    if (processing) return;
    setProcessing(true);
    setAcceptLoading(prev => ({ ...prev, [offerId]: true }));
    showToast('Accepting offer...', 'info');

    try {
      await rideService.acceptRideOffer(rideId, offerId);
      showToast('Offer accepted! Starting ride...', 'success');

      const acceptedOfferObj = offers.find(o => o._id === offerId);
      const driverObj = acceptedOfferObj?.driver;
      const driverFullName = driverObj ? `${driverObj.firstName} ${driverObj.lastName}` : 'Your Driver';

      await userRoleManager.setRole('passenger');
      isNavigatingToTrackerRef.current = true;
      router.push({
        pathname: '/(common)/rideTracker',
        params: {
          rideId,
          driverName: driverFullName,
          from: fromAddress || from,
          to: toAddress || to,
          fare: acceptedOfferObj ? acceptedOfferObj.offeredPrice.toString() : rideFare,
          vehicle: vehicleName || vehicle,
          pickupLat: params.pickupLat || params.pickUpLat || '27.7172',
          pickupLng: params.pickupLng || params.pickUpLng || '85.3240',
          dropoffLat: params.dropoffLat || params.dropOffLat || '27.6710',
          dropoffLng: params.dropoffLng || params.dropOffLng || '85.3122',
        },
      });
    } catch (error: any) {
      showToast(error.message || 'Failed to accept offer', 'error');
    } finally {
      setProcessing(false);
      setAcceptLoading(prev => ({ ...prev, [offerId]: false }));
    }
  };

  const handleRejectOffer = async (offerId: string) => {
    if (processing) return;
    setProcessing(true);
    setRejectLoading(prev => ({ ...prev, [offerId]: true }));

    try {
      await rideService.rejectRideOffer(rideId, offerId);
      showToast('Offer declined', 'info');
      setOffers(prev => prev.filter(o => o._id !== offerId));
    } catch (error: any) {
      showToast(error.message || 'Failed to decline offer', 'error');
    } finally {
      setProcessing(false);
      setRejectLoading(prev => ({ ...prev, [offerId]: false }));
    }
  };

  const handleBackPress = () => {
    setShowCancelConfirmation(true);
  };

  const handleCancelRideRequest = () => {
    setShowCancelConfirmation(true);
  };

  const confirmCancelRideRequest = async () => {
    if (cancelling) return;
    setShowCancelConfirmation(false);
    setCancelling(true);
    showToast('Cancelling ride request...', 'info');

    try {
      const success = await rideService.cancelRide(rideId, 'Cancelled by user');
      if (success) {
        setRideCancelled(true);
        showToast('Ride request cancelled', 'info');
        setTimeout(() => {
          router.replace('/(tabs)/');
        }, 800);
      } else {
        showToast('Unable to cancel ride request', 'error');
      }
    } catch (error: any) {
      showToast(error.message || 'Failed to cancel ride request', 'error');
    } finally {
      setCancelling(false);
    }
  };

  const cancelCancelRideRequest = () => {
    setShowCancelConfirmation(false);
  };

  const setupWebSocket = async () => {
    try {
      await webSocketService.connect(rideId, 'passenger');
      await webSocketService.connect(rideId, 'ride');

      const newOfferListener = (data: any) => {
        const incomingRideId = data?.rideId || data?.data?.rideId || data?.data?.rideOffer?.rideId || data?.offer?.rideId;
        console.log('[RideOffers] New offer event received:', data, 'incomingRideId:', incomingRideId);
        if (!incomingRideId || incomingRideId === rideId) {
          showToast('New offer received!', 'info');
          loadOffers();
        }
      };
      webSocketService.on('newOffer', newOfferListener, 'passenger');

      const rideAcceptedListener = async (data: any) => {
        if (data && data.data && data.data.acceptedOffer) {
          const currentRideId = data.data.id || data.data.rideId;
          if (currentRideId === rideId) {
            await userRoleManager.setRole('passenger');
            isNavigatingToTrackerRef.current = true;
            router.push({
              pathname: '/(common)/rideTracker',
              params: {
                rideId: data.data.id,
                driverName: data.data.driver?.firstName + ' ' + data.data.driver?.lastName,
                from: data.data.pickUp?.location,
                to: data.data.dropOff?.location,
                fare: data.data.offerPrice,
                vehicle: data.data.vehicle?.name,
              },
            });
          }
        }
      };
      webSocketService.on('rideAccepted', rideAcceptedListener, 'ride');

      const rideCancelledListener = (data: any) => {
        if (data && data.data) {
          const cancelledRideId = data.data.rideId || data.data.id;
          if (cancelledRideId === rideId) {
            showToast('Ride request has been cancelled', 'info');
            setTimeout(() => {
              router.push('/(tabs)/');
            }, 1500);
          }
        }
      };
      webSocketService.on('rideCancelled', rideCancelledListener, 'ride');

      return () => {
        webSocketService.off('newOffer', newOfferListener, 'passenger');
        webSocketService.off('rideAccepted', rideAcceptedListener, 'ride');
        webSocketService.off('rideCancelled', rideCancelledListener, 'ride');
      };
    } catch (error) {
      console.error('RideOffers: WebSocket setup failed:', error);
    }
  };

  const filteredOffers = offers.filter(o => ['submitted', 'pending', 'accepted'].includes(String(o.status)));

  const renderOffer = ({ item }: { item: RideOffer }) => (
    <AnimatedOfferCard>
      <View style={styles.offerCard}>
        {/* Driver Profile Header */}
        <View style={styles.offerHeader}>
          <View style={styles.driverInfo}>
            <ProfileImage
              photoUrl={item.driver.photo}
              size={52}
              fallbackIconColor="#B7102A"
            />
            <View style={styles.driverDetails}>
              <View style={styles.driverNameRow}>
                <Text style={styles.driverName}>
                  {item.driver.firstName} {item.driver.lastName}
                </Text>
                <Ionicons name="checkmark-circle" size={16} color="#1877F2" style={{ marginLeft: 4 }} />
              </View>

              <View style={styles.ratingBadgeContainer}>
                <View style={styles.ratingBadge}>
                  <Text style={styles.ratingText}>{item.driver.rating.toFixed(1)} ★</Text>
                </View>
                <Text style={styles.ridesCountText}>2.4k rides</Text>
              </View>
            </View>
          </View>

          {/* Price Offer Right Header */}
          <View style={styles.priceContainer}>
            <Text style={styles.priceLabel}>
              {item.offeredPrice === parseFloat(rideFare || fare || '0') ? "Driver's Offer" : "Counter Offer"}
            </Text>
            <Text style={styles.price}>रू {item.offeredPrice.toFixed(0)}</Text>
          </View>
        </View>

        {/* Vehicle & ETA Details Block */}
        <View style={styles.vehicleDetailsBlock}>
          <View style={styles.vehicleLeftInfo}>
            <Ionicons name="car" size={20} color="#191C1D" style={{ marginRight: 10 }} />
            <View>
              <Text style={styles.vehicleModelText}>
                {item.driver.vehicleDetails.vehicleModel || 'Suzuki Swift'}
              </Text>
              <Text style={styles.vehicleRegText}>
                {item.driver.vehicleDetails.vehicleColor || 'White'} • {item.driver.vehicleDetails.vehicleRegNum || 'BA 3 PA 4567'}
              </Text>
            </View>
          </View>

          <View style={styles.vehicleRightInfo}>
            <Text style={styles.etaText}>4 mins away</Text>
            <Text style={styles.distanceText}>1.2 km</Text>
          </View>
        </View>

        {/* Decline & Accept Action Buttons */}
        <View style={styles.offerActions}>
          <TouchableOpacity
            style={styles.rejectButton}
            onPress={() => handleRejectOffer(item._id)}
            disabled={processing || rejectLoading[item._id]}
            activeOpacity={0.8}
          >
            {rejectLoading[item._id] ? (
              <ActivityIndicator color="#191C1D" size="small" />
            ) : (
              <Text style={styles.rejectButtonText}>Decline</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.acceptButton}
            onPress={() => handleAcceptOffer(item._id)}
            disabled={processing || acceptLoading[item._id]}
            activeOpacity={0.85}
          >
            {acceptLoading[item._id] ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.acceptButtonText}>
                {item.offeredPrice === parseFloat(rideFare || fare || '0')
                  ? 'Accept Ride'
                  : `Accept रू ${item.offeredPrice.toFixed(0)}`}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </AnimatedOfferCard>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconCircle}>
        <Ionicons name="car-outline" size={32} color="#8F6F6E" />
      </View>
      <Text style={styles.emptyStateTitle}>Looking for nearby drivers...</Text>
      <Text style={styles.emptyStateSubtitle}>
        Drivers in your area are reviewing your offer. Counter-offers will appear here shortly.
      </Text>
      <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh}>
        <Ionicons name="refresh" size={18} color="#B7102A" style={{ marginRight: 6 }} />
        <Text style={styles.refreshButtonText}>Refresh Offers</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />

      {/* Top Header Bar */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerIconButton}
          onPress={handleBackPress}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={22} color="#191C1D" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Driver Offers</Text>

        <TouchableOpacity
          style={styles.headerIconButton}
          onPress={handleCancelRideRequest}
          disabled={cancelling}
          activeOpacity={0.8}
        >
          <Ionicons name="close" size={22} color="#B7102A" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Searching Status Hero Card (Top Card) */}
        <View style={styles.searchingHeroCard}>
          <View style={styles.searchingHeroLeft}>
            <Text style={styles.searchingHeroTitle}>Searching for drivers...</Text>
            <View style={styles.searchingHeroSubRow}>
              <View style={styles.redDotPulse} />
              <Text style={styles.searchingHeroSubtitle}>
                Broadcasting your request to nearby drivers
              </Text>
            </View>
          </View>

          {/* Rotating Animated Radar Spinner Ring */}
          <View style={styles.radarRingContainer}>
            <Animated.View
              style={[
                styles.radarRing,
                { transform: [{ rotate: spin }] }
              ]}
            >
              <View style={styles.radarSweepDot} />
            </Animated.View>
          </View>
        </View>

        {/* Route & Offer Pill Chips */}
        <View style={styles.chipsContainer}>
          <View style={styles.pillChip}>
            <Ionicons name="location" size={14} color="#B7102A" style={{ marginRight: 6 }} />
            <Text style={styles.pillChipText} numberOfLines={1}>
              {(fromAddress || from || 'Kathmandu')} → {(toAddress || to || 'Lalitpur')}
            </Text>
          </View>

          <View style={styles.pillChip}>
            <Ionicons name="ticket" size={14} color="#B7102A" style={{ marginRight: 6 }} />
            <Text style={styles.pillChipText}>
              Your Offer: रू {parseFloat(rideFare || fare || '223').toFixed(0)}
            </Text>
          </View>
        </View>

        {/* Available Offers Section Header */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Available Offers ({filteredOffers.length})
          </Text>
          <TouchableOpacity style={styles.refreshLink} onPress={handleRefresh}>
            <Ionicons name="refresh" size={14} color="#B7102A" style={{ marginRight: 4 }} />
            <Text style={styles.refreshLinkText}>Refresh</Text>
          </TouchableOpacity>
        </View>

        {/* Driver Offer Cards List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#B7102A" />
            <Text style={styles.loadingText}>Fetching available driver offers...</Text>
          </View>
        ) : filteredOffers.length > 0 ? (
          filteredOffers.map((item) => (
            <React.Fragment key={item._id}>
              {renderOffer({ item })}
            </React.Fragment>
          ))
        ) : (
          renderEmptyState()
        )}

        {/* Pro Tip Card Banner */}
        <View style={styles.proTipCard}>
          <View style={styles.proTipIconCircle}>
            <Ionicons name="bulb-outline" size={20} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.proTipTitle}>Pro Tip</Text>
            <Text style={styles.proTipSubtitle}>
              Drivers with higher ratings often provide a better experience with cleaner vehicles.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Bottom Navigation Bar */}
      <View style={styles.bottomTabBar}>
        <TouchableOpacity
          style={styles.activeTabItem}
          onPress={() => router.push('/(tabs)/')}
        >
          <Ionicons name="home" size={18} color="#FFFFFF" />
          <Text style={styles.activeTabText}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => router.push('/(common)/rideHistory')}
        >
          <Ionicons name="time-outline" size={20} color="#5B403F" />
          <Text style={styles.tabText}>History</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => router.push('/(common)/notifications')}
        >
          <Ionicons name="notifications-outline" size={20} color="#5B403F" />
          <Text style={styles.tabText}>Notifications</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => router.push('/(common)/profile')}
        >
          <Ionicons name="person-outline" size={20} color="#5B403F" />
          <Text style={styles.tabText}>Profile</Text>
        </TouchableOpacity>
      </View>

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={hideToast}
      />

      <ConfirmationModal
        visible={showCancelConfirmation}
        title="Cancel Ride Request?"
        message="Are you sure you want to cancel searching for drivers?"
        confirmText="Cancel Ride"
        cancelText="Keep Waiting"
        onConfirm={confirmCancelRideRequest}
        onCancel={cancelCancelRideRequest}
        type="warning"
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 8 : 44,
    paddingBottom: 12,
    backgroundColor: '#F8F9FA',
  },
  headerIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#191C1D',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 120,
  },
  searchingHeroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 4,
    marginBottom: 16,
  },
  searchingHeroLeft: {
    flex: 1,
    paddingRight: 12,
  },
  searchingHeroTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#191C1D',
    marginBottom: 6,
  },
  searchingHeroSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  redDotPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#B7102A',
    marginRight: 6,
  },
  searchingHeroSubtitle: {
    fontSize: 12,
    color: '#5B403F',
    flex: 1,
  },
  radarRingContainer: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radarRing: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#FFDAD8',
    borderTopColor: '#B7102A',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  radarSweepDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#B7102A',
    marginTop: -3,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  pillChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E7E8E9',
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  pillChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#191C1D',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#191C1D',
  },
  refreshLink: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  refreshLinkText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#B7102A',
  },
  offerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 4,
  },
  offerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  driverDetails: {
    marginLeft: 12,
  },
  driverNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  driverName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#191C1D',
  },
  ratingBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingBadge: {
    backgroundColor: '#BBD3FD',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 6,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#445A7F',
  },
  ridesCountText: {
    fontSize: 12,
    color: '#5B403F',
  },
  priceContainer: {
    alignItems: 'flex-end',
  },
  priceLabel: {
    fontSize: 11,
    color: '#5B403F',
    marginBottom: 2,
  },
  price: {
    fontSize: 24,
    fontWeight: '700',
    color: '#B7102A',
  },
  vehicleDetailsBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F3F4F5',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  vehicleLeftInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vehicleModelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#191C1D',
  },
  vehicleRegText: {
    fontSize: 12,
    color: '#5B403F',
    marginTop: 1,
  },
  vehicleRightInfo: {
    alignItems: 'flex-end',
  },
  etaText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#191C1D',
  },
  distanceText: {
    fontSize: 12,
    color: '#5B403F',
  },
  offerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  rejectButton: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E4BEBC',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rejectButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#191C1D',
  },
  acceptButton: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#B7102A',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#B7102A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  acceptButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptyState: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F3F4F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#191C1D',
    marginBottom: 6,
  },
  emptyStateSubtitle: {
    fontSize: 13,
    color: '#5B403F',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#FFDAD8',
  },
  refreshButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#B7102A',
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: '#5B403F',
    marginTop: 12,
  },
  proTipCard: {
    backgroundColor: '#485F84',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  proTipIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  proTipTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  proTipSubtitle: {
    fontSize: 12,
    color: '#F0F1F2',
    lineHeight: 16,
  },
  bottomTabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: Platform.OS === 'ios' ? 78 : 70,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 12,
    paddingBottom: Platform.OS === 'ios' ? 20 : 10,
    borderTopWidth: 1,
    borderTopColor: '#EFEFEF',
    zIndex: 1000,
    elevation: 10,
  },
  activeTabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#B7102A',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    gap: 6,
  },
  activeTabText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  tabText: {
    color: '#5B403F',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
});

export default RideOffersScreen;