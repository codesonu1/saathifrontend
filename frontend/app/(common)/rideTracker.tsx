import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Dimensions,
  Animated,
  Alert,
  Linking,
  ActivityIndicator,
  TextInput,
  BackHandler,
  Modal,
  ScrollView,
  Platform,
} from 'react-native';
import * as Location from 'expo-location';
import { useRouter, useLocalSearchParams, useNavigation } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import Toast from '../../components/ui/Toast';
import ConfirmationModal from '../../components/ui/ConfirmationModal';
import { locationService } from '@/services/locationService';
import webSocketService from '@/services/websocketService';
import { rideService } from '@/services/rideService';
import { getCurrentUserId } from '@/services/apiClient';
import MapView, { Marker, PROVIDER_GOOGLE, Polyline } from 'react-native-maps';
import { useUserRole } from '@/services/userRoleManager';
import { throttle } from 'lodash';
import AppModal from '../../components/ui/AppModal';
import * as Haptics from 'expo-haptics';

const { width, height } = Dimensions.get('window');

const KATHMANDU_BOUNDING_BOX = {
  north: 27.85,
  south: 27.60,
  east: 85.55,
  west: 85.20,
};
function isInAllowedArea(lat: number, lng: number) {
  return lat >= KATHMANDU_BOUNDING_BOX.south && lat <= KATHMANDU_BOUNDING_BOX.north &&
    lng >= KATHMANDU_BOUNDING_BOX.west && lng <= KATHMANDU_BOUNDING_BOX.east;
}

// Restrict pickup and dropoff to Kathmandu Valley only
function isInKathmandu(lat: number, lng: number) {
  return lat >= KATHMANDU_BOUNDING_BOX.south && lat <= KATHMANDU_BOUNDING_BOX.north &&
    lng >= KATHMANDU_BOUNDING_BOX.west && lng <= KATHMANDU_BOUNDING_BOX.east;
}

async function getTestDriverLocation(pickup: {lat: number, lng: number} | null) {
  if (!pickup) return null;
  const bearing = Math.random() * 2 * Math.PI;
  const distance = Math.random() * 0.1; // 0.1 km = 100m
  const R = 6371; // Earth radius in km
  const lat1 = pickup.lat * Math.PI / 180;
  const lng1 = pickup.lng * Math.PI / 180;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(distance / R) + Math.cos(lat1) * Math.sin(distance / R) * Math.cos(bearing));
  const lng2 = lng1 + Math.atan2(Math.sin(bearing) * Math.sin(distance / R) * Math.cos(lat1), Math.cos(distance / R) - Math.sin(lat1) * Math.sin(lat2));
  return {
    lat: lat2 * 180 / Math.PI,
    lng: lng2 * 180 / Math.PI,
  };
}

const USE_TEST_DRIVER_LOCATION = false; // Set to false for real GPS tracking(Manual)

const PASSENGER_CANCELLATION_REASONS = [
  'Driver asking for more money',
  'Plan changed / No longer need a ride',
  'Driver is not moving / ETA is too long',
  'Driver requested to cancel',
  'Selected wrong vehicle type',
  'Other reason'
];

const DRIVER_CANCELLATION_REASONS = [
  'Passenger did not show up',
  'Passenger requested to cancel',
  'Incorrect pickup location / Hard to reach',
  'Vehicle issue / Breakdown / Flat tire',
  'Traffic delay / Cannot reach pickup in time',
  'Other reason'
];

