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
} from 'react-native';
import * as Location from 'expo-location';
import { useRouter, useLocalSearchParams, useNavigation } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import Toast from '../../components/ui/Toast';
import ConfirmationModal from '../../components/ui/ConfirmationModal';
import { locationService } from '../utils/locationService';
import webSocketService from '../utils/websocketService';
import { rideService } from '../utils/rideService';
import { getCurrentUserId } from '../utils/apiClient';
import MapView, { Marker, PROVIDER_GOOGLE, Polyline } from 'react-native-maps';
import { useUserRole } from '../utils/userRoleManager';
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

const USE_TEST_DRIVER_LOCATION = true; // Set to false for real GPS tracking(Manual)

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
  if (!mainRoutePolyline || mainRoutePolyline.length === 0) {
    await simulateStraightLineMovement(rideId, startLocation, pickupLocation, dropoffLocation, onLocationUpdate, onProgressUpdate, setSimulating, userRole, rideStatusRef, rideStartTime);
    return;
  }
  const stepDelay = 1000;
  const startIdx = findClosestPointIndex(mainRoutePolyline, startLocation);
  const pickupIdx = findClosestPointIndex(mainRoutePolyline, pickupLocation);
  const dropoffIdx = findClosestPointIndex(mainRoutePolyline, dropoffLocation);
  // Phase 1: Start to Pickup (0-10% progress)
  const phase1Steps = 25;
  for (let i = 0; i <= phase1Steps; i++) {
    if (rideStatusRef.current === 'cancelled' || rideStatusRef.current !== 'in-progress') break;
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
    // Always send simulated location to backend
    if (userRole === 'driver') {
      try {
        await webSocketService.emitEvent(
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
  const phase2Steps = 25;
  for (let i = 0; i <= phase2Steps; i++) {
    if (rideStatusRef.current === 'cancelled' || rideStatusRef.current !== 'in-progress') break;
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
    
    if (userRole === 'driver') {
      try {
        await webSocketService.emitEvent(
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
  console.log('[simulateStraightLineMovement] Using straight line movement');
  setSimulating(true);
  locationService.stopLocationTracking();
  const totalSteps = 50;
  const stepDelay = 1000;

  onLocationUpdate(startLocation);

  // Phase 1: Current location to pickup (0-10%)
  for (let i = 0; i <= totalSteps; i++) {
    if (rideStatusRef.current === 'cancelled' || rideStatusRef.current !== 'in-progress') {
      break;
    }
    const t = i / totalSteps;
    const currentLat = startLocation.lat + (pickupLocation.lat - startLocation.lat) * t;
    const currentLng = startLocation.lng + (pickupLocation.lng - startLocation.lng) * t;
    const location = { lat: currentLat, lng: currentLng };
    
    onLocationUpdate(location);
    const progress = Math.round(t * 10);
    onProgressUpdate(progress);
    
    if (userRole === 'driver' && !USE_TEST_DRIVER_LOCATION) {
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
  for (let i = 0; i <= totalSteps; i++) {
    if (rideStatusRef.current === 'cancelled' || rideStatusRef.current !== 'in-progress') {
      break;
    }
    const t = i / totalSteps;
    const currentLat = pickupLocation.lat + (dropoffLocation.lat - pickupLocation.lat) * t;
    const currentLng = pickupLocation.lng + (dropoffLocation.lng - pickupLocation.lng) * t;
    const location = { lat: currentLat, lng: currentLng };
    
    onLocationUpdate(location);
    const progress = Math.round(10 + t * 90);
    onProgressUpdate(progress);
    
    if (userRole === 'driver' && !USE_TEST_DRIVER_LOCATION) {
      try {
        await webSocketService.emitEvent(
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
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [pickupLocation, setPickupLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [dropoffLocation, setDropoffLocation] = useState<{ lat: number; lng: number } | null>(null);
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

  // --- WEBSOCKET CONNECTION STATUS CHECKER ---
  useEffect(() => {
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;

    const checkWebSocketConnection = async () => {
      // EARLY EXIT: Don't attempt reconnection for cancelled rides or searching rides
      if (rideStatus === 'cancelled' || rideCancelled || rideStatus === 'searching') {
        return;
      }
      
      const isConnected = webSocketService.isSocketConnected('ride');
      setIsWebSocketConnected(isConnected);
      
      if (!isConnected && isComponentActive && reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        
        try {
          // Force disconnect first to ensure clean state
          webSocketService.disconnect('ride');
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
          
          // Try to reconnect
          await ensureSocketConnected(rideId, 'ride');
          reconnectAttempts = 0; // Reset attempts on success
        } catch (error) {
          // Wait longer between attempts
          await new Promise(resolve => setTimeout(resolve, 2000 * reconnectAttempts));
        }
      } else if (isConnected) {
        reconnectAttempts = 0; // Reset attempts when connected
      }
    };

    // Check connection status every 3 seconds
    const interval = setInterval(checkWebSocketConnection, 3000);
    
    // Initial check
    checkWebSocketConnection();

    return () => {
      clearInterval(interval);
      reconnectAttempts = 0;
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
              
              await emitWhenConnectedRef.current('endRide', { rideId }, 'ride');
              setRideStatus('completed');
              setRideStartTime(null);
              showToast('Ride completed!', 'success');
              setTimeout(() => {
                if (isMounted.current) {
                  const role = userRole as string;
                  if (role === 'passenger') {
                    router.push('/(tabs)/rideRate');
                  } else {
                    router.push({ pathname: '/(driver)/driverSection', params: { fromRideComplete: 'true' } });
                  }
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

        // CRITICAL: Only update driver location if test mode is disabled
        // If test mode is enabled, the test location should not be overridden by backend updates
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
    [rideId, userRole, progressAnimation]
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
    console.log('[RideTracker] Initializing rideId:', rideId, 'userRole:', userRole, 'rideStatus:', rideStatus);
    
        const setupWebSocketAndFetch = async () => {
      try {
        setIsLoadingDetails(true);
        
        // EARLY EXIT: If ride is already cancelled, don't setup anything
        if (rideStatus === 'cancelled' || rideCancelled) {
          console.log('[setupWebSocketAndFetch] Ride is cancelled, skipping all setup');
          setRideStatus('cancelled');
          setIsLoadingDetails(false);
          showToast('This ride has been cancelled', 'info');
          setTimeout(() => {
            if (isMounted.current) {
              if (userRole === 'passenger') {
                router.push('/(tabs)');
              } else {
                router.push({ pathname: '/(driver)/driverSection', params: { fromRideComplete: 'true' } });
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
                  router.push('/(tabs)');
                } else {
                  router.push({ pathname: '/(driver)/driverSection', params: { fromRideComplete: 'true' } });
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
          
          // Check if ride is cancelled or in searching status in the backend
          if (details?.status === 'cancelled' || details?.status === 'searching') {
            console.log('[setupWebSocketAndFetch] Ride is cancelled or searching in backend:', details?.status);
            setRideStatus('cancelled');
            setIsLoadingDetails(false);
            showToast('This ride has been cancelled', 'info');
            setTimeout(() => {
              if (isMounted.current) {
                if (userRole === 'passenger') {
                  router.push('/(tabs)');
                } else {
                  router.push({ pathname: '/(driver)/driverSection', params: { fromRideComplete: 'true' } });
                }
              }
            }, 2000);
            return;
          }
          
          if (details?.pickUp?.coords?.coordinates) {
            const pickup = {
              lat: details.pickUp.coords.coordinates[1],
              lng: details.pickUp.coords.coordinates[0],
            };
            setPickupLocation(pickup);
            console.log('[setupWebSocketAndFetch] Set pickupLocation:', pickup);
          } else {
            console.error('[setupWebSocketAndFetch] Missing pickup location in ride details');
          }
          
          if (details?.dropOff?.coords?.coordinates) {
            const dropoff = {
              lat: details.dropOff.coords.coordinates[1],
              lng: details.dropOff.coords.coordinates[0],
            };
            setDropoffLocation(dropoff);
            console.log('[setupWebSocketAndFetch] Set dropoffLocation:', dropoff);
          } else {
            console.error('[setupWebSocketAndFetch] Missing dropoff location in ride details');
          }
          
          // Check if both locations are available in the details
          if (!details?.pickUp?.coords?.coordinates || !details?.dropOff?.coords?.coordinates) {
            console.error('[setupWebSocketAndFetch] Missing pickup or dropoff location in ride details');
            showToast('Failed to load ride locations', 'error');
            setIsLoadingDetails(false);
            return;
          }
          
          if (details?.status === 'ongoing') {
            setRideStatus('in-progress');
            rideStartedConfirmedRef.current = true;
            console.log('[setupWebSocketAndFetch] Set rideStatus to in-progress');
          } else if (details?.status === 'completed') {
            setRideStatus('completed');
            console.log('[setupWebSocketAndFetch] Set rideStatus to completed');
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
      locationService.stopLocationTracking();
      locationTrackingStartedRef.current = false;
      webSocketService.disconnect('ride');
      webSocketService.disconnect(userRole);
      
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
                router.push('/(tabs)');
              } else {
                router.push({ pathname: '/(driver)/driverSection', params: { fromRideComplete: 'true' } });
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
                  router.push('/(tabs)');
                } else {
                  router.push({ pathname: '/(driver)/driverSection', params: { fromRideComplete: 'true' } });
                }
              }
            }, 2000);
          } else if (newStatus === 'completed') {
            setRideStatus('completed');
            showToast('Ride completed!', 'success');
            setTimeout(() => {
              if (isMounted.current) {
                if (userRole === 'passenger') {
                  router.push('/(tabs)/rideRate');
                } else {
                  router.push({ pathname: '/(driver)/driverSection', params: { fromRideComplete: 'true' } });
                }
              }
            }, 2000);
          } else if (newStatus === 'searching') {
            // If ride goes back to searching, it means it was cancelled/reset
            setRideStatus('cancelled');
            showToast('Ride has been cancelled', 'info');
            setTimeout(() => {
              if (isMounted.current) {
                if (userRole === 'passenger') {
                  router.push('/(tabs)');
                } else {
                  router.push({ pathname: '/(driver)/driverSection', params: { fromRideComplete: 'true' } });
                }
              }
            }, 2000);
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
            if (role === 'passenger') {
              router.push({
                pathname: '/(tabs)/rideRate',
                params: {
                  rideId,
                  driverName: rideDetails?.driver?.firstName && rideDetails?.driver?.lastName 
                    ? `${rideDetails.driver.firstName} ${rideDetails.driver.lastName}`
                    : (rideDetails?.driver?.firstName || 'Driver'),
                  from: from || ((rideDetails as any)?.pickUpLocation || 'Pickup Location'),
                  to: to || ((rideDetails as any)?.dropOffLocation || 'Dropoff Location'),
                  fare: actualFare.toString(),
                  vehicle: vehicle || ((rideDetails as any)?.vehicleType?.name || 'Vehicle')
                }
              });
            } else {
              router.push({ pathname: '/(driver)/driverSection', params: { fromRideComplete: 'true' } });
            }
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

    // Set up event listeners
    webSocketService.on('rideCancelled', handleRideCancelled, 'ride');
    webSocketService.on('rideStatusUpdate', handleRideStatusUpdate, 'ride');
    webSocketService.on('rideStarted', handleRideStarted, 'ride');
    webSocketService.on('rideCompleted', handleRideCompleted, 'ride');
    webSocketService.on('rideLocationUpdated', handleRideLocationUpdated, 'ride');
    webSocketService.on('newMessage', handleNewMessage, 'ride');
    webSocketService.on('messageCreated', handleMessageCreated, 'ride');
    
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
      
      await emitWhenConnectedRef.current('startRide', { rideId }, 'ride');
      setRideStatus('in-progress');
      rideStartedConfirmedRef.current = true;
      showToast('Ride started!', 'success');
      
      // Keep justStarted true until driver actually moves
      // This ensures progress stays at 0% until real movement occurs
      console.log('[handleStartRide] Progress will stay at 0% until driver moves');
      
      // Send initial location update - backend will calculate progress automatically
      if (driverLocation) {
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

  const handleSimulateMovement = async () => {
    if (!driverLocation || !pickupLocation || !dropoffLocation) {
      console.error('[handleSimulateMovement] Missing location data');
      showToast('Missing location data for simulation', 'error');
      return;
    }
    setLoading(true);
    try {
      console.log('[handleSimulateMovement] Starting simulation');
      if (rideStatus !== 'in-progress') {
        await handleStartRide();
      }
      // --- NEW: Immediately send simulated (near-pickup) location to backend and reset completed route ---
      const initialSimLocation = await getTestDriverLocation(pickupLocation);
      if (initialSimLocation) {
        setDriverLocation(initialSimLocation);
        setCompletedRoute([initialSimLocation]);
        try {
          await emitWhenConnectedRef.current('updateRideLocation', {
            latitude: initialSimLocation.lat,
            longitude: initialSimLocation.lng
          }, 'ride');
          console.log('[handleSimulateMovement] Sent initial simulated location update to backend:', initialSimLocation);
        } catch (error) {
          console.error('[handleSimulateMovement] Failed to send initial simulated location update:', error);
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
      await simulateDriverMovement(
        rideId,
        initialSimLocation || driverLocation,
        pickupLocation,
        dropoffLocation,
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
        await emitWhenConnectedRef.current('endRide', { rideId }, 'ride');
        setRideStatus('completed');
        showToast('Ride completed!', 'success');
        setTimeout(() => {
          if (isMounted.current) {
            const role = userRole as string;
            if (role === 'passenger') {
              router.push({
                pathname: '/(tabs)/rideRate',
                params: {
                  rideId,
                  driverName: rideDetails?.driver?.firstName && rideDetails?.driver?.lastName 
                    ? `${rideDetails.driver.firstName} ${rideDetails.driver.lastName}`
                    : (rideDetails?.driver?.firstName || 'Driver'),
                  from: from || ((rideDetails as any)?.pickUpLocation || 'Pickup Location'),
                  to: to || ((rideDetails as any)?.dropOffLocation || 'Dropoff Location'),
                  fare: actualFare.toString(),
                  vehicle: vehicle || ((rideDetails as any)?.vehicleType?.name || 'Vehicle')
                }
              });
            } else {
              router.push({ pathname: '/(driver)/driverSection', params: { fromRideComplete: 'true' } });
            }
          }
        }, 2000);
      }
    } catch (error) {
      console.error('[handleSimulateMovement] Error:', error);
      showToast('Error during simulation', 'error');
      setSimulating(false);
    } finally {
      setLoading(false);
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
      return;
    }
    
    setCancelling(true);
    try {
      console.log('[handleConfirmCancelRide] Cancelling ride, rideId:', rideId, 'reason:', cancellationReason);
      
      // First check if ride is already cancelled or in searching status via REST API
      try {
        const rideDetailsResponse = await rideService.getRideDetails(rideId);
        if (rideDetailsResponse?.status === 'cancelled' || rideDetailsResponse?.status === 'searching') {
          console.log('[handleConfirmCancelRide] Ride is already cancelled or searching in backend:', rideDetailsResponse?.status);
          setRideStatus('cancelled');
          showToast('Ride is already cancelled', 'info');
          setIsCancellationModalVisible(false);
          setCancellationReason('');
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
    // No-op cleanup for driver
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

  if (isLoadingDetails) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#075B5E" />
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

  return (
    <ErrorBoundary>
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#075B5E" />
        <View style={styles.mapContainer}>
          <TouchableOpacity style={styles.backButton} onPress={handleBackButtonPress}>
            <MaterialIcons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          {userRole === 'driver' && rideStatus === 'in-progress' && !simulating && (
            <TouchableOpacity style={styles.simulateButton} onPress={handleSimulateMovement}>
              <MaterialIcons name="play-arrow" size={20} color="#075B5E" />
              <Text style={styles.simulateButtonText}>Simulate</Text>
            </TouchableOpacity>
          )}
          {userRole === 'driver' && simulating && (
            <View style={styles.simulateButton}>
              <MaterialIcons name="directions-car" size={20} color="#075B5E" />
              <Text style={styles.simulateButtonText}>Simulating...</Text>
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
              title="Pickup Location"
              description="Pickup point"
              pinColor="#075B5E"
            >
              <View style={{ backgroundColor: '#4CAF50', borderRadius: 20, padding: 8, borderWidth: 2, borderColor: '#fff' }}>
                <MaterialIcons name="location-on" size={20} color="#fff" />
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
      </View>
      <View style={styles.bottomSheet}>
        <View style={styles.progressContainer}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressTitle}>Ride Progress</Text>
            <Text style={[styles.statusText, { color: getStatusColor() }]}>{getStatusText()}</Text>
          </View>
          <View style={styles.progressBar}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  width: progressAnimation.interpolate({
                    inputRange: [0, 100],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
          <Text style={styles.progressText}>{Math.round(progress)}%</Text>
        </View>
        <View style={styles.detailsContainer}>
          <View style={styles.detailRow}>
            <View style={styles.detailItem}>
              <MaterialIcons name="location-on" size={20} color="#4CAF50" />
              <Text style={styles.detailText}>From: {from}</Text>
            </View>
            <View style={styles.detailItem}>
              <MaterialIcons name="location-on" size={20} color="#F44336" />
              <Text style={styles.detailText}>To: {to}</Text>
            </View>
          </View>
          <View style={styles.detailRow}>
            <View style={styles.detailItem}>
              <MaterialIcons name="person" size={20} color="#075B5E" />
              <Text style={styles.detailText}>
                {otherUserRole.charAt(0).toUpperCase() + otherUserRole.slice(1)}: {otherUserName}
              </Text>
            </View>
            <View style={styles.detailItem}>
              <MaterialIcons name="currency-rupee" size={20} color="#d6ab1e" />
              <Text style={styles.detailText}>Fare: रू {parseFloat(actualFare).toFixed(0)}</Text>
            </View>
          </View>
          <View style={styles.detailRow}>
            <View style={styles.detailItem}>
              <MaterialIcons name="directions-car" size={20} color="#075B5E" />
              <Text style={styles.detailText}>Vehicle: {vehicle}</Text>
            </View>
          </View>
        </View>
        <View style={styles.buttonContainer}>
          {userRole === 'driver' && rideStatus === 'accepted' && (
          <TouchableOpacity
              style={[styles.button, { backgroundColor: '#075B5E' }]}
              onPress={handleStartRide}
            disabled={loading}
          >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Start Ride</Text>
              )}
          </TouchableOpacity>
        )}
          <TouchableOpacity
            style={[styles.button, { backgroundColor: '#F44336' }]}
            onPress={handleCancelRide}
            disabled={cancelling}
          >
            <Text style={styles.buttonText}>Cancel Ride</Text>
          </TouchableOpacity>
          

          <View style={styles.contactButtons}>
            <TouchableOpacity
              style={[styles.contactButton, { backgroundColor: '#4CAF50' }]}
              onPress={handleCallOtherUser}
            >
              <MaterialIcons name="phone" size={18} color="#fff" />
              <Text style={styles.contactButtonText}>Call</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.contactButton, { backgroundColor: '#2196F3' }]}
              onPress={handleMessageOtherUser}
            >
              <View style={{ position: 'relative' }}>
                <MaterialIcons name="message" size={18} color="#fff" />
                {hasUnreadMessages && (
                  <Animated.View 
                    style={[
                      styles.unreadBadge,
                      {
                        transform: [{ scale: unreadBadgeAnimation }]
                      }
                    ]}
                  />
                )}
              </View>
              <Text style={styles.contactButtonText}>Message</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      <Toast visible={toast.visible} message={toast.message} type={toast.type} onHide={hideToast} />

      {isCancellationModalVisible && (
      <Modal
          visible={true}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsCancellationModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.18)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 14, paddingVertical: 18, paddingHorizontal: 16, width: '100%', maxWidth: 320, alignItems: 'center', borderWidth: 1, borderColor: '#F3F4F6', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 12, elevation: 4 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: '#222', textAlign: 'center', marginBottom: 6 }}>Cancel Ride</Text>
            <TextInput
              style={{ width: '100%', minHeight: 60, borderWidth: 1, borderColor: '#eee', borderRadius: 8, padding: 10, fontSize: 15, color: '#333', marginBottom: 14, backgroundColor: '#fafbfc' }}
              placeholder="Cancellation reason"
              multiline
              numberOfLines={3}
              value={cancellationReason}
              onChangeText={setCancellationReason}
            />
            <View style={{ flexDirection: 'row', gap: 10, width: '100%', justifyContent: 'flex-end' }}>
              <TouchableOpacity style={{ paddingVertical: 8, paddingHorizontal: 16, borderRadius: 6, backgroundColor: 'transparent', marginRight: 2 }} onPress={() => { setIsCancellationModalVisible(false); setCancellationReason(''); }}>
                <Text style={{ color: '#888', fontSize: 15, fontWeight: '600' }}>Back</Text>
              </TouchableOpacity>
                              <TouchableOpacity style={{ paddingVertical: 8, paddingHorizontal: 18, borderRadius: 6, backgroundColor: '#EF4444' }} onPress={handleConfirmCancelRide} disabled={cancelling}>
                {cancelling ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>Confirm Cancel</Text>
                )}
              </TouchableOpacity>
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
});

export default RideTrackerScreen;