const lastProgressRef = { current: 0 };

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <MaterialIcons name="error" size={48} color="#F44336" />
          <Text style={{ fontSize: 18, fontWeight: 'bold', marginTop: 16, textAlign: 'center' }}>
            Something went wrong
          </Text>
          <Text style={{ fontSize: 14, marginTop: 8, textAlign: 'center', color: '#666' }}>
            Please try refreshing the app
          </Text>
          <TouchableOpacity
            style={{
              backgroundColor: '#075B5E',
              paddingHorizontal: 20,
              paddingVertical: 10,
              borderRadius: 8,
              marginTop: 16
            }}
            onPress={() => this.setState({ hasError: false })}
          >
            <Text style={{ color: '#fff', fontWeight: 'bold' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

interface Ride {
  _id?: string;
  pickUp?: {
    coords: {
      coordinates: [number, number]; // [longitude, latitude]
    };
  };
  dropOff?: {
    coords: {
      coordinates: [number, number]; // [longitude, latitude]
    };
  };
  status?: string;
  driver?: {
    mobile: string;
    _id: string;
    firstName?: string;
    lastName?: string;
  };
  passenger?: {
    mobile: string;
    firstName?: string;
    lastName?: string;
  };
  currLocation?: {
    latitude: number;
    longitude: number;
  };
  acceptedOffer?: {
    offerAmount: number;
  };
  offerPrice?: number;
}

// Calculate distance in kilometers
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return distance;
};

// Find closest point index on polyline
function findClosestPointIndex(polyline: {latitude: number; longitude: number}[], point: {lat: number; lng: number}): number {
  let minDistance = Infinity;
  let closestIndex = 0;
  
  for (let i = 0; i < polyline.length; i++) {
    const distance = calculateDistance(
      point.lat,
      point.lng,
      polyline[i].latitude,
      polyline[i].longitude
    );
    if (distance < minDistance) {
      minDistance = distance;
      closestIndex = i;
    }
  }
  
  return closestIndex;
}


// Simulate driver movement
const simulateDriverMovement = async (
  rideId: string,
  startLocation: { lat: number; lng: number },
  pickupLocation: { lat: number; lng: number },
  dropoffLocation: { lat: number; lng: number },
  onLocationUpdate: (location: { lat: number; lng: number }) => void,
  onProgressUpdate: (progress: number) => void,
  setSimulating: (v: boolean) => void,
  userRole: 'driver' | 'passenger',
  rideStatusRef: React.RefObject<string>,
  rideStartTime: number | null,
  mainRoutePolyline: { latitude: number; longitude: number }[]
) => {
  setSimulating(true);
  locationService.stopLocationTracking();
  const safeStart = startLocation || { lat: 27.700769, lng: 85.300140 };
  const safePickup = pickupLocation || { lat: 27.700769, lng: 85.300140 };
  const safeDropoff = dropoffLocation || { lat: 27.6710, lng: 85.4298 };

  if (!mainRoutePolyline || mainRoutePolyline.length === 0) {
    await simulateStraightLineMovement(rideId, safeStart, safePickup, safeDropoff, onLocationUpdate, onProgressUpdate, setSimulating, userRole, rideStatusRef, rideStartTime);
    return;
  }
  const stepDelay = 1000;
  const startIdx = findClosestPointIndex(mainRoutePolyline, safeStart);
  const pickupIdx = findClosestPointIndex(mainRoutePolyline, safePickup);
  const dropoffIdx = findClosestPointIndex(mainRoutePolyline, safeDropoff);
  // Phase 1: Start to Pickup (0-10% progress)
  const phase1Steps = 15;
  for (let i = 0; i <= phase1Steps; i++) {
    if (rideStatusRef.current === 'cancelled' || rideStatusRef.current === 'completed') break;
    const t = i / phase1Steps;
    const currentIdx = Math.floor(startIdx + (pickupIdx - startIdx) * t);
    const currentPoint = mainRoutePolyline[currentIdx];
    const location = { lat: currentPoint.latitude, lng: currentPoint.longitude };
    onLocationUpdate(location);
    const progress = Math.round(t * 10);
    if (progress >= lastProgressRef.current) {
      lastProgressRef.current = progress;
      onProgressUpdate(progress);
    }
    // Send simulated location to backend (non-blocking)
    if (userRole === 'driver' && rideId && !rideId.startsWith('mock_')) {
      try {
        webSocketService.emitEvent(
          'updateRideLocation',
          { latitude: currentPoint.latitude, longitude: currentPoint.longitude },
          (response: any) => {},
          'ride'
        );
      } catch (error: any) {
      }
    }
    await new Promise(resolve => setTimeout(resolve, stepDelay));
  }
  // Phase 2: Pickup to Dropoff (10-100% progress)
  const phase2Steps = 30;
  for (let i = 0; i <= phase2Steps; i++) {
    if (rideStatusRef.current === 'cancelled' || rideStatusRef.current === 'completed') break;
    const t = i / phase2Steps;
    const currentIdx = Math.floor(pickupIdx + (dropoffIdx - pickupIdx) * t);
    const currentPoint = mainRoutePolyline[currentIdx];
    const location = { lat: currentPoint.latitude, lng: currentPoint.longitude };
    onLocationUpdate(location);
    const progress = Math.round(10 + t * 90);
    if (progress >= lastProgressRef.current) {
      lastProgressRef.current = progress;
      onProgressUpdate(progress);
    }
    
    // Send simulated location to backend (non-blocking)
    if (userRole === 'driver' && rideId && !rideId.startsWith('mock_')) {
      try {
        webSocketService.emitEvent(
          'updateRideLocation',
          { latitude: currentPoint.latitude, longitude: currentPoint.longitude },
          (response: any) => {},
          'ride'
        );
      } catch (error: any) {
      }
    }
    await new Promise(resolve => setTimeout(resolve, stepDelay));
  }
  setSimulating(false);
};

const simulateStraightLineMovement = async (
  rideId: string,
  startLocation: { lat: number; lng: number },
  pickupLocation: { lat: number; lng: number },
  dropoffLocation: { lat: number; lng: number },
  onLocationUpdate: (location: { lat: number; lng: number }) => void,
  onProgressUpdate: (progress: number) => void,
  setSimulating: (v: boolean) => void,
  userRole: 'driver' | 'passenger',
  rideStatusRef: React.RefObject<string>,
  rideStartTime: number | null
) => {
  const safeStart = startLocation || { lat: 27.700769, lng: 85.300140 };
  const safePickup = pickupLocation || { lat: 27.700769, lng: 85.300140 };
  const safeDropoff = dropoffLocation || { lat: 27.6710, lng: 85.4298 };
  const phase1Steps = 15;
  const phase2Steps = 30;
  const stepDelay = 1000;

  onLocationUpdate(safeStart);

  // Phase 1: Current location to pickup (0-10%)
  for (let i = 0; i <= phase1Steps; i++) {
    if (rideStatusRef.current === 'cancelled' || rideStatusRef.current === 'completed') {
      break;
    }
    const t = i / phase1Steps;
    const currentLat = safeStart.lat + (safePickup.lat - safeStart.lat) * t;
    const currentLng = safeStart.lng + (safePickup.lng - safeStart.lng) * t;
    const location = { lat: currentLat, lng: currentLng };
    
    onLocationUpdate(location);
    const progress = Math.round(t * 10);
    onProgressUpdate(progress);
    
    if (userRole === 'driver' && !USE_TEST_DRIVER_LOCATION && rideId && !rideId.startsWith('mock_')) {
      try {
        webSocketService.emitEvent(
          'updateRideLocation',
          { latitude: currentLat, longitude: currentLng },
          (response: any) => {
            console.log('[simulateStraightLineMovement] updateRideLocation response:', response);
          },
          'ride'
        );
      } catch (error: any) {
        console.error('[simulateStraightLineMovement] WebSocket error:', error);
      }
    }
    await new Promise(resolve => setTimeout(resolve, stepDelay));
  }

  // Phase 2: Pickup to dropoff (10-100%)
  for (let i = 0; i <= phase2Steps; i++) {
    if (rideStatusRef.current === 'cancelled' || rideStatusRef.current === 'completed') {
      break;
    }
    const t = i / phase2Steps;
    const currentLat = safePickup.lat + (safeDropoff.lat - safePickup.lat) * t;
    const currentLng = safePickup.lng + (safeDropoff.lng - safePickup.lng) * t;
    const location = { lat: currentLat, lng: currentLng };
    
    onLocationUpdate(location);
    const progress = Math.round(10 + t * 90);
    onProgressUpdate(progress);
    
    if (userRole === 'driver' && !USE_TEST_DRIVER_LOCATION && rideId && !rideId.startsWith('mock_')) {
      try {
        webSocketService.emitEvent(
          'updateRideLocation',
          { latitude: currentLat, longitude: currentLng },
          (response: any) => {
            console.log('[simulateStraightLineMovement] updateRideLocation response:', response);
          },
          'ride'
        );
      } catch (error: any) {
        console.error('[simulateStraightLineMovement] WebSocket error:', error);
      }
    }
    await new Promise(resolve => setTimeout(resolve, stepDelay));
  }

  setSimulating(false);
};

// Memoized MapView to prevent unnecessary re-renders
const MemoizedMapView = React.memo(MapView);

const RideTrackerScreen = () => {
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (hasError) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <MaterialIcons name="error" size={48} color="#F44336" />
        <Text style={{ fontSize: 18, fontWeight: 'bold', marginTop: 16, textAlign: 'center' }}>
          Something went wrong
        </Text>
        <Text style={{ fontSize: 14, marginTop: 8, textAlign: 'center', color: '#666' }}>
          {errorMessage || 'Please try refreshing the app'}
        </Text>
        <TouchableOpacity
          style={{
            backgroundColor: '#075B5E',
            paddingHorizontal: 20,
            paddingVertical: 10,
            borderRadius: 8,
            marginTop: 16
          }}
          onPress={() => setHasError(false)}
        >
          <Text style={{ color: '#fff', fontWeight: 'bold' }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // --- PARAMS & ROUTER ---
  const params = useLocalSearchParams();
  const router = useRouter();
  const navigation = useNavigation();
  const rideId = params.rideId as string;
  const userRole = useUserRole();
  const cancellationReasons = userRole === 'driver'
    ? DRIVER_CANCELLATION_REASONS
    : PASSENGER_CANCELLATION_REASONS;
  const driverName = params.driverName as string;
  const passengerName = params.passengerName as string;
  const from = params.from as string;
  const to = params.to as string;
  const initialFare = params.fare as string;
  const vehicle = params.vehicle as string;
  const rideInProgress = params.rideInProgress === 'true';
  const rideCancelled = params.rideCancelled === 'true';

  // --- STATE ---
  const [progress, setProgress] = useState(0);
  const [rideStatus, setRideStatus] = useState<'pending' | 'accepted' | 'in-progress' | 'completed' | 'cancelled' | 'searching'>(
    rideCancelled ? 'cancelled' : (rideInProgress ? 'in-progress' : 'accepted')
  );
  // --- INITIAL LOCATION EXTRACTION FROM ROUTE PARAMS ---
  const initialPickup = (() => {
    const lat = Number(params.pickupLat || params.pickUpLat);
    const lng = Number(params.pickupLng || params.pickUpLng);
    if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
      return { lat, lng };
    }
    return { lat: 27.7172, lng: 85.3240 };
  })();

  const initialDropoff = (() => {
    const lat = Number(params.dropoffLat || params.dropOffLat);
    const lng = Number(params.dropoffLng || params.dropOffLng);
    if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
      return { lat, lng };
    }
    return { lat: 27.6710, lng: 85.3122 };
  })();

  const [pickupLocation, setPickupLocation] = useState<{ lat: number; lng: number } | null>(initialPickup);
  const [dropoffLocation, setDropoffLocation] = useState<{ lat: number; lng: number } | null>(initialDropoff);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [driverArrived, setDriverArrived] = useState(false);
  const [rideDetails, setRideDetails] = useState<Ride | null>(null);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [completedRoute, setCompletedRoute] = useState<{ lat: number; lng: number }[]>([]);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: 'success' | 'error' | 'info';
  }>({ visible: false, message: '', type: 'info' });
  const [isLoadingDetails, setIsLoadingDetails] = useState(true);
  const [rideStartTime, setRideStartTime] = useState<number | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [selectedReasonIndex, setSelectedReasonIndex] = useState<number | null>(null);
  const [isCancellationModalVisible, setIsCancellationModalVisible] = useState(false);
  const [showBackConfirmation, setShowBackConfirmation] = useState(false);
  const [modal, setModal] = useState<{
    visible: boolean;
    type: 'success' | 'error' | 'info';
    title: string;
    message: string;
    actionText?: string;
    onAction?: (() => void);
  }>({
    visible: false,
    type: 'info',
    title: '',
    message: '',
    actionText: undefined,
    onAction: undefined,
  });
  const [mainRoutePolyline, setMainRoutePolyline] = useState<{ latitude: number; longitude: number }[]>([]);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
  const mapRef = useRef<MapView>(null);
  const simIntervalRef = useRef<any>(null);
  const mockPickupRef = useRef({ lat: 27.7172, lng: 85.3240 });
  const mockDropoffRef = useRef({ lat: 27.6710, lng: 85.3122 });

  // --- PASSENGER UI STATES & countdown ---
  const [etaSeconds, setEtaSeconds] = useState(180);
  const [hasInitializedEta, setHasInitializedEta] = useState(false);

  // Reset initialization flag when not accepted
  useEffect(() => {
    if (rideStatus !== 'accepted') {
      setHasInitializedEta(false);
    }
  }, [rideStatus]);

  // Update ETA dynamically when driverLocation or pickupLocation changes
  useEffect(() => {
    if (driverLocation && pickupLocation && rideStatus === 'accepted') {
      const distance = calculateDistance(
        driverLocation.lat,
        driverLocation.lng,
        pickupLocation.lat,
        pickupLocation.lng
      );
      // Assume average speed of 25 km/h in Kathmandu
      const calculatedSeconds = Math.max(0, Math.round((distance / 25) * 3600));
      
      if (!hasInitializedEta) {
        setEtaSeconds(calculatedSeconds);
        setHasInitializedEta(true);
      } else {
        // Only update if the driver is significantly delayed or advanced to prevent restart loop
        if (calculatedSeconds > etaSeconds + 30 || etaSeconds > calculatedSeconds + 60) {
          setEtaSeconds(calculatedSeconds);
        }
      }
    }
  }, [driverLocation, pickupLocation, rideStatus, hasInitializedEta, etaSeconds]);

  // Countdown timer ticking down every second
  useEffect(() => {
    let timer: any;
    if (rideStatus === 'accepted') {
      timer = setInterval(() => {
        setEtaSeconds(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [rideStatus]);

  // Compute the actual fare from ride details or use initial fare
  const actualFare = rideDetails?.acceptedOffer?.offerAmount || 
                    (rideDetails as any)?.offerPrice || 
                    initialFare || 
                    '0';

  // --- ANIMATION REFS ---
  const progressAnimation = useRef(new Animated.Value(0)).current;
  const pulseAnimation = useRef(new Animated.Value(1)).current;
  const unreadBadgeAnimation = useRef(new Animated.Value(1)).current;

  // --- REFS ---
  const isMounted = useRef(true);
  const rideStatusRef = useRef<'pending' | 'accepted' | 'in-progress' | 'completed' | 'cancelled' | 'searching'>(rideStatus as 'pending' | 'accepted' | 'in-progress' | 'completed' | 'cancelled' | 'searching');
  const pickupLocationRef = useRef(pickupLocation);
  const dropoffLocationRef = useRef(dropoffLocation);
  const lastLocationUpdateRef = useRef(0);
  const rideStartedConfirmedRef = useRef(false);
  const locationTrackingStartedRef = useRef(false);
  const initialDriverLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const progressStartedRef = useRef(false); // Track if progress has started updating
  const simulationFinishedRef = useRef(false);

  // Update refs
  useEffect(() => {
    rideStatusRef.current = rideStatus;
    console.log('[RefUpdate] rideStatusRef:', rideStatus);
  }, [rideStatus]);
  useEffect(() => {
    pickupLocationRef.current = pickupLocation;
    console.log('[RefUpdate] pickupLocationRef:', pickupLocation);
  }, [pickupLocation]);
  useEffect(() => {
    dropoffLocationRef.current = dropoffLocation;
    console.log('[RefUpdate] dropoffLocationRef:', dropoffLocation);
  }, [dropoffLocation]);

  // Automatically trigger simulation when status is in-progress (commented out for real GPS mode)
  // useEffect(() => {
  //   if (userRole === 'driver' && rideStatus === 'in-progress' && !simulating && !simulationFinishedRef.current) {
  //     console.log('[AutoSimulate] Triggering auto simulation for driver');
  //     const timer = setTimeout(() => {
  //       handleSimulateMovement();
  //     }, 1000);
  //     return () => clearTimeout(timer);
  //   }
  // }, [rideStatus, simulating, userRole]);

  // --- TOAST HELPERS ---
  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    console.log('[showToast]', message, 'type:', type);
    setToast({ visible: true, message, type });
    
    // Different haptic feedback and duration based on type
    if (type === 'success') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(hideToast, 3000);
    } else if (type === 'error') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setTimeout(hideToast, 4000);
    } else {
      // For info messages (like new messages), use longer duration and success haptic
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(hideToast, 4000); // Longer duration for message notifications
    }
  };
  const hideToast = () => {
    setToast(prev => ({ ...prev, visible: false }));
  };

  // Animate unread badge when new message is received
  const animateUnreadBadge = () => {
    Animated.sequence([
      Animated.timing(unreadBadgeAnimation, {
        toValue: 1.3,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(unreadBadgeAnimation, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // --- BACK BUTTON HANDLER ---
  useEffect(() => {
    const backAction = () => {
      // If ride is completed or cancelled, completely block going back
      if (rideStatus === 'completed' || rideStatus === 'cancelled') {
        return true;
      }
      // Show confirmation modal if ride is in progress or accepted
      if (rideStatus === 'in-progress' || rideStatus === 'accepted') {
        setShowBackConfirmation(true);
        return true; // Prevent default back action
      }
      return false; // Allow default back action
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);

    return () => backHandler.remove();
  }, [rideStatus]);

  // --- LOGGING ---
  useEffect(() => {
    console.log('[RideTracker] Initializing rideId:', rideId, 'userRole:', userRole, 'rideStatus:', rideStatus);
  }, [rideId, userRole, rideStatus]);



  // --- COMPONENT FOCUS STATE ---
  const [isComponentActive, setIsComponentActive] = useState(true);
  const [isWebSocketConnected, setIsWebSocketConnected] = useState(false);

  // --- CLEANUP ON UNMOUNT ---
  useEffect(() => {
    return () => {
      console.log('[RideTracker] Component unmounting, cleaning up WebSocket connections');
      // Clean up WebSocket connections when component unmounts
      webSocketService.disconnect('ride');
      webSocketService.disconnect('driver');
      webSocketService.disconnect('passenger');
    };
  }, []);





  // --- WEBSOCKET CONNECTION ---
  const ensureSocketConnected = useCallback(async (rideId: string, namespace: 'passenger' | 'driver' | 'ride') => {
    try {
      // For ride namespace, check if ride is cancelled before connecting
      if (namespace === 'ride') {
        // Check if ride is already cancelled in local state
        if ((rideStatus as string) === 'cancelled') {
          console.log('[ensureSocketConnected] Ride is cancelled, skipping connection to ride namespace');
          throw new Error('Ride is no longer active');
        }
        
        // Also check via REST API if possible
        try {
          const rideDetailsResponse = await rideService.getRideDetails(rideId);
          if (rideDetailsResponse?.status === 'cancelled') {
            console.log('[ensureSocketConnected] Ride is cancelled in backend, skipping connection');
            setRideStatus('cancelled');
            throw new Error('Ride is no longer active');
          }
        } catch (error: any) {
          console.log('[ensureSocketConnected] Could not check ride status via REST API, proceeding with connection');
        }
      }
      
      if (!webSocketService.isSocketConnected(namespace)) {
          await webSocketService.connect(rideId, namespace);
        console.log(`[WebSocket] Connected to ${namespace} namespace with rideId: ${rideId}`);
      } else {
        console.log(`[WebSocket] Already connected to ${namespace} namespace with rideId: ${rideId}`);
      }
    } catch (error: any) {
      console.error(`[WebSocket] Failed to connect to ${namespace} namespace:`, error);
      
      // Don't show error toast for cancelled rides
      if (error.message?.includes('Ride is no longer active') || error.message?.includes('Ride is not in cancelable status')) {
        console.log(`[WebSocket] Suppressed error for cancelled ride in ${namespace} namespace`);
        return; // Don't throw, just return
      }
      
      showToast(`Failed to connect to ${namespace} WebSocket`, 'error');
      throw error;
    }
  }, [rideStatus]);

  // --- EMIT WHEN CONNECTED ---
  const emitWhenConnected = useCallback(
    async (event: string, data: any, namespace: 'passenger' | 'driver' | 'ride', timeoutMs: number = 15000) => {
      let attempt = 0;
      const maxRetries = 3;
      while (attempt < maxRetries) {
        try {
          await ensureSocketConnected(rideId, namespace);
          
          // If ensureSocketConnected returned early (for cancelled rides), don't proceed
          if (namespace === 'ride' && (rideStatus as string) === 'cancelled') {
            console.log('[emitWhenConnected] Ride is cancelled, skipping emit');
            throw new Error('Ride is no longer active');
          }
          
          // Double-check that socket is actually connected before emitting
          if (!webSocketService.isSocketConnected(namespace)) {
            console.log(`[emitWhenConnected] Socket not connected to ${namespace} namespace after ensureSocketConnected, retrying...`);
            throw new Error(`Socket not connected to ${namespace} namespace`);
          }
          
          return await new Promise((resolve, reject) => {
            webSocketService.emitEvent(event, data, (response: any) => {
              console.log(`[emitWhenConnected] ${event} response in ${namespace} namespace:`, response);
              if (response?.code === 200 || response?.code === 201) {
                resolve(response.data || response);
              } else {
                reject(new Error(response?.message || `Failed to emit ${event}`));
              }
            }, namespace);
            setTimeout(() => reject(new Error(`Timeout emitting ${event}`)), timeoutMs);
          });
        } catch (error: any) {
          attempt++;
          console.error(`[emitWhenConnected] Attempt ${attempt} failed for ${event}:`, error);
          
          // If ride is cancelled, don't retry
          if (error.message?.includes('Ride is no longer active') || error.message?.includes('Ride is not in cancelable status')) {
            console.log('[emitWhenConnected] Ride is cancelled, stopping retries');
            throw error;
          }
          
          // If socket is not connected, try to reconnect
          if (error.message?.includes('socket not connected') || error.message?.includes('Socket not connected')) {
            console.log(`[emitWhenConnected] Socket not connected, attempting to reconnect to ${namespace} namespace`);
            try {
              // Force disconnect and reconnect
              webSocketService.disconnect(namespace);
              await new Promise(res => setTimeout(res, 1000)); // Wait a bit before reconnecting
            } catch (reconnectError) {
              console.error(`[emitWhenConnected] Failed to reconnect to ${namespace} namespace:`, reconnectError);
            }
          }
          
          if (attempt >= maxRetries) {
            showToast(`Failed to emit ${event} after ${maxRetries} attempts`, 'error');
            throw error;
          }
          await new Promise(res => setTimeout(res, 500 * Math.pow(2, attempt)));
        }
      }
    },
    [ensureSocketConnected, rideId, rideStatus]
  );

  const emitWhenConnectedRef = useRef(emitWhenConnected);
  useEffect(() => {
    emitWhenConnectedRef.current = emitWhenConnected;
  }, [emitWhenConnected]);

  // Store reconnection attempts in a ref to persist across component renders/re-mounts
  const reconnectAttemptsRef = useRef(0);

  // --- WEBSOCKET CONNECTION STATUS CHECKER ---
  useEffect(() => {
    const maxReconnectAttempts = 5;

    const checkWebSocketConnection = async () => {
      // EARLY EXIT: Don't attempt reconnection for cancelled rides or searching rides
      if (rideStatus === 'cancelled' || rideCancelled || rideStatus === 'searching') {
        return;
      }
      
      const isConnected = webSocketService.isSocketConnected('ride');
      setIsWebSocketConnected(isConnected);
      
      if (!isConnected && isComponentActive && reconnectAttemptsRef.current < maxReconnectAttempts) {
        reconnectAttemptsRef.current++;
        console.log(`[WebSocket] Reconnecting to ride namespace (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})...`);
        
        try {
          // Force disconnect first to ensure clean state
          webSocketService.disconnect('ride');
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
          
          // Try to reconnect
          await ensureSocketConnected(rideId, 'ride');
          reconnectAttemptsRef.current = 0; // Reset attempts on success
        } catch (error) {
          // Wait longer between attempts
          await new Promise(resolve => setTimeout(resolve, 2000 * reconnectAttemptsRef.current));
        }
      } else if (isConnected) {
        reconnectAttemptsRef.current = 0; // Reset attempts when connected
      }
    };

    // Check connection status every 3 seconds
    const interval = setInterval(checkWebSocketConnection, 3000);
    
    // Initial check
    checkWebSocketConnection();

    return () => {
      clearInterval(interval);
    };
  }, [isComponentActive, rideId, ensureSocketConnected, rideStatus, rideCancelled]);

  // --- FOCUS LISTENER ---
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', async () => {
      setIsComponentActive(true);
      
      // Clear unread messages indicator when returning to ride tracker
      setHasUnreadMessages(false);
      
      // EARLY EXIT: Don't attempt reconnection for cancelled rides
      if (rideStatus === 'cancelled' || rideCancelled) {
        return;
      }
      
      // Immediately check and reconnect WebSocket when component becomes focused
      setTimeout(async () => {
        if (!webSocketService.isSocketConnected('ride')) {
          try {
            await ensureSocketConnected(rideId, 'ride');
          } catch (error) {
            // Silent fail
          }
        }
      }, 500); // Small delay to ensure state is updated
    });

    const blurUnsubscribe = navigation.addListener('blur', () => {
      setIsComponentActive(false);
    });

    return () => {
      unsubscribe();
      blurUnsubscribe();
    };
  }, [navigation, rideId, ensureSocketConnected, rideStatus, rideCancelled]);

  // --- UPDATE DRIVER LOCATION ---
  const updateDriverLocation = useCallback(
    throttle(
    async (location: { lat: number; lng: number }) => {
        // Only allow drivers to update ride location
        if (userRole !== 'driver') {
          return; // Silent return for passengers
        }
        
        // Additional safety check - ensure this is really a driver
        if (!webSocketService.isSocketConnected('driver')) {
          return; // Silent return if driver socket not connected
        }
        
        // Check if ride namespace is connected before attempting to emit ride location updates
        if (!webSocketService.isSocketConnected('ride')) {
          return; // Silent return if ride namespace not connected
        }
        
        // Check if component is active (user is on this screen)
        if (!isComponentActive) {
          return; // Silent return if component is not active
        }
        
        // Check if WebSocket is connected
        if (!isWebSocketConnected) {
          return; // Silent return if WebSocket is not connected
        }
        
        if (simulating) {
          return;
        }
        if (!pickupLocationRef.current || !dropoffLocationRef.current) {
          return;
        }
        if (rideStatusRef.current === 'cancelled') {
          return;
        }
        if (rideStatusRef.current !== 'in-progress' || !rideStartedConfirmedRef.current) {
          return;
        }

        try {
        setDriverLocation(location);
          setCompletedRoute(prev => {
            const newRoute = [...prev.slice(-100), location];
            return newRoute;
          });

          // Backend will calculate progress automatically

          // Only send location updates if user is driver and ride is in progress
          if (userRole === 'driver' && rideStatusRef.current === 'in-progress' && rideStartedConfirmedRef.current && !simulating) {
            const now = Date.now();
            if (now - lastLocationUpdateRef.current < 3000) { // Increased throttle to 3 seconds
              return;
            }
            lastLocationUpdateRef.current = now;
            
            // Backend handles progress calculation including initial movement detection
            
            const payload = { latitude: location.lat, longitude: location.lng };
            
            try {
              await emitWhenConnectedRef.current('updateRideLocation', payload, 'ride');
            } catch (error: any) {
              console.error('[updateDriverLocation] WebSocket error:', error);
              
              // Check if this is an expected error that should be suppressed
              const errorMessage = error.message || '';
              const expectedErrors = [
                'Failed to update location',
                'Ride ID is required',
                'Ride is not in accepted/ongoing status',
                'Only driver can update ride location',
                'Ride not found',
                'Invalid ride ID format',
                'Invalid coordinates provided',
                'Progress must be a number between 0 and 100',
                'User authentication required'
              ];
              
              const isExpectedError = expectedErrors.some(expectedError => 
                errorMessage.includes(expectedError)
              );
              
              if (isExpectedError || errorMessage?.includes('400')) {
                // Only attempt reconnection for non-expected errors or if it's a token issue
                if (error.message?.includes('token') || error.message?.includes('unauthorized')) {
                  try {
                    await webSocketService.reconnectAllWithNewToken();
                    // Retry the location update once after reconnection
                    setTimeout(async () => {
                      if (rideStatusRef.current === 'in-progress') {
                        try {
                          await emitWhenConnectedRef.current('updateRideLocation', payload, 'ride');
                        } catch (retryError) {
                          console.error('[updateDriverLocation] Retry failed:', retryError);
                        }
                      }
                    }, 1000);
                  } catch (reconnectError) {
                    console.error('[updateDriverLocation] Reconnection failed:', reconnectError);
                  }
                }
              }
            }
            
            // Check if at dropoff
            const toDropoffDistance = calculateDistance(
              location.lat,
              location.lng,
              dropoffLocationRef.current.lat,
              dropoffLocationRef.current.lng
            );
            if (toDropoffDistance < 0.05) { // 50m threshold
              console.log('[updateDriverLocation] Driver at dropoff, completing ride');
              
              // Set progress to 100% before completing
              setProgress(100);
          Animated.timing(progressAnimation, {
                toValue: 100,
            duration: 500,
            useNativeDriver: false,
          }).start();
              
              const isMock = rideId && rideId.startsWith('mock_');
              if (!isMock) {
                await emitWhenConnectedRef.current('endRide', { rideId }, 'ride');
              }
              setRideStatus('completed');
              setRideStartTime(null);
              showToast('Ride completed!', 'success');
              setTimeout(() => {
                if (isMounted.current) {
                  const role = userRole as string;
                  router.replace({
                    pathname: '/(tabs)/rideRate',
                    params: {
                      rideId,
                      userRole: role,
                      passengerName: rideDetails?.passenger?.firstName && rideDetails?.passenger?.lastName 
                        ? `${rideDetails.passenger.firstName} ${rideDetails.passenger.lastName}`
                        : (rideDetails?.passenger?.firstName || 'Passenger'),
                      driverName: rideDetails?.driver?.firstName && rideDetails?.driver?.lastName 
                        ? `${rideDetails.driver.firstName} ${rideDetails.driver.lastName}`
                        : (rideDetails?.driver?.firstName || 'Driver'),
                      from: from || ((rideDetails as any)?.pickUpLocation || 'Pickup Location'),
                      to: to || ((rideDetails as any)?.dropOffLocation || 'Dropoff Location'),
                      fare: actualFare.toString(),
                      vehicle: vehicle || ((rideDetails as any)?.vehicleType?.name || 'Vehicle')
                    }
                  });
                }
              }, 2000);
            }
        }
      } catch (error) {
          console.error('[updateDriverLocation] Error:', error);
        showToast('Error updating location', 'error');
      }
    },
      3000, // Increased throttle to 3 seconds
      { leading: false }
    ),
    [rideId, userRole, progressAnimation, simulating, rideStartTime]
  );

  const updateDriverLocationRef = useRef(updateDriverLocation);
  useEffect(() => {
    updateDriverLocationRef.current = updateDriverLocation;
  }, [updateDriverLocation]);

  // --- UPDATE PASSENGER LOCATION ---
  const updatePassengerLocation = useCallback(
    throttle(
      async (location: { lat: number; lng: number }) => {
        console.log('[updatePassengerLocation] Called with userRole:', userRole, 'location:', location);
        // PASSENGERS DO NOT SEND LOCATION UPDATES DURING RIDES
        // They only receive location updates from drivers
        if (userRole !== 'passenger') {
          console.log('[updatePassengerLocation] Blocked - user is not passenger');
          return; // Silent return for drivers
        }
        
        console.log('[updatePassengerLocation] PASSENGER LOCATION UPDATES DISABLED DURING RIDES');
        return; // Silent return - passengers don't send location updates during rides
        

      },
      10000, // Throttle to 10 seconds for passengers (less frequent than drivers)
      { leading: false }
    ),
    [userRole]
  );

  const updatePassengerLocationRef = useRef(updatePassengerLocation);
  useEffect(() => {
    updatePassengerLocationRef.current = updatePassengerLocation;
  }, [updatePassengerLocation]);

  // --- HANDLE RIDE LOCATION UPDATED ---
  const handleRideLocationUpdated = useCallback(
    throttle(
      (response: any) => {
        console.log('[handleRideLocationUpdated][TOP] Called with:', response, 'userRole:', userRole);
        console.log('[handleRideLocationUpdated] Received:', response);
        if (!response || !response.data || response.data._id !== rideId) {
          console.log('[handleRideLocationUpdated] Invalid or mismatched rideId:', response?.data?._id);
          return;
        }
        const data = response.data;
        
        // Set pickup and dropoff locations from the data if not already set
        if (data.pickUp?.coords?.coordinates && !pickupLocationRef.current) {
          const pickup = {
            lat: data.pickUp.coords.coordinates[1],
            lng: data.pickUp.coords.coordinates[0],
          };
          setPickupLocation(pickup);
          pickupLocationRef.current = pickup;
          console.log('[handleRideLocationUpdated] Set pickupLocation from WebSocket:', pickup);
        }
        
        if (data.dropOff?.coords?.coordinates && !dropoffLocationRef.current) {
          const dropoff = {
            lat: data.dropOff.coords.coordinates[1],
            lng: data.dropOff.coords.coordinates[0],
          };
          setDropoffLocation(dropoff);
          dropoffLocationRef.current = dropoff;
          console.log('[handleRideLocationUpdated] Set dropoffLocation from WebSocket:', dropoff);
        }
        
        if (!data.currLocation || !data.currLocation.latitude || !data.currLocation.longitude) {
          console.log('[handleRideLocationUpdated] Missing currLocation data');
          return;
        }
        const newLocation = { lat: data.currLocation.latitude, lng: data.currLocation.longitude };

        // CRITICAL: Only update driver location if simulation mode is disabled
        // If simulation mode is active, simulated updates should not be overridden by network latency
        if (!simulating) {
          if (!USE_TEST_DRIVER_LOCATION || userRole !== 'driver') {
            // Update driver location and route immediately
            setDriverLocation(newLocation);
            setCompletedRoute(prev => {
              const newRoute = [...prev.slice(-100), newLocation];
              console.log('[handleRideLocationUpdated] Updated completedRoute:', newRoute);
              return newRoute;
            });
            console.log('[handleRideLocationUpdated] Updated driver location from backend:', newLocation);
          } else {
            console.log('[handleRideLocationUpdated] Test mode enabled - ignoring backend driver location update:', newLocation);
          }
        } else {
          console.log('[handleRideLocationUpdated] Simulation active - ignoring backend driver location update:', newLocation);
        }
        
        // --- PROGRESS UPDATE ---
        if (typeof data.progress === 'number') {
          setProgress(prev => {
            if (data.progress >= lastProgressRef.current) {
              lastProgressRef.current = data.progress;
              progressStartedRef.current = true;
              return data.progress;
            } else {
              // Ignore backwards progress update
              return prev;
            }
          });
          setTimeout(() => {
            Animated.timing(progressAnimation, {
              toValue: Math.max(data.progress, lastProgressRef.current),
              duration: 500,
              useNativeDriver: false,
            }).start();
          }, 0);
          console.log('[handleRideLocationUpdated] Progress update received:', data.progress, 'userRole:', userRole);
        }
        // ... rest of handler ...
      },
      1000,
      { leading: true, trailing: true }
    ),
    [rideId, userRole, progressAnimation, simulating]
  );

  // --- INITIALIZE LOCATION TRACKING ---
  const initializeLocationTracking = async () => {
    try {
      // EARLY EXIT: Don't start location tracking for cancelled rides
      if (rideStatus === 'cancelled' || rideCancelled) {
        console.log('[initializeLocationTracking] Ride is cancelled, skipping location tracking');
        return;
      }
      
      if (simulating) {
        console.log('[initializeLocationTracking] Simulation in progress, skipping real tracking');
        return;
      }
      if (rideStatus !== 'in-progress' || !rideStartedConfirmedRef.current) {
        console.log('[initializeLocationTracking] Not starting: rideStatus:', rideStatus, 'rideStartedConfirmed:', rideStartedConfirmedRef.current);
        return;
      }
      
      // Prevent multiple location tracking sessions
      if (locationTrackingStartedRef.current) {
        console.log('[initializeLocationTracking] Location tracking already started, skipping');
        return;
      }
      
      // CRITICAL: If test mode is enabled for drivers, DO NOT start GPS tracking
      if (userRole === 'driver' && USE_TEST_DRIVER_LOCATION) {
        console.log('[initializeLocationTracking] Test mode enabled - skipping GPS tracking for driver');
        locationTrackingStartedRef.current = true;
        return;
      }
      
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.error('[initializeLocationTracking] Location permission denied');
        showToast('Location permission denied', 'error');
        return;
      }
      
      // CRITICAL: Stop any existing location tracking to prevent conflicts
      locationService.stopLocationTracking();
      console.log('[initializeLocationTracking] Stopped existing location tracking');
      
      // Add a longer delay to ensure the previous tracking session is fully stopped
      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (userRole === 'driver') {
        // For drivers: start continuous location tracking for ride updates
        // Only if test mode is disabled
        if (!USE_TEST_DRIVER_LOCATION) {
          const location = await locationService.getCurrentLocation();
          console.log('[initializeLocationTracking] Driver initial location:', location);
          updateDriverLocationRef.current({ lat: location.latitude, lng: location.longitude });
          
          await locationService.startLocationTracking(
            async (newLocation) => {
              // Only update location if user is driver and ride is in progress
              if (userRole === 'driver' && rideStatusRef.current === 'in-progress' && !simulating) {
                console.log('[initializeLocationTracking] Driver new location:', newLocation);
                updateDriverLocationRef.current({ lat: newLocation.latitude, lng: newLocation.longitude });
              }
            },
            { 
              accuracy: Location.Accuracy.Balanced, 
              timeInterval: 10000, // Increased to 10 seconds to reduce frequency
              distanceInterval: 50, // Increased to 50 meters
              role: 'driver'
            }
          );
          console.log('[initializeLocationTracking] Started continuous tracking for driver');
        } else {
          console.log('[initializeLocationTracking] Test mode enabled - GPS tracking disabled for driver');
        }
        locationTrackingStartedRef.current = true;
      } else if (userRole === 'passenger') {
        // For passengers: NO location tracking at all during rides
        // Passengers only need to receive location updates, not send them
        console.log('[initializeLocationTracking] Passenger location tracking completely disabled during rides');
        locationTrackingStartedRef.current = true;
      }
    } catch (error) {
      console.error('[initializeLocationTracking] Error:', error);
      showToast('Error starting location tracking', 'error');
    }
  };

  // --- SETUP WEBSOCKET AND FETCH RIDE DETAILS ---
  useEffect(() => {
    isMounted.current = true;
    lastProgressRef.current = 0;
    console.log('[RideTracker] Initializing rideId:', rideId, 'userRole:', userRole, 'rideStatus:', rideStatus);
    
    const setupWebSocketAndFetch = async () => {
      try {
        setIsLoadingDetails(true);

        // Check if we are simulating/mocking for testing
        const isSimulating = params.simulating === 'true';
        if (isSimulating || (rideId && rideId.startsWith('mock_'))) {
          console.log('[setupWebSocketAndFetch] Simulating ride tracker, loading mock details...');
          
          // Setup mock pickup and dropoff coords (Kathmandu areas)
          const mockPickup = { lat: 27.7172, lng: 85.3240 };
          const mockDropoff = { lat: 27.6710, lng: 85.3122 };
          setPickupLocation(mockPickup);
          setDropoffLocation(mockDropoff);
          
          // Setup mock driver location slightly offset from pickup
          const mockDriver = { lat: 27.7190, lng: 85.3280 };
          setDriverLocation(mockDriver);
          setCompletedRoute([mockDriver]);
          
          // Construct mock ride details
          const mockRide: any = {
            _id: rideId,
            status: 'accepted',
            passenger: {
              _id: 'mock_passenger_1',
              firstName: 'Test',
              lastName: 'Passenger',
              mobile: '9801020304',
            },
            driver: {
              _id: 'mock_driver_1',
              firstName: params.driverName ? String(params.driverName).split(' ')[0] : 'Ramesh',
              lastName: params.driverName ? String(params.driverName).split(' ').slice(1).join(' ') : 'Adhikari',
              mobile: '+9779812345678',
              rating: 4.8,
            },
            driverProfile: {
              rating: 4.77,
              totalRides: 142,
              vehicleColor: 'White',
              vehicleMake: 'Suzuki',
              vehicleModel: params.vehicle ? String(params.vehicle) : 'White Suzuki Cultus',
              vehicleRegNum: 'LF-638',
            },
            vehicleType: {
              name: params.vehicle ? String(params.vehicle) : 'Car',
            },
            offerPrice: parseFloat(params.fare as string) || 120,
            pickUpLocation: params.from ? String(params.from) : 'Kathmandu',
            dropOffLocation: params.to ? String(params.to) : 'Lalitpur',
          };
          setRideDetails(mockRide);
          setIsLoadingDetails(false);
          
          // Initialize simulated driver movement (arriving & ongoing trip progress)
          let step = 0;
          let phase = 1; // 1: Arriving, 2: Ongoing
          
          simIntervalRef.current = setInterval(() => {
            step += 1;
            
            if (phase === 1) {
              // Phase 1: Move driver closer to pickup (15 steps of 2s each = 30s total)
              const totalSteps = 15;
              const ratio = Math.min(1, step / totalSteps);
              const newLat = mockDriver.lat + (mockPickup.lat - mockDriver.lat) * ratio;
              const newLng = mockDriver.lng + (mockPickup.lng - mockDriver.lng) * ratio;
              setDriverLocation({ lat: newLat, lng: newLng });
              
              if (step >= totalSteps) {
                // Reached pickup! Pause simulation and wait for passenger action
                if (simIntervalRef.current) clearInterval(simIntervalRef.current);
                setDriverArrived(true);
                showToast('Driver has arrived at the pickup location!', 'success');
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                
                phase = 2;
                step = 0;
              }
            } else if (phase === 2) {
              // Phase 2: Move driver from pickup to dropoff (15 steps of 2s each = 30s total)
              const totalSteps = 15;
              const ratio = Math.min(1, step / totalSteps);
              const newLat = mockPickup.lat + (mockDropoff.lat - mockPickup.lat) * ratio;
              const newLng = mockPickup.lng + (mockDropoff.lng - mockPickup.lng) * ratio;
              setDriverLocation({ lat: newLat, lng: newLng });
              
              const currentProgress = Math.round(ratio * 100);
              setProgress(currentProgress);
              
              Animated.timing(progressAnimation, {
                toValue: currentProgress,
                duration: 500,
                useNativeDriver: false,
              }).start();
              
              if (step >= totalSteps) {
                // Reached dropoff! Complete ride
                if (simIntervalRef.current) clearInterval(simIntervalRef.current);
                
                setTimeout(() => {
                  setRideStatus('completed');
                  showToast('Ride completed!', 'success');
                  
                  setTimeout(() => {
                    const role = userRole as string;
                    router.replace({
                      pathname: '/(tabs)/rideRate',
                      params: {
                        rideId,
                        userRole: role,
                        passengerName: params.passengerName ? String(params.passengerName) : (rideDetails?.passenger?.firstName ? `${rideDetails.passenger.firstName} ${rideDetails.passenger.lastName || ''}` : 'Passenger'),
                        driverName: params.driverName ? String(params.driverName) : (rideDetails?.driver?.firstName ? `${rideDetails.driver.firstName} ${rideDetails.driver.lastName || ''}` : 'Driver'),
                        from: params.from ? String(params.from) : ((rideDetails as any)?.pickUpLocation || 'Kathmandu Mall'),
                        to: params.to ? String(params.to) : ((rideDetails as any)?.dropOffLocation || 'Bhaktapur'),
                        fare: (rideDetails?.offerPrice || params.fare || '120').toString(),
                        vehicle: params.vehicle ? String(params.vehicle) : ((rideDetails as any)?.vehicleType?.name || 'Car')
                      }
                    });
                  }, 2000);
                }, 1000);
              }
            }
          }, 2000);
          
          return;
        }
        
        // EARLY EXIT: If ride is already cancelled, don't setup anything
        if (rideStatus === 'cancelled' || rideCancelled) {
          console.log('[setupWebSocketAndFetch] Ride is cancelled, skipping all setup');
          setRideStatus('cancelled');
          setIsLoadingDetails(false);
          showToast('This ride has been cancelled', 'info');
          setTimeout(() => {
            if (isMounted.current) {
              if (userRole === 'passenger') {
                router.replace('/(tabs)');
              } else {
                router.replace({ pathname: '/(driver)/driverSection', params: { fromRideComplete: 'true' } });
              }
            }
          }, 2000);
          return;
        }
        
        // Check ride status via REST API first to avoid unnecessary WebSocket connections
        try {
          const rideDetailsResponse = await rideService.getRideDetails(rideId);
          if (rideDetailsResponse?.status === 'cancelled') {
            console.log('[setupWebSocketAndFetch] Ride is cancelled in backend, skipping WebSocket setup');
            setRideStatus('cancelled');
            setIsLoadingDetails(false);
            showToast('This ride has been cancelled', 'info');
            setTimeout(() => {
              if (isMounted.current) {
                if (userRole === 'passenger') {
                  router.replace('/(tabs)');
                } else {
                  router.replace({ pathname: '/(driver)/driverSection', params: { fromRideComplete: 'true' } });
                }
              }
            }, 2000);
            return;
          }
        } catch (error) {
          console.log('[setupWebSocketAndFetch] Could not check ride status via REST API, proceeding with WebSocket');
        }
        
        // Don't setup WebSocket if ride is already cancelled in local state
        if ((rideStatus as string) === 'cancelled') {
          console.log('[setupWebSocketAndFetch] Ride is already cancelled in local state, skipping WebSocket setup');
          setIsLoadingDetails(false);
          return;
        }
        
        const namespaces = ['ride', userRole];
        await Promise.all(namespaces.map(ns => ensureSocketConnected(rideId, ns as any)));
        const response = (await emitWhenConnected('getRideDetails', { rideId }, 'ride')) as any;
        console.log('[setupWebSocketAndFetch] Ride details response:', JSON.stringify(response, null, 2));
        
        // Extract the actual ride details from the response
        const details = response?.ride || response;
        console.log('[setupWebSocketAndFetch] Extracted ride details:', JSON.stringify(details, null, 2));
        
        if (isMounted.current && details) {
          setRideDetails(details);
          
          // Check if ride is cancelled in the backend
          if (details?.status === 'cancelled') {
            console.log('[setupWebSocketAndFetch] Ride is cancelled in backend:', details?.status);
            setRideStatus('cancelled');
            setIsLoadingDetails(false);
            showToast('This ride has been cancelled', 'info');
            setTimeout(() => {
              if (isMounted.current) {
                if (userRole === 'passenger') {
                  router.replace('/(tabs)');
                } else {
                  router.replace({ pathname: '/(driver)/driverSection', params: { fromRideComplete: 'true' } });
                }
              }
            }, 2000);
            return;
          }
          
          let pickup = details?.pickUp?.coords?.coordinates
            ? { lat: details.pickUp.coords.coordinates[1], lng: details.pickUp.coords.coordinates[0] }
            : null;
          let dropoff = details?.dropOff?.coords?.coordinates
            ? { lat: details.dropOff.coords.coordinates[1], lng: details.dropOff.coords.coordinates[0] }
            : null;

          // Fallback to route navigation params if API coords are unpopulated
          if (!pickup && (params.pickupLat || params.pickUpLat)) {
            const pLat = Number(params.pickupLat || params.pickUpLat);
            const pLng = Number(params.pickupLng || params.pickUpLng);
            if (!isNaN(pLat) && !isNaN(pLng) && pLat !== 0 && pLng !== 0) {
              pickup = { lat: pLat, lng: pLng };
            }
          }
          if (!dropoff && (params.dropoffLat || params.dropOffLat)) {
            const dLat = Number(params.dropoffLat || params.dropOffLat);
            const dLng = Number(params.dropoffLng || params.dropOffLng);
            if (!isNaN(dLat) && !isNaN(dLng) && dLat !== 0 && dLng !== 0) {
              dropoff = { lat: dLat, lng: dLng };
            }
          }

          // Default fallback coordinates for Kathmandu testing
          if (!pickup) pickup = { lat: 27.7172, lng: 85.3240 };
          if (!dropoff) dropoff = { lat: 27.6710, lng: 85.3122 };

          setPickupLocation(pickup);
          setDropoffLocation(dropoff);
          
          if (details?.status === 'ongoing') {
            setRideStatus('in-progress');
            rideStartedConfirmedRef.current = true;
            console.log('[setupWebSocketAndFetch] Set rideStatus to in-progress');
          } else if (details?.status === 'completed') {
            setRideStatus('completed');
            console.log('[setupWebSocketAndFetch] Set rideStatus to completed');
          } else if (details?.status === 'searching') {
            setRideStatus('searching');
            console.log('[setupWebSocketAndFetch] Set rideStatus to searching');
          } else if (details?.status === 'accepted') {
            setRideStatus('accepted');
            console.log('[setupWebSocketAndFetch] Set rideStatus to accepted');
          }
          if (details?.currLocation) {
            const initialLocation = {
              lat: details.currLocation.latitude,
              lng: details.currLocation.longitude,
            };
            setDriverLocation(initialLocation);
            setCompletedRoute([initialLocation]);
            console.log('[setupWebSocketAndFetch] Set initial driverLocation:', initialLocation);
          } else if (userRole === 'driver') {
            // For drivers, use test location if enabled, otherwise use real GPS
            if (USE_TEST_DRIVER_LOCATION && pickupLocation) {
              const testLocation = await getTestDriverLocation(pickupLocation);
              if (testLocation) {
                setDriverLocation(testLocation);
                setCompletedRoute([testLocation]);
                console.log('[setupWebSocketAndFetch] Set test driverLocation near pickup:', testLocation);
              }
            } else if (!USE_TEST_DRIVER_LOCATION) {
              // Only use real GPS if test mode is OFF
              try {
                const location = await locationService.getCurrentLocation();
                const initialLocation = { lat: location.latitude, lng: location.longitude };
                setDriverLocation(initialLocation);
                setCompletedRoute([initialLocation]);
                console.log('[setupWebSocketAndFetch] Set driverLocation from GPS:', initialLocation);
              } catch (error) {
                console.error('[setupWebSocketAndFetch] Failed to get GPS location:', error);
                // Fallback to a default location in Kathmandu
                const fallbackLocation = { lat: 27.7172, lng: 85.3240 };
                setDriverLocation(fallbackLocation);
                setCompletedRoute([fallbackLocation]);
                console.log('[setupWebSocketAndFetch] Set fallback driverLocation:', fallbackLocation);
              }
            }
            // If USE_TEST_DRIVER_LOCATION is true but pickupLocation is not available yet,
            // the useEffect will handle setting the test location once pickupLocation is set
          } else if (userRole === 'passenger') {
            // For passengers, if no current location is available, use a default location
            // This will be updated when the driver sends their first location update
            let defaultLocation = {
              lat: pickupLocation?.lat || 27.7172,
              lng: pickupLocation?.lng || 85.3240,
            };
            // Only use details.currLocation if it is in Kathmandu and within 2km of pickup
            if (
              details?.currLocation &&
              isInKathmandu(details.currLocation.latitude, details.currLocation.longitude) &&
              pickupLocation &&
              calculateDistance(
                details.currLocation.latitude,
                details.currLocation.longitude,
                pickupLocation.lat,
                pickupLocation.lng
              ) <= 2
            ) {
              defaultLocation = {
                lat: details.currLocation.latitude,
                lng: details.currLocation.longitude,
              };
            }
            setDriverLocation(defaultLocation);
            setCompletedRoute([defaultLocation]);
            console.log('[setupWebSocketAndFetch] Set passenger default driverLocation:', defaultLocation);
          }
        }
        setIsLoadingDetails(false);
      } catch (error) {
        console.error('[setupWebSocketAndFetch] Error:', error);
        setIsLoadingDetails(false);
        showToast('Failed to load ride details', 'error');
      }
    };
    
    setupWebSocketAndFetch().catch(error => {
      console.error('[RideTracker] Error in setupWebSocketAndFetch:', error);
      setErrorMessage('Failed to setup ride tracking');
      setHasError(true);
    });
    
    // EARLY EXIT: Don't start location tracking for cancelled rides
    if (userRole === 'driver' && rideStatus === 'in-progress' && rideStartedConfirmedRef.current) {
      initializeLocationTracking();
    }
    
    return () => {
      console.log('[RideTracker] Cleanup effect');
      isMounted.current = false;
      lastProgressRef.current = 0;
      locationService.stopLocationTracking();
      locationTrackingStartedRef.current = false;
      webSocketService.disconnect('ride');
      webSocketService.disconnect(userRole);
      if (simIntervalRef.current) {
        clearInterval(simIntervalRef.current);
      }
      
      // Clean up socket error handler
      const rideSocket = webSocketService.getSocket('ride');
      if (rideSocket) {
        rideSocket.off('error');
      }
    };
  }, [rideId, userRole, rideCancelled]);

  // --- WEBSOCKET EVENT LISTENERS ---
  useEffect(() => {
    // EARLY EXIT: Don't setup listeners for cancelled rides
    if (rideStatus === 'cancelled' || rideCancelled) {
      console.log('[RideTracker] Ride is cancelled, skipping WebSocket event listeners');
      return;
    }

    // EARLY EXIT: Don't setup listeners if still loading details
    if (isLoadingDetails) {
      console.log('[RideTracker] Still loading details, skipping event listeners');
      return;
    }

    // EARLY EXIT: Don't setup listeners if WebSocket is not connected
    if (!webSocketService.isSocketConnected('ride')) {
      console.log('[RideTracker] WebSocket not connected to ride namespace, skipping event listeners');
      return;
    }

    console.log('[RideTracker] Setting up WebSocket event listeners');

    // Handle ride cancellation
    const handleRideCancelled = (data: any) => {
      console.log('[RideTracker] Ride cancelled event received:', data);
      if (data && data.code === 201 && data.data) {
        // Check if this cancelled ride belongs to the current user
        const cancelledRideId = data.data.rideId || data.data.id;
        if (cancelledRideId && cancelledRideId === rideId) {
          console.log('[RideTracker] Processing cancelled ride for current user');
          setRideStatus('cancelled');
          showToast('Ride has been cancelled', 'info');
          
          // Navigate back to appropriate screen after a short delay
          setTimeout(() => {
            if (isMounted.current) {
              if (userRole === 'passenger') {
                router.replace('/(tabs)');
              } else {
                router.replace({ pathname: '/(driver)/driverSection', params: { fromRideComplete: 'true' } });
              }
            }
          }, 2000);
        } else {
          console.log('[RideTracker] Ignoring cancelled ride for different user');
        }
      }
    };

    // Handle ride status updates
    const handleRideStatusUpdate = (data: any) => {
      console.log('[RideTracker] Ride status update received:', data);
      if (data && data.data && data.data.status) {
        // Check if this status update belongs to the current user's ride
        const updatedRideId = data.data.rideId || data.data.id;
        if (updatedRideId && updatedRideId === rideId) {
          console.log('[RideTracker] Processing status update for current user');
          const newStatus = data.data.status;
          console.log('[RideTracker] Status changed to:', newStatus);
          
          if (newStatus === 'cancelled') {
            setRideStatus('cancelled');
            showToast('Ride has been cancelled', 'info');
            setTimeout(() => {
              if (isMounted.current) {
                if (userRole === 'passenger') {
                  router.replace('/(tabs)');
                } else {
                  router.replace({ pathname: '/(driver)/driverSection', params: { fromRideComplete: 'true' } });
                }
              }
            }, 2000);
          } else if (newStatus === 'completed') {
            setRideStatus('completed');
            showToast('Ride completed!', 'success');
            setTimeout(() => {
              if (isMounted.current) {
                const role = userRole as string;
                router.replace({
                  pathname: '/(tabs)/rideRate',
                  params: {
                    rideId,
                    userRole: role,
                    passengerName: rideDetails?.passenger?.firstName && rideDetails?.passenger?.lastName 
                      ? `${rideDetails.passenger.firstName} ${rideDetails.passenger.lastName}`
                      : (rideDetails?.passenger?.firstName || 'Passenger'),
                    driverName: rideDetails?.driver?.firstName && rideDetails?.driver?.lastName 
                      ? `${rideDetails.driver.firstName} ${rideDetails.driver.lastName}`
                      : (rideDetails?.driver?.firstName || 'Driver'),
                    from: from || ((rideDetails as any)?.pickUpLocation || 'Pickup Location'),
                    to: to || ((rideDetails as any)?.dropOffLocation || 'Dropoff Location'),
                    fare: actualFare.toString(),
                    vehicle: vehicle || ((rideDetails as any)?.vehicleType?.name || 'Vehicle')
                  }
                });
              }
            }, 2000);
          } else if (newStatus === 'searching') {
            setRideStatus('searching');
          } else if (newStatus === 'ongoing') {
            setRideStatus('in-progress');
            rideStartedConfirmedRef.current = true;
          } else {
            // Update status for other status changes
            setRideStatus(newStatus as any);
          }
        } else {
          console.log('[RideTracker] Ignoring status update for different user');
        }
      }
    };

    // Handle ride started
    const handleRideStarted = (data: any) => {
      console.log('[RideTracker] Ride started event received:', data);
      if (data && data.code === 201) {
        setRideStatus('in-progress');
        rideStartedConfirmedRef.current = true;
        showToast('Ride started!', 'success');
      }
    };

    // Handle ride completed
    const handleRideCompleted = (data: any) => {
      console.log('[RideTracker] Ride completed event received:', data);
      if (data && data.code === 201) {
        setRideStatus('completed');
        showToast('Ride completed!', 'success');
        setTimeout(() => {
          if (isMounted.current) {
            const role = userRole as string;
            router.replace({
              pathname: '/(tabs)/rideRate',
              params: {
                rideId,
                userRole: role,
                passengerName: rideDetails?.passenger?.firstName && rideDetails?.passenger?.lastName 
                  ? `${rideDetails.passenger.firstName} ${rideDetails.passenger.lastName}`
                  : (rideDetails?.passenger?.firstName || 'Passenger'),
                driverName: rideDetails?.driver?.firstName && rideDetails?.driver?.lastName 
                  ? `${rideDetails.driver.firstName} ${rideDetails.driver.lastName}`
                  : (rideDetails?.driver?.firstName || 'Driver'),
                from: from || ((rideDetails as any)?.pickUpLocation || 'Pickup Location'),
                to: to || ((rideDetails as any)?.dropOffLocation || 'Dropoff Location'),
                fare: actualFare.toString(),
                vehicle: vehicle || ((rideDetails as any)?.vehicleType?.name || 'Vehicle')
              }
            });
          }
        }, 2000);
      }
    };

    // Handle new message
    const handleNewMessage = (data: any) => {
      console.log('[RideTracker] New message received:', data);
      
      // Handle different message event formats
      let messageData = data;
      let rideIdFromMessage = null;
      
      // Check if data is wrapped in a response object
      if (data?.data) {
        messageData = data.data;
      }
      
      // Extract rideId from different possible locations
      if (messageData?.rideId) {
        rideIdFromMessage = messageData.rideId;
      } else if (messageData?.ride) {
        rideIdFromMessage = messageData.ride;
      } else if (data?.rideId) {
        rideIdFromMessage = data.rideId;
      }
      
      // Verify this message belongs to the current ride
      if (rideIdFromMessage === rideId) {
                setHasUnreadMessages(true);
        
        // Animate the unread badge
        animateUnreadBadge();
        
        // Get sender information for better toast message
        const senderName = messageData?.sender?.firstName || 
                          messageData?.senderName || 
                          (messageData?.senderRole === 'driver' ? 'Driver' : 'Passenger');
        
        // Get message preview if available
        const messagePreview = messageData?.content || messageData?.message || '';
        const previewText = messagePreview.length > 30 ? messagePreview.substring(0, 30) + '...' : messagePreview;
        
        // Show more informative toast with message preview
        const toastMessage = previewText ? 
          `New message: "${previewText}"` : 
          `New message: ${senderName}`;
        showToast(toastMessage, 'info');
        
        // Add haptic feedback for new messages
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    };

    // Handle message created event (alternative event name)
    const handleMessageCreated = (data: any) => {
      console.log('[RideTracker] Message created event received:', data);
      handleNewMessage(data);
    };

    // Handle driver arrived event
    const handleDriverArrived = (data: any) => {
      console.log('[RideTracker] Driver arrived event received:', data);
      setDriverArrived(true);
      if (userRole === 'passenger') {
        showToast('Driver has arrived at the pickup location!', 'success');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    };

    // Handle passenger coming event
    const handlePassengerComing = (data: any) => {
      console.log('[RideTracker] Passenger coming event received:', data);
      if (userRole === 'driver') {
        showToast('Passenger is coming to the vehicle!', 'info');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    };

    // Set up event listeners
    webSocketService.on('rideCancelled', handleRideCancelled, 'ride');
    webSocketService.on('rideStatusUpdate', handleRideStatusUpdate, 'ride');
    webSocketService.on('rideStarted', handleRideStarted, 'ride');
    webSocketService.on('rideCompleted', handleRideCompleted, 'ride');
    webSocketService.on('rideLocationUpdated', handleRideLocationUpdated, 'ride');
    webSocketService.on('newMessage', handleNewMessage, 'ride');
    webSocketService.on('messageCreated', handleMessageCreated, 'ride');
    webSocketService.on('driverArrived', handleDriverArrived, 'ride');
    webSocketService.on('passengerComing', handlePassengerComing, 'ride');
    
    console.log('[RideTracker] WebSocket event listeners set up successfully');

    // Cleanup function
    return () => {
      console.log('[RideTracker] Cleaning up WebSocket event listeners');
      webSocketService.off('rideCancelled', handleRideCancelled, 'ride');
      webSocketService.off('rideStatusUpdate', handleRideStatusUpdate, 'ride');
      webSocketService.off('rideStarted', handleRideStarted, 'ride');
      webSocketService.off('rideCompleted', handleRideCompleted, 'ride');
      webSocketService.off('rideLocationUpdated', handleRideLocationUpdated, 'ride');
      webSocketService.off('newMessage', handleNewMessage, 'ride');
      webSocketService.off('messageCreated', handleMessageCreated, 'ride');
      webSocketService.off('driverArrived', handleDriverArrived, 'ride');
      webSocketService.off('passengerComing', handlePassengerComing, 'ride');
    };
  }, [rideId, userRole, rideStatus, rideCancelled, router, isWebSocketConnected, isLoadingDetails]);

  // --- START LOCATION TRACKING ---
  useEffect(() => {
    // EARLY EXIT: Don't start location tracking for cancelled rides
    if (rideStatus === 'cancelled' || rideCancelled) {
      console.log('[RideTracker] Ride is cancelled, skipping location tracking initialization');
      return;
    }
    
    // CRITICAL: Only drivers should track location during rides
    // Passengers should NEVER send location updates during rides
    if (userRole === 'driver' && rideStatus === 'in-progress' && !simulating && rideStartedConfirmedRef.current) {
      console.log('[RideTracker] Starting location tracking for driver');
      initializeLocationTracking();
    } else if (userRole === 'passenger') {
      console.log('[RideTracker] PASSENGER LOCATION TRACKING COMPLETELY DISABLED DURING RIDES');
      // Passengers should never track location during rides
    } else {
      console.log('[RideTracker] Not starting location tracking:', {
        userRole,
        rideStatus,
        simulating,
        rideStartedConfirmed: rideStartedConfirmedRef.current
      });
    }
  }, [userRole, rideStatus, simulating, rideStartedConfirmedRef.current, rideCancelled]);

  // --- GENERATE ROUTE POLYLINES ---
  // Helper to find closest point index on polyline
  function findClosestPointIndex(polyline: {latitude: number; longitude: number}[], point: {lat: number; lng: number}): number {
    let minDist = Infinity;
    let minIdx = 0;
    for (let i = 0; i < polyline.length; i++) {
      const d = calculateDistance(polyline[i].latitude, polyline[i].longitude, point.lat, point.lng);
      if (d < minDist) {
        minDist = d;
        minIdx = i;
      }
    }
    return minIdx;
  }

  const generateRoutePolylines = () => {
    if (rideStatus === 'cancelled' || mainRoutePolyline.length === 0) return [];
    if (!pickupLocation || !dropoffLocation || !driverLocation) return [];

    // Find closest point on polyline to driver
    const driverIdx = findClosestPointIndex(mainRoutePolyline, driverLocation);
    const pickupIdx = findClosestPointIndex(mainRoutePolyline, pickupLocation);
    const dropoffIdx = findClosestPointIndex(mainRoutePolyline, dropoffLocation);

    let polylines = [];

    // Draw car-to-pickup segment using Directions API polyline
    if (driverIdx < pickupIdx) {
      polylines.push({
        coordinates: mainRoutePolyline.slice(driverIdx, pickupIdx + 1),
        strokeColor: '#FF9800',
        strokeWidth: 4,
        zIndex: 1,
        key: 'car-to-pickup',
      });
    }

    // Pickup to dropoff (main route)
    if (pickupIdx < dropoffIdx) {
      polylines.push({
        coordinates: mainRoutePolyline.slice(pickupIdx, dropoffIdx + 1),
        strokeColor: '#2196F3',
        strokeWidth: 4,
        zIndex: 1,
        key: 'pickup-to-dropoff',
      });
    }

    // Completed route (green) - REMOVED as requested
    // if (completedRoute.length > 1) {
    //   polylines.push({
    //     coordinates: completedRoute.map(point => ({ latitude: point.lat, longitude: point.lng })),
    //     strokeColor: '#4CAF50',
    //     strokeWidth: 6,
    //     zIndex: 2,
    //     key: 'completed-route',
    //   });
    // }

    return polylines;
  };

  // --- BUTTON HANDLERS ---
  const handleDriverArrivedAction = async () => {
    try {
      setLoading(true);
      setDriverArrived(true);
      showToast("Notified passenger that you have arrived!", "success");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await emitWhenConnectedRef.current('driverArrived', { rideId }, 'ride');
    } catch (error) {
      console.error('[handleDriverArrivedAction] Error:', error);
      showToast("Failed to send arrival notification", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleStartRide = async () => {
    if (userRole !== 'driver') {
      console.log('[handleStartRide] Not driver, skipping');
      return;
    }
    setLoading(true);
    try {
      console.log('[handleStartRide] Starting ride, rideId:', rideId);
      
      // Set progress to 0% - backend will handle progress calculation
      setProgress(0);
      setRideStartTime(Date.now());
      
      // Reset progress tracking
      progressStartedRef.current = false;
      
      // Store the initial driver location to detect movement
      if (driverLocation) {
        initialDriverLocationRef.current = { ...driverLocation };
        console.log('[handleStartRide] Initial driver location:', initialDriverLocationRef.current);
      }
      
      Animated.timing(progressAnimation, {
        toValue: 0,
        duration: 500,
        useNativeDriver: false,
      }).start();
      
      const isMockRide = rideId && rideId.startsWith('mock_');
      if (!isMockRide && !simulating) {
        await emitWhenConnectedRef.current('startRide', { rideId }, 'ride');
      }
      setRideStatus('in-progress');
      rideStartedConfirmedRef.current = true;
      showToast('Ride started!', 'success');
      
      // Keep justStarted true until driver actually moves
      // This ensures progress stays at 0% until real movement occurs
      console.log('[handleStartRide] Progress will stay at 0% until driver moves');
      
      // Send initial location update - backend will calculate progress automatically
      if (driverLocation && !isMockRide && !simulating) {
        try {
          await emitWhenConnectedRef.current('updateRideLocation', {
            latitude: driverLocation.lat,
            longitude: driverLocation.lng
            // No progress needed - backend calculates it!
          }, 'ride');
          console.log('[handleStartRide] Sent initial location update');
        } catch (error: any) {
          console.error('[handleStartRide] Failed to send initial location update:', error);
          // Suppress 400 errors - they might occur if backend hasn't fully processed startRide yet
          if (error.message?.includes('400') || error.message?.includes('Failed to update location6')) {
            console.log('[handleStartRide] Suppressed expected 400 error for initial location update');
          }
        }
      }
      // In handleStartRide, after setting rideStatus to 'in-progress', send a valid location update immediately
      if (userRole === 'driver' && driverLocation && isInKathmandu(driverLocation.lat, driverLocation.lng)) {
        try {
          await emitWhenConnectedRef.current('updateRideLocation', {
            latitude: driverLocation.lat,
            longitude: driverLocation.lng
          }, 'ride');
          console.log('[handleStartRide] Sent initial driver location to backend:', driverLocation);
        } catch (error) {
          console.error('[handleStartRide] Failed to send initial driver location:', error);
        }
      }
      // --- FIX: Immediately send exact pickup location as first update in test mode ---
      if (userRole === 'driver' && USE_TEST_DRIVER_LOCATION && pickupLocation) {
        try {
          await emitWhenConnectedRef.current('updateRideLocation', {
            latitude: pickupLocation.lat,
            longitude: pickupLocation.lng
          }, 'ride');
          console.log('[handleStartRide] Sent exact pickup location as first update');
        } catch (error) {
          console.error('[handleStartRide] Failed to send pickup location:', error);
        }
      }
    } catch (error) {
      console.error('[handleStartRide] Error:', error);
      showToast('Error starting ride', 'error');
      rideStartedConfirmedRef.current = false;
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteRideAction = async () => {
    setLoading(true);
    try {
      const isMock = rideId && rideId.startsWith('mock_');
      if (!isMock) {
        await emitWhenConnectedRef.current('endRide', { rideId }, 'ride');
      }
      setRideStatus('completed');
      showToast('Ride completed!', 'success');
      setTimeout(() => {
        if (isMounted.current) {
          const role = userRole as string;
          router.replace({
            pathname: '/(tabs)/rideRate',
            params: {
              rideId,
              userRole: role,
              passengerName: rideDetails?.passenger?.firstName && rideDetails?.passenger?.lastName 
                ? `${rideDetails.passenger.firstName} ${rideDetails.passenger.lastName}`
                : (rideDetails?.passenger?.firstName || 'Passenger'),
              driverName: rideDetails?.driver?.firstName && rideDetails?.driver?.lastName 
                ? `${rideDetails.driver.firstName} ${rideDetails.driver.lastName}`
                : (rideDetails?.driver?.firstName || 'Driver'),
              from: from || ((rideDetails as any)?.pickUpLocation || 'Pickup Location'),
              to: to || ((rideDetails as any)?.dropOffLocation || 'Dropoff Location'),
              fare: actualFare.toString(),
              vehicle: vehicle || ((rideDetails as any)?.vehicleType?.name || 'Vehicle')
            }
          });
        }
      }, 2000);
    } catch (error) {
      console.error('[handleCompleteRideAction] Error:', error);
      showToast('Error completing ride', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSimulateMovement = async () => {
    const safePickup = pickupLocation || { lat: 27.700769, lng: 85.300140 };
    const safeDropoff = dropoffLocation || { lat: 27.6710, lng: 85.4298 };
    const isMockRide = rideId && rideId.startsWith('mock_');
    simulationFinishedRef.current = false;
    setLoading(true);
    try {
      console.log('[handleSimulateMovement] Starting simulation');
      if (rideStatus !== 'in-progress') {
        await handleStartRide();
      }
      // --- NEW: Immediately send simulated (near-pickup) location to backend and reset completed route ---
      const initialSimLocation = await getTestDriverLocation(safePickup);
      if (initialSimLocation) {
        setDriverLocation(initialSimLocation);
        setCompletedRoute([initialSimLocation]);
        if (!isMockRide && !simulating) {
          emitWhenConnectedRef.current('updateRideLocation', {
            latitude: initialSimLocation.lat,
            longitude: initialSimLocation.lng
          }, 'ride').catch(() => {});
        }
      }
      // --- END NEW ---
      setProgress(0);
      progressStartedRef.current = false;
      Animated.timing(progressAnimation, {
        toValue: 0,
        duration: 500,
        useNativeDriver: false,
      }).start();
      
      setLoading(false); // Disable loading overlay immediately so the map updates visually
      
      await simulateDriverMovement(
        rideId,
        initialSimLocation || driverLocation || safePickup,
        safePickup,
        safeDropoff,
        (location) => {
          setDriverLocation(location);
          setCompletedRoute(prev => {
            const newRoute = [...prev.slice(-100), location];
            return newRoute;
          });
        },
        (progress) => {
          setProgress(progress);
          Animated.timing(progressAnimation, {
            toValue: progress,
            duration: 500,
            useNativeDriver: false,
          }).start();
        },
        setSimulating,
        userRole,
        rideStatusRef,
        rideStartTime,
        mainRoutePolyline
      );
      if (rideStatusRef.current === 'in-progress') {
        setProgress(100);
        Animated.timing(progressAnimation, {
          toValue: 100,
          duration: 500,
          useNativeDriver: false,
        }).start();
        if (!isMockRide && !simulating) {
          await emitWhenConnectedRef.current('endRide', { rideId }, 'ride');
        }
        setRideStatus('completed');
        showToast('Ride completed!', 'success');
        setTimeout(() => {
          if (isMounted.current) {
            const role = userRole as string;
            router.replace({
              pathname: '/(tabs)/rideRate',
              params: {
                rideId,
                userRole: role,
                passengerName: rideDetails?.passenger?.firstName && rideDetails?.passenger?.lastName 
                  ? `${rideDetails.passenger.firstName} ${rideDetails.passenger.lastName}`
                  : (rideDetails?.passenger?.firstName || 'Passenger'),
                driverName: rideDetails?.driver?.firstName && rideDetails?.driver?.lastName 
                  ? `${rideDetails.driver.firstName} ${rideDetails.driver.lastName}`
                  : (rideDetails?.driver?.firstName || 'Driver'),
                from: from || ((rideDetails as any)?.pickUpLocation || 'Pickup Location'),
                to: to || ((rideDetails as any)?.dropOffLocation || 'Dropoff Location'),
                fare: actualFare.toString(),
                vehicle: vehicle || ((rideDetails as any)?.vehicleType?.name || 'Vehicle')
              }
            });
          }
        }, 2000);
      }
    } catch (error) {
      console.error('[handleSimulateMovement] Error:', error);
      showToast('Error during simulation', 'error');
      setSimulating(false);
    } finally {
      setLoading(false);
      simulationFinishedRef.current = true;
    }
  };


  const handleBackButtonPress = () => {
    // Show confirmation modal if ride is in progress or accepted
    if (rideStatus === 'in-progress' || rideStatus === 'accepted') {
      setShowBackConfirmation(true);
    } else if (rideStatus === 'cancelled' || rideStatus === 'searching') {
      // If ride is cancelled or searching, just go back without confirmation
      console.log('[handleBackButtonPress] Ride is cancelled or searching, going back directly');
      locationService.stopLocationTracking();
      webSocketService.disconnect('ride');
      webSocketService.disconnect(userRole);
      router.back();
    } else {
      router.back();
    }
  };

  const handleConfirmBack = () => {
    setShowBackConfirmation(false);
    // Clean up and navigate back
    locationService.stopLocationTracking();
    webSocketService.disconnect('ride');
    webSocketService.disconnect(userRole);
    router.back();
  };

  const handleCancelBack = () => {
    setShowBackConfirmation(false);
  };

  const handleCancelRide = () => {
    setIsCancellationModalVisible(true);
  };

  const handleSelectReason = (index: number) => {
    setSelectedReasonIndex(index);
    if (index === cancellationReasons.length - 1) {
      setCancellationReason('');
    } else {
      setCancellationReason(cancellationReasons[index]);
    }
  };

  const handleConfirmCancelRide = async () => {
    if (!cancellationReason) {
      showToast('Please provide a reason for cancellation.', 'error');
      return;
    }
    
    // Don't allow cancellation if ride is already cancelled
    if ((rideStatus as string) === 'cancelled') {
      showToast('Ride is already cancelled', 'info');
      setIsCancellationModalVisible(false);
      setCancellationReason('');
      setSelectedReasonIndex(null);
      return;
    }
    
    setCancelling(true);
    try {
      console.log('[handleConfirmCancelRide] Cancelling ride, rideId:', rideId, 'reason:', cancellationReason);
      
      // First check if ride is already cancelled or in searching status via REST API
      try {
        const rideDetailsResponse = await rideService.getRideDetails(rideId);
        if (rideDetailsResponse?.status === 'cancelled') {
          console.log('[handleConfirmCancelRide] Ride is already cancelled in backend:', rideDetailsResponse?.status);
          setRideStatus('cancelled');
          showToast('Ride is already cancelled', 'info');
          setIsCancellationModalVisible(false);
          setCancellationReason('');
          setSelectedReasonIndex(null);
          setCancelling(false);
          
          // Clean up and redirect
          setTimeout(() => {
            if (userRole === 'passenger') {
              router.replace('/(tabs)');
            } else {
              router.replace({ pathname: '/(driver)/driverSection', params: { fromRideComplete: 'true' } });
            }
          }, 2000);
          return;
        }
      } catch (error: any) {
        console.log('[handleConfirmCancelRide] Could not check ride status via REST API, proceeding with WebSocket');
      }
      
      const payload = {
        rideId,
        cancellationReason: cancellationReason.trim() || 'Cancelled by user',
        cancelledBy: userRole
      };
      
      // Only try to emit if we have an active WebSocket connection
      if (webSocketService.isSocketConnected('ride')) {
        await emitWhenConnectedRef.current('cancelRide', payload, 'ride');
        showToast('Ride cancelled', 'info');
      } else {
        // If no WebSocket connection, just show message and redirect
        console.log('[handleConfirmCancelRide] No WebSocket connection, ride may already be cancelled');
        showToast('Ride cancelled', 'info');
        setRideStatus('cancelled');
        
        // Clean up and redirect
        setTimeout(() => {
          if (userRole === 'passenger') {
            router.replace('/(tabs)');
          } else {
            router.replace({ pathname: '/(driver)/driverSection', params: { fromRideComplete: 'true' } });
          }
        }, 2000);
      }
    } catch (error: any) {
      console.error('[handleConfirmCancelRide] Error:', error);
      
      // Check if error indicates ride is already cancelled
      const errorMessage = error.message || '';
      if (errorMessage.includes('Ride is no longer active') || errorMessage.includes('Ride is not in cancelable status')) {
        console.log('[handleConfirmCancelRide] Ride is already cancelled or not cancelable');
        setRideStatus('cancelled');
        showToast('Ride is already cancelled', 'info');
        
        // Clean up and redirect
        setTimeout(() => {
          if (userRole === 'passenger') {
            router.replace('/(tabs)');
          } else {
            router.replace({ pathname: '/(driver)/driverSection', params: { fromRideComplete: 'true' } });
          }
        }, 2000);
      } else {
        showToast('Error cancelling ride', 'error');
      }
    } finally {
      setCancelling(false);
      setIsCancellationModalVisible(false);
      setCancellationReason('');
      setSelectedReasonIndex(null);
    }
  };

  const handleCallOtherUser = () => {
    const phone = userRole === 'driver' ? rideDetails?.passenger?.mobile : rideDetails?.driver?.mobile;
    if (!phone) {
      showToast('Phone number not available', 'error');
      return;
    }
    Linking.openURL(`tel:${phone}`);
  };

  const handleMessageOtherUser = () => {
    console.log('[handleMessageOtherUser] Navigating to messaging');
    
    // Clear unread messages indicator when navigating to messaging
    setHasUnreadMessages(false);
    
    // Get actual names from rideDetails instead of params
    const actualDriverName = rideDetails?.driver?.firstName && rideDetails?.driver?.lastName 
      ? `${rideDetails.driver.firstName} ${rideDetails.driver.lastName}`
      : (rideDetails?.driver?.firstName || 'Driver');
    
    const actualPassengerName = rideDetails?.passenger?.firstName && rideDetails?.passenger?.lastName
      ? `${rideDetails.passenger.firstName} ${rideDetails.passenger.lastName}`
      : (rideDetails?.passenger?.firstName || 'Passenger');
    
    router.push({
      pathname: '/(common)/messaging',
      params: {
        rideId,
        driverName: userRole === 'driver' ? 'You' : actualDriverName,
        passengerName: userRole === 'passenger' ? 'You' : actualPassengerName,
        driverPhone: rideDetails?.driver?.mobile || '9815364055',
        passengerPhone: rideDetails?.passenger?.mobile || '9801020304',
        userRole,
      },
    });
  };

  // --- STATUS TEXT/COLOR HELPERS ---
  const getStatusText = () => {
    console.log('[getStatusText] rideStatus:', rideStatus, 'userRole:', userRole);
    switch (rideStatus) {
      case 'accepted':
        return userRole === 'driver' ? 'Ride accepted' : 'Driver accepted';
      case 'in-progress':
        return 'Ride in progress';
      case 'completed':
        return 'Ride completed';
      case 'cancelled':
        return 'Ride cancelled';
      case 'searching':
        return 'Ride cancelled';
      default:
        return 'Unknown status';
    }
  };

  const getStatusColor = () => {
    switch (rideStatus) {
      case 'accepted':
        return '#2196F3';
      case 'in-progress':
        return '#4CAF50';
      case 'completed':
        return '#075B5E';
      case 'cancelled':
        return '#F44336';
      case 'searching':
        return '#F44336';
      default:
        return '#666';
    }
  };

  const showModal = (type: 'success' | 'error' | 'info', title: string, message: string, actionText?: string, onAction?: (() => void)) => {
    setModal({ visible: true, type, title, message, actionText, onAction });
  };
  const hideModal = () => setModal((prev) => ({ ...prev, visible: false }));

  // --- FETCH ROUTE POLYLINES ---
  useEffect(() => {
    const fetchRoute = async () => {
      if (!pickupLocation || !dropoffLocation) {
        setMainRoutePolyline([]);
        return;
      }
      setLoadingRoute(true);
      try {
        const origin = { lat: pickupLocation.lat, lng: pickupLocation.lng };
        const destination = { lat: dropoffLocation.lat, lng: dropoffLocation.lng };
        
        // Check if both locations are within Kathmandu Valley
        const inKathmandu = isInKathmandu(origin.lat, origin.lng) && isInKathmandu(destination.lat, destination.lng);
        if (!inKathmandu) {
          setMainRoutePolyline([]);
          setLoadingRoute(false);
          return;
        }
        
        const route = await locationService.getRouteBetweenPoints(origin, destination);
        const decodePolyline = (encoded: string): { latitude: number; longitude: number }[] => {
          let points = [];
          let index = 0, len = encoded.length;
          let lat = 0, lng = 0;
          while (index < len) {
            let b, shift = 0, result = 0;
            do {
              b = encoded.charCodeAt(index++) - 63;
              result |= (b & 0x1f) << shift;
              shift += 5;
            } while (b >= 0x20);
            let dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
            lat += dlat;
            shift = 0;
            result = 0;
            do {
              b = encoded.charCodeAt(index++) - 63;
              result |= (b & 0x1f) << shift;
              shift += 5;
            } while (b >= 0x20);
            let dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
            lng += dlng;
            points.push({
              latitude: lat / 1e5,
              longitude: lng / 1e5
            });
          }
          return points;
        };
        setMainRoutePolyline(decodePolyline(route.polyline));
      } catch (e) {
        setMainRoutePolyline([]);
      }
      setLoadingRoute(false);
    };
    fetchRoute();
  }, [pickupLocation, dropoffLocation]);

  // --- RENDER ---

  useEffect(() => {
    if (pickupLocation && dropoffLocation) {
      if (!isInKathmandu(pickupLocation.lat, pickupLocation.lng) || !isInKathmandu(dropoffLocation.lat, dropoffLocation.lng)) {
        setPickupLocation(null);
        setDropoffLocation(null);
        setMainRoutePolyline([]);
        showToast('Please select pickup and dropoff within Kathmandu Valley.', 'error');
      }
    }
  }, [pickupLocation, dropoffLocation]);

  // --- TEST DRIVER LOCATION OVERRIDE ---
  useEffect(() => {
    async function maybeSetTestDriverLocation() {
      try {
        if (
          userRole === 'driver' &&
          USE_TEST_DRIVER_LOCATION &&
          pickupLocation &&
          (!driverLocation || calculateDistance(pickupLocation.lat, pickupLocation.lng, driverLocation.lat, driverLocation.lng) > 0.2)
        ) {
          const testLoc = await getTestDriverLocation(pickupLocation);
          if (testLoc) {
            setDriverLocation(testLoc);
            setCompletedRoute([testLoc]);
            // Immediately send simulated location to backend to reset progress and route
            try {
              await emitWhenConnectedRef.current('updateRideLocation', {
                latitude: testLoc.lat,
                longitude: testLoc.lng
              }, 'ride');
              console.log('[TestMode] Sent initial simulated driver location to backend:', testLoc);
            } catch (err) {
              console.error('[TestMode] Failed to send initial simulated driver location:', err);
            }
            console.log('[TestMode] Overriding driverLocation to test location near pickup:', testLoc);
          }
        }
      } catch (error) {
        console.error('[TestMode] Error setting test driver location:', error);
        setErrorMessage('Error setting test driver location');
        setHasError(true);
      }
    }
    maybeSetTestDriverLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userRole, pickupLocation]);

  // --- ENSURE DIRECT SOCKET HANDLER FOR PASSENGER ---
  useEffect(() => {
    if (userRole === 'passenger') {
      const socket = webSocketService.getSocket('ride');
      if (socket) {
        socket.on('rideLocationUpdated', handleRideLocationUpdated);
        console.log('[Debug] Directly attached handleRideLocationUpdated to socket for passenger');
        return () => {
          socket.off('rideLocationUpdated', handleRideLocationUpdated);
        };
      }
    }
    return undefined;
  }, [userRole, handleRideLocationUpdated]);

  // --- ENSURE 0% PROGRESS AT RIDE ACCEPTANCE ---
  useEffect(() => {
    if (userRole === 'driver' && rideStatus === 'accepted' && pickupLocation) {
      // Send exact pickup location as first update to backend
      emitWhenConnectedRef.current('updateRideLocation', {
        latitude: pickupLocation.lat,
        longitude: pickupLocation.lng
      }, 'ride').then(() => {
        console.log('[RideTracker] Sent exact pickup location as first update after ride acceptance');
      }).catch((error) => {
        console.error('[RideTracker] Failed to send pickup location after ride acceptance:', error);
      });
    }
    // No-op for passenger
  }, [rideStatus, userRole, pickupLocation]);

  if (!userRole) {
    console.error('[RideTracker] User role not set');
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>User role not set. Please re-login.</Text>
      </View>
    );
  }

  if (isLoadingDetails) {
    console.log('[RideTracker] Loading ride details');
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}> 
        <ActivityIndicator size="large" color="#075B5E" />
        <Text style={{ marginTop: 10 }}>Loading ride details...</Text>
      </View>
    );
  }

  // Show cancelled ride message
  if (rideStatus === 'cancelled') {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}> 
        <MaterialIcons name="cancel" size={64} color="#F44336" />
        <Text style={{ fontSize: 24, fontWeight: 'bold', marginTop: 20, color: '#F44336' }}>
          Ride Cancelled
        </Text>
        <Text style={{ fontSize: 16, marginTop: 10, textAlign: 'center', paddingHorizontal: 20 }}>
          This ride has been cancelled. You will be redirected to your home screen.
        </Text>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: '#075B5E', marginTop: 30 }]}
          onPress={() => {
            if (userRole === 'passenger') {
              router.replace('/(tabs)');
            } else {
              // For drivers, go to logged-in driver home screen
              router.replace({ pathname: '/(driver)/driverSection', params: { fromRideComplete: 'true' } });
            }
          }}
        >
          <Text style={styles.buttonText}>Go to Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isLoadingDetails && !rideDetails) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#BC001F" />
        <Text style={{ marginTop: 16 }}>Loading ride details...</Text>
      </View>
    );
  }

  if (!pickupLocation || !dropoffLocation) {
    console.error('[RideTracker] Missing pickup or dropoff location');
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text>Missing location data. Please try again.</Text>
      </View>
    );
  }

  const otherUserName = userRole === 'driver'
    ? (rideDetails?.passenger?.firstName && rideDetails?.passenger?.lastName
        ? `${rideDetails.passenger.firstName} ${rideDetails.passenger.lastName}`
        : passengerName)
    : (rideDetails?.driver?.firstName && rideDetails?.driver?.lastName
        ? `${rideDetails.driver.firstName} ${rideDetails.driver.lastName}`
        : driverName);
  const otherUserRole = userRole === 'driver' ? 'passenger' : 'driver';

  // --- PASSENGER VIEW HELPERS ---
  const isBike = vehicle?.toLowerCase().includes('bike') || vehicle?.toLowerCase().includes('motorcycle') || vehicle?.toLowerCase().includes('scooter');
  const vehicleIconName = isBike ? 'motorcycle' : 'directions-car';
  const getFormattedVehicleName = () => {
    const make = (rideDetails as any)?.driverProfile?.vehicleMake || '';
    const color = (rideDetails as any)?.driverProfile?.vehicleColor || '';
    const model = (rideDetails as any)?.driverProfile?.vehicleModel || '';
    
    if (!make && !model) {
      return vehicle || (isBike ? 'Red Honda Splendor' : 'White Suzuki Cultus');
    }
    
    if (model.toLowerCase().includes(make.toLowerCase()) && model.toLowerCase().includes(color.toLowerCase())) {
      return model;
    }
    
    if (model.toLowerCase().includes(make.toLowerCase())) {
      return `${color} ${model}`.trim();
    }
    
    return `${color} ${make} ${model}`.trim();
  };
  const vehicleNameFormatted = getFormattedVehicleName();
  const vehicleRegNum = (rideDetails as any)?.driverProfile?.vehicleRegNum || 'LF-638';
  const driverRating = (rideDetails as any)?.driverProfile?.rating || '4.77';
  const driverFirstName = otherUserName ? otherUserName.split(' ')[0] : 'Driver';

  const formatEtaTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleComingButtonPress = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showToast("Ok, notified driver you are coming!", "success");
    await emitWhenConnectedRef.current('passengerComing', { rideId }, 'ride');
  };

  const handleSafetyPress = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    showToast("Emergency safety feature triggered. Help is on the way.", "error");
  };

  const handleCallPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const phone = userRole === 'driver'
      ? (rideDetails?.passenger?.mobile || passengerMobile || '')
      : (rideDetails?.driver?.mobile || (rideDetails as any)?.driverProfile?.mobile || '+977-9841234567');
    
    const cleanPhone = phone.replace(/[^0-9+]/g, '') || '+977-9841234567';
    Linking.openURL(`tel:${cleanPhone}`).catch(() => {
      showToast(`Calling ${otherUserName || 'Driver'}...`, 'info');
    });
  };

  return (
    <ErrorBoundary>
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#075B5E" />
        <View style={styles.mapContainer}>
          {rideStatus !== 'completed' && rideStatus !== 'cancelled' && (
            <TouchableOpacity style={styles.backButton} onPress={handleBackButtonPress}>
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
          )}


          
          {userRole === 'passenger' && USE_TEST_DRIVER_LOCATION && (
            <View style={styles.devControlsContainer}>
              <Text style={{ fontSize: 9, fontWeight: '800', color: '#6B7280', marginBottom: 4, letterSpacing: 0.5 }}>SIMULATE DRIVER</Text>
              {!driverArrived && rideStatus === 'accepted' && (
                <TouchableOpacity 
                  style={[styles.devButton, { backgroundColor: '#FF9800' }]} 
                  onPress={async () => {
                    setDriverArrived(true);
                    await emitWhenConnectedRef.current('driverArrived', { rideId }, 'ride');
                    showToast("Simulated driver arrival", "info");
                  }}
                >
                  <Text style={styles.devButtonText}>Arrive</Text>
                </TouchableOpacity>
              )}
              {driverArrived && rideStatus === 'accepted' && (
                <TouchableOpacity 
                  style={[styles.devButton, { backgroundColor: '#4CAF50' }]} 
                  onPress={async () => {
                    // 1. Start the ride locally and emit to socket asynchronously (non-blocking)
                    setRideStatus('in-progress');
                    rideStartedConfirmedRef.current = true;
                    if (rideId && !rideId.startsWith('mock_')) {
                      emitWhenConnectedRef.current('startRide', { rideId }, 'ride').catch(() => {});
                    }

                    // 2. Start simulation movement immediately
                    setSimulating(true);
                    showToast("Ride started! Driving to destination...", "success");
                    
                    const initialSimLocation = await getTestDriverLocation(pickupLocation);
                    const startLoc = initialSimLocation || driverLocation || pickupLocation;
                    
                    setProgress(0);
                    Animated.timing(progressAnimation, { toValue: 0, duration: 0, useNativeDriver: false }).start();
                    
                    await simulateDriverMovement(
                      rideId,
                      startLoc,
                      pickupLocation,
                      dropoffLocation,
                      (location) => {
                        setDriverLocation(location);
                        setCompletedRoute(prev => [...prev.slice(-100), location]);
                      },
                      (progressVal) => {
                        setProgress(progressVal);
                        Animated.timing(progressAnimation, {
                          toValue: progressVal,
                          duration: 500,
                          useNativeDriver: false,
                        }).start();
                      },
                      setSimulating,
                      userRole,
                      rideStatusRef,
                      rideStartTime
                    );
                    
                    // Reached dropoff! Complete ride locally and transition to rating screen
                    setRideStatus('completed');
                    showToast('Ride completed!', 'success');
                    
                    setTimeout(() => {
                      const role = userRole as string;
                      router.replace({
                        pathname: '/(tabs)/rideRate',
                        params: {
                          rideId,
                          userRole: role,
                        },
                      });
                    }, 1500);
                  }}
                >
                  <Text style={styles.devButtonText}>Move Trip</Text>
                </TouchableOpacity>
              )}
              {rideStatus === 'in-progress' && !simulating && (
                <TouchableOpacity 
                  style={styles.devButton} 
                  onPress={async () => {
                    setSimulating(true);
                    showToast("Starting simulated driver movement...", "info");
                    
                    const initialSimLocation = await getTestDriverLocation(pickupLocation);
                    if (initialSimLocation) {
                      setProgress(0);
                      Animated.timing(progressAnimation, { toValue: 0, duration: 0, useNativeDriver: false }).start();
                      
                      await simulateDriverMovement(
                        rideId,
                        initialSimLocation || driverLocation,
                        pickupLocation,
                        dropoffLocation,
                        (location) => {
                          setDriverLocation(location);
                          setCompletedRoute(prev => [...prev.slice(-100), location]);
                        },
                        (progressVal) => {
                          setProgress(progressVal);
                          Animated.timing(progressAnimation, {
                            toValue: progressVal,
                            duration: 500,
                            useNativeDriver: false,
                          }).start();
                        },
                        setSimulating,
                        'driver',
                        rideStatusRef,
                        rideStartTime,
                        mainRoutePolyline
                      );
                      
                      // Reached dropoff! Complete ride locally and transition to rating screen
                      setRideStatus('completed');
                      showToast('Ride completed!', 'success');
                      
                      setTimeout(() => {
                        const role = userRole as string;
                        router.replace({
                          pathname: '/(tabs)/rideRate',
                          params: {
                            rideId,
                            userRole: role,
                          },
                        });
                      }, 1500);
                    }
                  }}
                >
                  <Text style={styles.devButtonText}>Move Trip</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          
          <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={styles.map}
            initialRegion={{
              latitude: pickupLocation?.lat || 27.7172,
              longitude: pickupLocation?.lng || 85.3240,
              latitudeDelta: 0.0922,
              longitudeDelta: 0.0421,
            }}
            region={
              driverLocation
                ? {
                    latitude: driverLocation.lat,
                    longitude: driverLocation.lng,
                    latitudeDelta: 0.0922,
                    longitudeDelta: 0.0421,
                  }
                : undefined
            }
            showsUserLocation={true}
            showsMyLocationButton={false}
            showsCompass={true}
            showsScale={true}
            showsTraffic={false}
            showsBuildings={true}
            showsIndoors={true}
            loadingEnabled={true}
            loadingIndicatorColor="#075B5E"
            loadingBackgroundColor="#ffffff"
          >
          {/* Pickup Location Marker */}
          {pickupLocation && (
            <Marker
              coordinate={{
                latitude: pickupLocation.lat,
                longitude: pickupLocation.lng,
              }}
              title={driverArrived ? "Driver Arrived at Pickup" : "Pickup Location"}
              description={driverArrived ? "Driver is at pickup point" : "Pickup point"}
              pinColor={driverArrived ? "#BC001F" : "#4CAF50"}
            >
              <View style={{ backgroundColor: driverArrived ? '#BC001F' : '#4CAF50', borderRadius: 20, padding: 8, borderWidth: 2, borderColor: '#fff' }}>
                <MaterialIcons name={driverArrived ? "check-circle" : "location-on"} size={20} color="#fff" />
              </View>
            </Marker>
          )}

          {/* Dropoff Location Marker */}
          {dropoffLocation && (
            <Marker
              coordinate={{
                latitude: dropoffLocation.lat,
                longitude: dropoffLocation.lng,
              }}
              title="Dropoff Location"
              description="Dropoff point"
              pinColor="#EA2F14"
            >
              <View style={{ backgroundColor: '#F44336', borderRadius: 20, padding: 8, borderWidth: 2, borderColor: '#fff' }}>
                <MaterialIcons name="location-on" size={20} color="#fff" />
              </View>
            </Marker>
          )}

          {/* Driver Location Marker */}
          {driverLocation && (
            <Marker
              coordinate={{
                latitude: driverLocation.lat,
                longitude: driverLocation.lng,
              }}
              title="Driver Location"
              description="Current driver position"
              pinColor="#2196F3"
            >
              <Animated.View 
                style={{ 
                  backgroundColor: '#2196F3', 
                  borderRadius: 20, 
                  padding: 8, 
                  borderWidth: 2, 
                  borderColor: '#fff',
                  transform: [{ scale: pulseAnimation }]
                }}
              >
                <MaterialIcons name="directions-car" size={20} color="#fff" />
              </Animated.View>
            </Marker>
          )}

          {/* Route Polylines */}
          {mainRoutePolyline.length > 0 && driverLocation && pickupLocation && dropoffLocation ? (
            <>
              {/* Completed Route (solid green) - REMOVED as requested */}
              {/* {completedRoute.length > 1 && pickupLocation && dropoffLocation && (() => {
                // Find the index in completedRoute where the driver reaches the pickup location
                const pickupIdx = completedRoute.findIndex(point =>
                  Math.abs(point.lat - pickupLocation.lat) < 0.0005 && Math.abs(point.lng - pickupLocation.lng) < 0.0005
                );
                // Only show the completed route after pickup
                if (pickupIdx > 0 && pickupIdx < completedRoute.length - 1) {
                  return (
                    <Polyline
                      coordinates={completedRoute.slice(pickupIdx).map(point => ({ latitude: point.lat, longitude: point.lng }))}
                      strokeColor="#4CAF50"
                      strokeWidth={6}
                      zIndex={2}
                    />
                  );
                }
                return null;
              })()} */}
              {/* Pickup to Dropoff (solid blue) */}
              {findClosestPointIndex(mainRoutePolyline, pickupLocation) < findClosestPointIndex(mainRoutePolyline, dropoffLocation) && (
                <Polyline
                  coordinates={mainRoutePolyline.slice(findClosestPointIndex(mainRoutePolyline, pickupLocation), findClosestPointIndex(mainRoutePolyline, dropoffLocation) + 1)}
                  strokeColor="#2196F3"
                  strokeWidth={4}
                  zIndex={1}
                />
              )}
            </>
          ) : null}
        </MapView>
        
        {/* Route not available text overlay */}
        {(!mainRoutePolyline.length || !driverLocation || !pickupLocation || !dropoffLocation) && (
          <View style={styles.routeNotAvailableOverlay}>
            <Text style={styles.routeNotAvailableText}>Route not available</Text>
          </View>
        )}

        {/* Floating Navigate Action for Driver */}
        {userRole === 'driver' && (
          <View style={styles.floatingNavigateContainer}>
            <TouchableOpacity
              style={styles.floatingNavigateButton}
              onPress={() => {
                const targetLoc = driverArrived ? dropoffLocation : pickupLocation;
                if (targetLoc) {
                  const url = `https://www.google.com/maps/dir/?api=1&destination=${targetLoc.lat},${targetLoc.lng}`;
                  Linking.openURL(url).catch(() => showToast('Could not open map navigation', 'error'));
                }
              }}
              activeOpacity={0.9}
            >
              <MaterialIcons name="near-me" size={20} color="#BC001F" style={{ marginRight: 6 }} />
              <Text style={styles.floatingNavigateText}>Navigate</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      <View style={styles.bottomSheet}>
        {userRole === 'passenger' ? (
          <ScrollView
            style={styles.passengerSheetScroll}
            contentContainerStyle={styles.passengerSheetContent}
            showsVerticalScrollIndicator={false}
          >
            {/* 1. Header Row: Ride Progress Title + Bold Primary Red Percentage */}
            <View style={styles.vvHeaderRow}>
              <Text style={styles.vvHeaderTitle}>Ride Progress</Text>
              <Text style={styles.vvHeaderPercent}>{Math.round(progress)}%</Text>
            </View>

            {/* 2. Sleek Red Progress Bar */}
            <View style={styles.vvProgressTrack}>
              <Animated.View
                style={[
                  styles.vvProgressFill,
                  {
                    width: progressAnimation.interpolate({
                      inputRange: [0, 100],
                      outputRange: ['0%', '100%'],
                    }),
                  },
                ]}
              />
            </View>

            {/* 3. Subtitle / ETA status */}
            <View style={styles.vvSubRow}>
              <MaterialIcons name="access-time" size={16} color="#5B403F" style={{ marginRight: 6 }} />
              <Text style={styles.vvSubText}>
                {rideStatus === 'accepted'
                  ? (driverArrived ? 'Driver has arrived at pickup' : `Arriving in approx. ${Math.max(1, Math.ceil((etaSeconds || 480) / 60))} mins`)
                  : (progress >= 100 ? 'Arrived at destination' : `Arriving in approx. ${Math.max(1, Math.ceil((100 - progress) * 0.15))} mins`)}
              </Text>
            </View>

            {/* 4. Driver Info Card (#F3F4F5 rounded container) */}
            <View style={styles.vvDriverCard}>
              <View style={styles.vvAvatarContainer}>
                <MaterialIcons name="person" size={32} color="#485F84" />
                <View style={styles.vvVerifiedBadge}>
                  <MaterialIcons name="check-circle" size={14} color="#0066FF" />
                </View>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={styles.vvDriverName}>{driverFirstName || 'Purna Shah'}</Text>
                  <View style={styles.vvRatingBadge}>
                    <MaterialIcons name="star-outline" size={14} color="#B7102A" />
                    <Text style={styles.vvRatingText}>{driverRating || '4.9'}</Text>
                  </View>
                </View>
                <Text style={styles.vvVehicleDetails}>
                  {vehicleNameFormatted || 'White Suzuki Alto'} • {vehicleRegNum || 'BA 2 PA 1234'}
                </Text>
              </View>
            </View>

            {/* 5. Pickup & Dropoff Route Section */}
            <View style={styles.vvRouteContainer}>
              <View style={styles.vvRouteItem}>
                <MaterialIcons name="my-location" size={20} color="#286182" style={{ marginRight: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.vvRouteLabel}>Pickup</Text>
                  <Text style={styles.vvRouteAddress} numberOfLines={1}>
                    {from || 'Kathmandu Durbar Square'}
                  </Text>
                </View>
              </View>

              <View style={styles.vvRouteConnectorLine} />

              <View style={styles.vvRouteItem}>
                <MaterialIcons name="location-on" size={20} color="#B7102A" style={{ marginRight: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.vvRouteLabel}>Dropoff</Text>
                  <Text style={styles.vvRouteAddress} numberOfLines={1}>
                    {to || 'Patan Museum, Lalitpur'}
                  </Text>
                </View>
              </View>
            </View>

            {/* 6. Fare & Cash Payment Row */}
            <View style={styles.vvFareRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <MaterialIcons name="account-balance-wallet" size={22} color="#191C1D" style={{ marginRight: 10 }} />
                <Text style={styles.vvFareText}>Fare: रू {parseFloat(actualFare).toFixed(0)}</Text>
              </View>
              <View style={styles.vvCashBadge}>
                <Text style={styles.vvCashBadgeText}>Cash</Text>
              </View>
            </View>

            {/* 7. Action Buttons (Call / Message + Cancel Ride) */}
            <View style={styles.vvActionRow}>
              <TouchableOpacity
                style={styles.vvCallButton}
                onPress={handleCallPress}
                activeOpacity={0.85}
              >
                <MaterialIcons name="call" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.vvCallButtonText}>Call</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.vvMessageButton}
                onPress={handleMessageOtherUser}
                activeOpacity={0.85}
              >
                <MaterialIcons name="chat-bubble-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.vvMessageButtonText}>Message</Text>
              </TouchableOpacity>
            </View>

            {(rideStatus === 'accepted' || rideStatus === 'in-progress') && (
              <TouchableOpacity
                style={styles.vvCancelOutlineButton}
                onPress={handleCancelRide}
                disabled={cancelling}
                activeOpacity={0.85}
              >
                <MaterialIcons name="cancel" size={20} color="#B7102A" style={{ marginRight: 8 }} />
                <Text style={styles.vvCancelOutlineText}>Cancel Ride</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        ) : (
          <ScrollView
            style={styles.passengerSheetScroll}
            contentContainerStyle={styles.passengerSheetContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Drag Handle Pill */}
            <View style={styles.sheetDragHandle} />

            {/* Passenger Info & Fare Header Card */}
            <View style={styles.driverPassengerCard}>
              <View style={styles.vvAvatarContainer}>
                <MaterialIcons name="person" size={32} color="#485F84" />
                <View style={styles.vvVerifiedBadge}>
                  <MaterialIcons name="check-circle" size={14} color="#BC001F" />
                </View>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={styles.driverPassengerName}>{otherUserName || 'Purna Shah'}</Text>
                  <Text style={styles.driverFareText}>NPR {parseFloat(actualFare).toFixed(0)}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                  <View style={styles.driverRatingRow}>
                    <MaterialIcons name="star" size={14} color="#5F5E5E" />
                    <Text style={styles.driverRatingText}>4.9 • 124 Rides</Text>
                  </View>
                  <View style={styles.driverCategoryBadge}>
                    <Text style={styles.driverCategoryBadgeText}>{vehicle || 'Taxi Economy'}</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Driver Arrived Status Card (Arrival Confirmation UI) */}
            {driverArrived && (
              <View style={styles.arrivedStatusCard}>
                <View style={styles.arrivedIconContainer}>
                  <MaterialIcons name="check-circle" size={24} color="#BC001F" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.arrivedStatusTitle}>Driver Arrived at Pickup</Text>
                  <Text style={styles.arrivedStatusSubtext}>
                    Waiting for passenger to board. Press Start Ride when ready.
                  </Text>
                </View>
              </View>
            )}

            {/* Divider */}
            <View style={styles.sheetDivider} />

            {/* Route Details Timeline */}
            <View style={styles.vvRouteContainer}>
              <View style={styles.vvRouteItem}>
                <View style={styles.pickupDotOuter}>
                  <View style={styles.pickupDotInner} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.routeHeaderLabel}>PICKUP</Text>
                  <Text style={styles.vvRouteAddress} numberOfLines={1}>
                    {from || 'Kathmandu, Nepal'}
                  </Text>
                </View>
              </View>

              <View style={styles.routeConnectorDashed} />

              <View style={styles.vvRouteItem}>
                <View style={styles.dropoffSquareOuter}>
                  <View style={styles.dropoffSquareInner} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.routeHeaderLabel}>DROP-OFF</Text>
                  <Text style={styles.vvRouteAddress} numberOfLines={1}>
                    {to || 'Lalitpur, Nepal'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Ride Progress Bar */}
            <View style={{ marginVertical: 12 }}>
              <View style={styles.vvHeaderRow}>
                <Text style={styles.routeHeaderLabel}>RIDE PROGRESS</Text>
                <Text style={styles.vvHeaderPercent}>{Math.round(progress)}%</Text>
              </View>
              <View style={styles.vvProgressTrack}>
                <Animated.View
                  style={[
                    styles.vvProgressFill,
                    {
                      width: progressAnimation.interpolate({
                        inputRange: [0, 100],
                        outputRange: ['0%', '100%'],
                      }),
                    },
                  ]}
                />
              </View>
            </View>

            {/* Communication Actions (Call / Message) */}
            <View style={styles.driverCommRow}>
              <TouchableOpacity
                style={styles.driverCommButton}
                onPress={handleCallPress}
                activeOpacity={0.85}
              >
                <MaterialIcons name="call" size={20} color="#1A1B1F" style={{ marginRight: 8 }} />
                <Text style={styles.driverCommButtonText}>Call</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.driverCommButton}
                onPress={handleMessageOtherUser}
                activeOpacity={0.85}
              >
                <MaterialIcons name="chat" size={20} color="#1A1B1F" style={{ marginRight: 8 }} />
                <Text style={styles.driverCommButtonText}>Message</Text>
              </TouchableOpacity>
            </View>

            {/* Primary Action Buttons (Arrived / Start / Complete) */}
            {rideStatus === 'accepted' && !driverArrived && (
              <TouchableOpacity
                style={styles.primaryRedCTA}
                onPress={handleDriverArrivedAction}
                disabled={loading}
                activeOpacity={0.9}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryRedCTAText}>Arrived at Pickup</Text>
                )}
              </TouchableOpacity>
            )}

            {rideStatus === 'accepted' && driverArrived && (
              <TouchableOpacity
                style={styles.primaryRedCTA}
                onPress={handleStartRide}
                disabled={loading}
                activeOpacity={0.9}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryRedCTAText}>Start Ride</Text>
                )}
              </TouchableOpacity>
            )}

            {rideStatus === 'in-progress' && (
              <TouchableOpacity
                style={styles.primaryRedCTA}
                onPress={handleCompleteRideAction}
                disabled={loading}
                activeOpacity={0.9}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryRedCTAText}>Complete Ride</Text>
                )}
              </TouchableOpacity>
            )}

            {/* Secondary Cancel Ride Action */}
            <TouchableOpacity
              style={styles.secondaryCancelCTA}
              onPress={handleCancelRide}
              disabled={cancelling}
              activeOpacity={0.85}
            >
              <Text style={styles.secondaryCancelCTAText}>Cancel Ride</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>

      <Toast visible={toast.visible} message={toast.message} type={toast.type} onHide={hideToast} />

      {isCancellationModalVisible && (
      <Modal
          visible={true}
        animationType="fade"
        transparent={true}
        onRequestClose={() => {
          setIsCancellationModalVisible(false);
          setCancellationReason('');
          setSelectedReasonIndex(null);
        }}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, paddingVertical: 20, paddingHorizontal: 16, width: '100%', maxWidth: 340, alignItems: 'center', borderWidth: 1, borderColor: '#F3F4F6', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 12, elevation: 5 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827', textAlign: 'center', marginBottom: 4 }}>Cancel Ride</Text>
            <Text style={{ fontSize: 13, color: '#6B7280', textAlign: 'center', marginBottom: 16 }}>Please select a reason for cancellation:</Text>
            
            <View style={{ width: '100%', maxHeight: 280 }}>
              <ScrollView style={{ width: '100%' }} showsVerticalScrollIndicator={true} nestedScrollEnabled={true}>
                {cancellationReasons.map((reason, index) => {
                  const isSelected = selectedReasonIndex === index;
                  return (
                    <TouchableOpacity
                      key={index}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        width: '100%',
                        paddingVertical: 12,
                        paddingHorizontal: 12,
                        borderWidth: 1,
                        borderColor: isSelected ? '#075B5E' : '#E5E7EB',
                        borderRadius: 8,
                        marginBottom: 8,
                        backgroundColor: isSelected ? '#F0F7F7' : '#FFF',
                      }}
                      onPress={() => handleSelectReason(index)}
                    >
                      <View style={{
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        borderWidth: 2,
                        borderColor: isSelected ? '#075B5E' : '#D1D5DB',
                        marginRight: 10,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        {isSelected && (
                          <View style={{
                            width: 10,
                            height: 10,
                            borderRadius: 5,
                            backgroundColor: '#075B5E',
                          }} />
                        )}
                      </View>
                      <Text style={{
                        fontSize: 14,
                        color: isSelected ? '#075B5E' : '#374151',
                        fontWeight: isSelected ? '600' : '400',
                        flex: 1,
                      }} numberOfLines={2}>
                        {reason}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {selectedReasonIndex === cancellationReasons.length - 1 && (
              <TextInput
                style={{
                  width: '100%',
                  minHeight: 60,
                  borderWidth: 1,
                  borderColor: '#075B5E',
                  borderRadius: 8,
                  padding: 10,
                  fontSize: 14,
                  color: '#374151',
                  marginTop: 8,
                  marginBottom: 12,
                  backgroundColor: '#F9FAFB',
                  textAlignVertical: 'top'
                }}
                placeholder="Please specify your reason..."
                multiline
                numberOfLines={3}
                value={cancellationReason}
                onChangeText={setCancellationReason}
              />
            )}

            <View style={{ flexDirection: 'row', gap: 10, width: '100%', justifyContent: 'space-between', marginTop: 12 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 8,
                  backgroundColor: '#F3F4F6',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                onPress={() => {
                  setIsCancellationModalVisible(false);
                  setCancellationReason('');
                  setSelectedReasonIndex(null);
                }}
              >
                <Text style={{ color: '#4B5563', fontSize: 15, fontWeight: '600' }}>Back</Text>
              </TouchableOpacity>
              
              {(() => {
                const isConfirmDisabled = selectedReasonIndex === null || 
                  (selectedReasonIndex === cancellationReasons.length - 1 && !cancellationReason.trim()) || 
                  cancelling;
                return (
                  <TouchableOpacity
                    style={{
                      flex: 1.5,
                      paddingVertical: 12,
                      borderRadius: 8,
                      backgroundColor: isConfirmDisabled ? '#FCA5A5' : '#EF4444',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    onPress={handleConfirmCancelRide}
                    disabled={isConfirmDisabled}
                  >
                    {cancelling ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>Confirm Cancel</Text>
                    )}
                  </TouchableOpacity>
                );
              })()}
            </View>
          </View>
        </View>
      </Modal>
      )}

      {/* Back Confirmation Modal */}
      <ConfirmationModal
        visible={showBackConfirmation}
        title="Leave Ride?"
        message="Are you sure you want to leave this ride?"
        confirmText="Leave"
        cancelText="Stay"
        onConfirm={handleConfirmBack}
        onCancel={handleCancelBack}
        type="warning"
      />

      <AppModal
        visible={modal.visible}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        onClose={hideModal}
        actionText={modal.actionText}
        onAction={modal.onAction}
      />
    </View>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  backButton: {
    position: 'absolute',
    top: 40,
    left: 20,
    zIndex: 10,
    backgroundColor: '#075B5E',
    borderRadius: 20,
    padding: 8,
  },
  simulateButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    zIndex: 10,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#075B5E',
  },
  simulateButtonText: {
    color: '#075B5E',
    marginLeft: 4,
    fontWeight: '600',
  },
  bottomSheet: {
    flex: 1,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  progressContainer: {
    marginBottom: 20,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  progressTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
  },
  progressBar: {
    height: 10,
    backgroundColor: '#e0e0e0',
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#075B5E',
  },
  progressText: {
    marginTop: 8,
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
  },
  detailsContainer: {
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  detailText: {
    fontSize: 16,
    color: '#333',
    marginLeft: 8,
    flex: 1,
  },
  buttonContainer: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  button: {
    width: '96%',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  contactButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 10,
  },
  contactButton: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginHorizontal: 5,
  },
  contactButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  driverMarker: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 5,
    borderWidth: 1,
    borderColor: '#FF9800',
  },
  pickupMarker: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 5,
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  dropoffMarker: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 5,
    borderWidth: 1,
    borderColor: '#EA2F14',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    width: '80%',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  modalInput: {
    width: '100%',
    height: 100,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 20,
    textAlignVertical: 'top',
  },
  modalButton: {
    width: '100%',
    padding: 12,
    backgroundColor: '#075B5E',
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  modalMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: 10,
  },
  modalButtonCancel: {
    backgroundColor: '#666',
    flex: 1,
  },
  modalButtonConfirm: {
    backgroundColor: '#F44336',
    flex: 1,
  },
  modalButtonCancelText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtonConfirmText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  routeNotAvailableOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  routeNotAvailableText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#F44336',
    textAlign: 'center',
  },
  // Vibrant Velocity Design System Styles
  vvHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 4,
  },
  vvHeaderTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#191C1D',
  },
  vvHeaderPercent: {
    fontSize: 32,
    fontWeight: '800',
    color: '#B7102A',
    letterSpacing: -1,
  },
  vvProgressTrack: {
    width: '100%',
    height: 8,
    backgroundColor: '#E7E8E9',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  vvProgressFill: {
    height: '100%',
    backgroundColor: '#B7102A',
    borderRadius: 4,
  },
  vvSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  vvSubText: {
    fontSize: 14,
    color: '#5B403F',
    fontWeight: '500',
  },
  vvDriverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F5',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  vvAvatarContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#E1E3E4',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  vvVerifiedBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
  },
  vvDriverName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#191C1D',
  },
  vvRatingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E7E8E9',
  },
  vvRatingText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#191C1D',
    marginLeft: 3,
  },
  vvVehicleDetails: {
    fontSize: 13,
    color: '#5B403F',
    marginTop: 3,
  },
  vvRouteContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 12,
    marginBottom: 16,
  },
  vvRouteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  vvRouteLabel: {
    fontSize: 11,
    color: '#8F6F6E',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  vvRouteAddress: {
    fontSize: 15,
    fontWeight: '600',
    color: '#191C1D',
    marginTop: 2,
  },
  vvRouteConnectorLine: {
    width: 2,
    height: 18,
    backgroundColor: '#E4BEBC',
    marginLeft: 9,
    marginVertical: 2,
  },
  vvFareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E7E8E9',
    marginBottom: 16,
  },
  vvFareText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#191C1D',
  },
  vvCashBadge: {
    backgroundColor: '#BBD3FD',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  vvCashBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#445A7F',
  },
  vvActionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  vvCallButton: {
    flex: 1,
    height: 48,
    backgroundColor: '#485F84',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#485F84',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  vvCallButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  vvMessageButton: {
    flex: 1,
    height: 48,
    backgroundColor: '#445A7F',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#445A7F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  vvMessageButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  vvCancelOutlineButton: {
    width: '100%',
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#B7102A',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  vvCancelOutlineText: {
    color: '#B7102A',
    fontSize: 16,
    fontWeight: '700',
  },
  unreadBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    backgroundColor: '#FF4444',
    borderRadius: 6,
    width: 12,
    height: 12,
    borderWidth: 2,
    borderColor: '#fff',
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  passengerSheetScroll: {
    flex: 1,
    backgroundColor: '#fff',
  },
  passengerSheetContent: {
    paddingBottom: 24,
  },
  passengerHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  passengerHeaderTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  passengerTitleText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  passengerVehicleText: {
    fontSize: 15,
    color: '#666',
  },
  passengerVehicleRight: {
    alignItems: 'center',
  },
  passengerVehicleIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F0F7F7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  passengerPlateBadge: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  passengerPlateText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
  },
  passengerEtaCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1.5,
    borderColor: '#E8F5F5',
    shadowColor: '#075B5E',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  passengerEtaInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  passengerEtaLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#9CA3AF',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  passengerEtaTime: {
    fontSize: 34,
    fontWeight: '800',
    color: '#075B5E',
  },
  passengerEtaVisualContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F7F7',
    borderRadius: 12,
    padding: 10,
    width: 100,
  },
  passengerEtaVisualText: {
    fontSize: 10,
    color: '#075B5E',
    fontWeight: '700',
    marginTop: 4,
    textAlign: 'center',
  },
  passengerComingButton: {
    backgroundColor: '#075B5E',
    borderRadius: 24,
    paddingVertical: 12,
    alignItems: 'center',
    shadowColor: '#075B5E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 2,
  },
  passengerComingButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  passengerActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginVertical: 14,
  },
  passengerActionItem: {
    alignItems: 'center',
    width: 90,
  },
  passengerAvatarWrapper: {
    position: 'relative',
    marginBottom: 8,
  },
  passengerAvatarContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#E8F5F5',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#075B5E',
  },
  passengerRatingBadge: {
    position: 'absolute',
    bottom: -4,
    right: -10,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  passengerRatingText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#333',
  },
  passengerCircleButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  safetyRedDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#FFF5F5',
  },
  passengerActionLabel: {
    fontSize: 13,
    color: '#4B5563',
    fontWeight: '500',
    textAlign: 'center',
  },
  passengerDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginVertical: 14,
  },
  passengerDashedNotesCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F7FCFC',
    borderStyle: 'dashed',
    borderWidth: 1.5,
    borderColor: '#075B5E',
    borderRadius: 12,
    padding: 14,
    marginVertical: 6,
  },
  passengerNotesLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  passengerNotesText: {
    fontSize: 15,
    color: '#374151',
    fontWeight: '600',
    marginLeft: 10,
    flex: 1,
  },
  passengerConsolidatedCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    marginTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  passengerCardDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 14,
  },
  passengerPaymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  passengerPaymentLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '600',
  },
  passengerPaymentContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passengerPaymentValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#075B5E',
  },
  passengerTripContainer: {
    marginTop: 2,
  },
  passengerTripLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '600',
    marginBottom: 12,
  },
  passengerTripRow: {
    flexDirection: 'row',
  },
  passengerTripIndicatorCol: {
    alignItems: 'center',
    width: 20,
    marginRight: 10,
    paddingTop: 5,
  },
  passengerTripDotGreen: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  passengerTripLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 4,
    borderStyle: 'dashed',
  },
  passengerTripDotRed: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  passengerTripAddressCol: {
    flex: 1,
    gap: 10,
  },
  passengerAddressText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  passengerCancelCapsuleButton: {
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    borderRadius: 24,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 24,
  },
  passengerCancelCapsuleText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#EF4444',
  },
  devControlsContainer: {
    position: 'absolute',
    top: 130,
    right: 16,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 9999,
  },
  devButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#075B5E',
  },
  devButtonText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  floatingNavigateContainer: {
    position: 'absolute',
    left: 16,
    bottom: 16,
    zIndex: 99,
  },
  floatingNavigateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1B1F',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  floatingNavigateText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  sheetDragHandle: {
    width: 48,
    height: 5,
    backgroundColor: '#E3E2E7',
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 16,
  },
  driverPassengerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAF8FE',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EFEDF3',
    marginBottom: 12,
  },
  driverPassengerName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1B1F',
  },
  driverFareText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#BC001F',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium',
  },
  driverRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  driverRatingText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5F5E5E',
    marginLeft: 4,
  },
  driverCategoryBadge: {
    backgroundColor: '#E9E7ED',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  driverCategoryBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5F5E5E',
  },
  arrivedStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF5F5',
    borderWidth: 1.5,
    borderColor: '#E6192E',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  arrivedIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFDAD6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrivedStatusTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#BC001F',
    marginBottom: 2,
  },
  arrivedStatusSubtext: {
    fontSize: 13,
    color: '#5D3F3D',
    lineHeight: 18,
  },
  sheetDivider: {
    height: 1,
    backgroundColor: '#E7BCB9',
    opacity: 0.4,
    marginVertical: 12,
  },
  routeHeaderLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#5F5E5E',
    letterSpacing: 1,
  },
  pickupDotOuter: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(188, 0, 31, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickupDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#BC001F',
  },
  dropoffSquareOuter: {
    width: 16,
    height: 16,
    borderRadius: 4,
    backgroundColor: 'rgba(26, 27, 31, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropoffSquareInner: {
    width: 8,
    height: 8,
    borderRadius: 2,
    backgroundColor: '#1A1B1F',
  },
  routeConnectorDashed: {
    width: 1.5,
    height: 24,
    backgroundColor: '#926E6C',
    marginLeft: 7,
    marginVertical: 2,
    opacity: 0.4,
  },
  driverCommRow: {
    flexDirection: 'row',
    gap: 12,
    marginVertical: 14,
  },
  driverCommButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E2DFDE',
    paddingVertical: 14,
    borderRadius: 12,
  },
  driverCommButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1B1F',
  },
  primaryRedCTA: {
    backgroundColor: '#BC001F',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 6,
    shadowColor: '#BC001F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryRedCTAText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  secondaryCancelCTA: {
    backgroundColor: 'transparent',
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(188, 0, 31, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 6,
  },
  secondaryCancelCTAText: {
    color: '#BC001F',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default RideTrackerScreen;