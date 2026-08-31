"use client"

import { useState, useEffect, useRef } from "react"
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, ActivityIndicator, StatusBar, Platform, ScrollView, KeyboardAvoidingView, Animated, PanResponder, Switch, Keyboard, TextInput as RNTextInput } from "react-native"
import { TextInput } from "react-native-paper"
import { Ionicons, MaterialIcons, MaterialIcons as Icon, FontAwesome5 } from '@expo/vector-icons'
import * as Location from 'expo-location'
import { useRouter, useLocalSearchParams } from "expo-router"
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import SidePanel from "../(common)/sidepanel"
import Toast from "../../components/ui/Toast"
import LocationSearch from "../../components/LocationSearch"
import RaiseFareModal from "../../components/ui/RaiseFareModal"
import ProfileImage from "../../components/ProfileImage"
import PostLoginLoadingScreen from "../../components/ui/PostLoginLoadingScreen"
import { locationService, LocationData, GoogleMapsPlace } from '@/services/locationService'
import { rideService, VehicleType, RideRequest } from '@/services/rideService'
import { userRoleManager, useUserRole } from '@/services/userRoleManager'
import MapView, { Marker, PROVIDER_GOOGLE, Polyline } from 'react-native-maps'

const { width, height } = Dimensions.get("window")

const PassengerHomeScreen = () => {
  const insets = useSafeAreaInsets()
  const rawTop = insets.top > 0 ? insets.top : (Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 44)
  const topHeaderPos = Math.max(rawTop + 10, 40)
  const bottomInset = insets.bottom > 0 ? insets.bottom : 10
  const { rideInProgress, driverName, from, to, fare, vehicle, progress: initialProgress, pickupLat, pickupLng, dropoffLat, dropoffLng } = useLocalSearchParams()
  const getString = (val: string | string[] | undefined) => (Array.isArray(val) ? (val[0] ?? "") : (val ?? ""))

  // Get current user role from global manager
  const userRole = useUserRole();

  // Real state management
  const [currentLocation, setCurrentLocation] = useState<LocationData | null>(null)
  const [pickupLocation, setPickupLocation] = useState<string>(getString(from))
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [destinationLocation, setDestinationLocation] = useState<string>(getString(to))
  const [destinationCoords, setDestinationCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [recentDestinations, setRecentDestinations] = useState<Array<{ name: string; address: string; lat: number; lng: number }>>([])
  const [offerPrice, setOfferPrice] = useState<string>(getString(fare))
  const [loading, setLoading] = useState(false)
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([])
  const [selectedVehicleType, setSelectedVehicleType] = useState<VehicleType | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<'bike' | 'car'>('bike')
  const [bikeFare, setBikeFare] = useState<number | null>(null)
  const [carFare, setCarFare] = useState<number | null>(null)
  const [autoAccept, setAutoAccept] = useState<boolean>(true)
  const [calculatedFares, setCalculatedFares] = useState<{ [key: string]: number }>({})
  const [isCalculatingFare, setIsCalculatingFare] = useState<boolean>(false)

  const handleSelectVehicle = (vt: VehicleType) => {
    setSelectedVehicleType(vt);
    const fareVal = calculatedFares[vt._id] || calculatedFares[vt.name.toLowerCase().trim()];
    if (typeof fareVal === 'number' && fareVal > 0) {
      setOfferPrice(fareVal.toFixed(0));
    } else {
      setOfferPrice('');
    }
  };

  const handleSelectRecentDestination = (item: { name: string; address: string; lat: number; lng: number }) => {
    setDestinationLocation(item.name || item.address);
    setDestinationCoords({ lat: item.lat, lng: item.lng });
    if (mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: item.lat,
        longitude: item.lng,
        latitudeDelta: 0.015,
        longitudeDelta: 0.0121,
      }, 1000);
    }
  };

  // Sliding bottom sheet state and animation (Collapsed: ~40% anchored at bottom, Expanded: ~70% upward over map)
  const collapsedVal = height * 0.30;
  const expandedVal = 0;
  const sheetY = useRef(new Animated.Value(collapsedVal)).current;
  const [isExpanded, setIsExpanded] = useState(false);

  const mapRef = useRef<MapView | null>(null);

  const toggleExpand = (expand: boolean) => {
    setIsExpanded(expand);
    Animated.spring(sheetY, {
      toValue: expand ? expandedVal : collapsedVal,
      useNativeDriver: true,
      friction: 8,
      tension: 40,
    }).start();
  };

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const sub = Keyboard.addListener(showEvent, () => {
      toggleExpand(true);
    });
    return () => {
      sub.remove();
    };
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gestureState) => {
        const startVal = isExpanded ? expandedVal : collapsedVal;
        const newVal = startVal + gestureState.dy;
        const clampedVal = Math.max(expandedVal, Math.min(collapsedVal, newVal));
        sheetY.setValue(clampedVal);
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.vy < -0.3 || gestureState.dy < -50) {
          toggleExpand(true);
        } else if (gestureState.vy > 0.3 || gestureState.dy > 50) {
          toggleExpand(false);
        } else {
          const currentY = (isExpanded ? expandedVal : collapsedVal) + gestureState.dy;
          const midpoint = (collapsedVal + expandedVal) / 2;
          if (currentY < midpoint) {
            toggleExpand(true);
          } else {
            toggleExpand(false);
          }
        }
      },
    })
  ).current;

  const getVehicleTypeByCategory = (category: 'bike' | 'car', typesList: VehicleType[]) => {
    if (typesList.length === 0) return null;
    
    const classify = (vt: VehicleType): 'bike' | 'car' | 'other' => {
      const name = String(vt.name || '').toLowerCase().trim();
      const isCar = name.includes('car') || name.includes('taxi') || name.includes('cab') || name.includes('sedan') || name.includes('suv') || name.includes('auto');
      const isBike = name.includes('bike') || name.includes('moto') || name.includes('motorcycle') || name.includes('scooter') || name.includes('two_wheeler');

      if (isCar) return 'car';
      if (isBike) return 'bike';
      return 'other';
    };

    const matched = typesList.find(t => classify(t) === category);
    if (matched) return matched;
    
    return category === 'bike' ? typesList[0] : (typesList.length > 1 ? typesList[1] : typesList[0]);
  };

  const handleCategoryChange = (category: 'bike' | 'car') => {
    setSelectedCategory(category);
    const vt = getVehicleTypeByCategory(category, vehicleTypes);
    if (vt) {
      setSelectedVehicleType(vt);
    }
    if (category === 'bike') {
      const fareVal = bikeFare !== null ? bikeFare : null;
      setOfferPrice(fareVal !== null ? fareVal.toFixed(0) : '');
    } else {
      const fareVal = carFare !== null ? carFare : null;
      setOfferPrice(fareVal !== null ? fareVal.toFixed(0) : '');
    }
  };

  const getMinimumPrice = (): number => {
    if (selectedVehicleType) {
      const calcFare = calculatedFares[selectedVehicleType._id] || calculatedFares[selectedVehicleType.name.toLowerCase().trim()];
      if (typeof calcFare === 'number' && calcFare > 0) {
        return calcFare;
      }
      if (typeof selectedVehicleType.basePrice === 'number' && selectedVehicleType.basePrice > 0) {
        return selectedVehicleType.basePrice;
      }
    }
    return selectedCategory === 'bike' ? 50 : 120;
  };

  const handleOfferPriceChange = (text: string) => {
    const clean = text.replace(/[^0-9]/g, '');
    setOfferPrice(clean);
  };

  const handleOfferPriceBlur = () => {
    const minPrice = getMinimumPrice();
    const val = parseFloat(offerPrice);
    if (isNaN(val) || val < minPrice) {
      setOfferPrice(minPrice.toFixed(0));
      showToast(`Offer cannot be less than base price (रू ${minPrice.toFixed(0)})`, 'info');
    }
  };

  const handleIncrementPrice = () => {
    const minPrice = getMinimumPrice();
    const currentPrice = parseFloat(offerPrice);
    const base = isNaN(currentPrice) ? minPrice : currentPrice;
    const newPrice = base + 10;
    setOfferPrice(newPrice.toString());
  };

  const handleDecrementPrice = () => {
    const minPrice = getMinimumPrice();
    const currentPrice = parseFloat(offerPrice);
    if (isNaN(currentPrice) || currentPrice <= minPrice) {
      showToast(`Offer cannot be less than base price (रू ${minPrice.toFixed(0)})`, 'info');
      setOfferPrice(minPrice.toFixed(0));
      return;
    }
    const newPrice = Math.max(minPrice, currentPrice - 10);
    setOfferPrice(newPrice.toString());
  };

  const [sidePanelVisible, setSidePanelVisible] = useState(false)
  const router = useRouter()
  const [localRideInProgress, setLocalRideInProgress] = useState(rideInProgress === "true")
  const [progress, setProgress] = useState(Number.parseInt(initialProgress as string) || 0)
  const [localDriverName, setLocalDriverName] = useState(getString(driverName) || "")
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: 'success' | 'error' | 'info';
  }>({
    visible: false,
    message: '',
    type: 'info',
  });
  const [isSettingUpFromUrl, setIsSettingUpFromUrl] = useState(false);
  const [hasUrlParameters, setHasUrlParameters] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ visible: true, message, type });
  };

  const hideToast = () => {
    setToast(prev => ({ ...prev, visible: false }));
  };

  const [showRaiseFareModal, setShowRaiseFareModal] = useState(false);
  const [raiseFareLoading, setRaiseFareLoading] = useState(false); 
  const [selectedRideForRaise, setSelectedRideForRaise] = useState<any>(null);

  const handleConfirmRaiseFare = async (newFare: number) => {
    setShowRaiseFareModal(false);
    setSelectedRideForRaise(null);
  };

  useEffect(() => {
    initializeApp();
  }, []);

  const KATHMANDU_BOUNDING_BOX = {
    north: 27.85,
    south: 27.60,
    east: 85.55,
    west: 85.20,
  };
  function isInKathmandu(lat: number, lng: number) {
    return lat >= KATHMANDU_BOUNDING_BOX.south && lat <= KATHMANDU_BOUNDING_BOX.north &&
      lng >= KATHMANDU_BOUNDING_BOX.west && lng <= KATHMANDU_BOUNDING_BOX.east;
  }

  const sortVehicleTypes = (types: any[]) => {
    if (!Array.isArray(types)) return [];
    return [...types].sort((a, b) => {
      const aName = (a.name || '').toLowerCase().trim();
      const bName = (b.name || '').toLowerCase().trim();

      const getRank = (name: string) => {
        if (name.includes('bike') || name.includes('moto') || name.includes('motorcycle') || name.includes('scooter')) {
          return 1; // Bike 1st
        }
        if (name.includes('car') || (name.includes('taxi') && !name.includes('ev'))) {
          return 2; // Car 2nd
        }
        return 3; // EV Taxi, SUV, etc. 3rd+
      };

      return getRank(aName) - getRank(bName);
    });
  };

  const initializeApp = async () => {
    try {
      const location = await locationService.getCurrentLocation();
      setCurrentLocation(location);

      if (!pickupLocation || pickupLocation === '' || pickupLocation === 'Kathmandu' || pickupLocation === 'Kathmandu, Nepal') {
        setPickupCoords({ lat: location.latitude, lng: location.longitude });
        const address = await locationService.getAddressFromCoordinates(location.latitude, location.longitude);
        if (address) {
          setPickupLocation(address);
        } else {
          setPickupLocation('Current Location');
        }
      }

      const types = await rideService.getVehicleTypes();
      const sortedTypes = sortVehicleTypes(types);
      setVehicleTypes(sortedTypes);

      if (sortedTypes.length > 0) {
        const defaultVt = sortedTypes[0]; // Bike is 1st
        setSelectedVehicleType(defaultVt);
        setSelectedCategory('bike');
      }

      // Safely fetch passenger ride history for recent destinations
      try {
        const historyRides = await rideService.getPassengerRides();
        if (Array.isArray(historyRides) && historyRides.length > 0) {
          const list: Array<{ name: string; address: string; lat: number; lng: number }> = [];
          const seen = new Set<string>();
          for (const r of historyRides) {
            const locName = r.dropOffLocation || (r as any).dropOff?.location;
            const lat = r.dropOffLat || (r as any).dropOff?.coords?.coordinates[1];
            const lng = r.dropOffLng || (r as any).dropOff?.coords?.coordinates[0];
            if (locName && typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
              const key = `${locName.trim().toLowerCase()}-${lat.toFixed(4)}-${lng.toFixed(4)}`;
              if (!seen.has(key)) {
                seen.add(key);
                list.push({ name: locName, address: locName, lat, lng });
              }
            }
          }
          setRecentDestinations(list.slice(0, 5));
        }
      } catch (err) {
        console.log('No recent destinations loaded from history:', err);
      }
    } catch (error) {
      console.error('Failed to initialize app:', error);
      showToast('Failed to load location or vehicle types', 'error');
    }
  };

  const extractCoordinates = (place: any): { lat: number; lng: number } | null => {
    if (!place) return null;
    let lat: number | undefined;
    let lng: number | undefined;

    if (place.location && typeof place.location.lat === 'number' && typeof place.location.lng === 'number') {
      lat = place.location.lat;
      lng = place.location.lng;
    } else if (place.location && typeof place.location.latitude === 'number' && typeof place.location.longitude === 'number') {
      lat = place.location.latitude;
      lng = place.location.longitude;
    } else if (typeof place.latitude === 'number' && typeof place.longitude === 'number') {
      lat = place.latitude;
      lng = place.longitude;
    } else if (typeof place.lat === 'number' && typeof place.lng === 'number') {
      lat = place.lat;
      lng = place.lng;
    }

    if (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
    return null;
  };

  const handlePickupLocationSelect = (place: GoogleMapsPlace) => {
    setPickupLocation(place.name || place.address || 'Kathmandu');
    const coords = extractCoordinates(place);
    if (coords) {
      setPickupCoords(coords);
    }
  };

  const handleDestinationChangeText = (text: string) => {
    setDestinationLocation(text);
    if (!text || text.trim() === '') {
      setDestinationCoords(null);
    }
  };

  const handleDestinationLocationSelect = (place: GoogleMapsPlace) => {
    setDestinationLocation(place.name || place.address || 'Destination');
    const coords = extractCoordinates(place);
    if (coords) {
      setDestinationCoords(coords);
    }
  };

  const [routePolyline, setRoutePolyline] = useState<{ latitude: number; longitude: number }[]>([]);

  useEffect(() => {
    const calculateFare = async () => {
      if (!pickupCoords || !destinationCoords) return;
      setIsCalculatingFare(true);
      try {
        const types = vehicleTypes.length > 0 ? vehicleTypes : sortVehicleTypes(await rideService.getVehicleTypes());
        if (types.length > 0 && vehicleTypes.length === 0) {
          setVehicleTypes(types);
        }
        const result = await locationService.getRouteWithFare(
          pickupCoords.lat,
          pickupCoords.lng,
          destinationCoords.lat,
          destinationCoords.lng,
          types
        );
        
        if (result && result.fares) {
          setCalculatedFares(result.fares);

          const selVt = selectedVehicleType || (types.length > 0 ? types[0] : null);
          let activeFare = 0;
          if (selVt) {
            activeFare = result.fares[selVt._id] || result.fares[selVt.name.toLowerCase().trim()] || 0;
          }

          if (!activeFare || activeFare <= 0) {
            activeFare = (Object.values(result.fares).find(v => typeof v === 'number' && v > 0) as number) || 0;
          }

          if (activeFare > 0) {
            setOfferPrice(activeFare.toFixed(0));
          } else {
            // Fallback estimation using Haversine formula
            const R = 6371;
            const dLat = (destinationCoords.lat - pickupCoords.lat) * Math.PI / 180;
            const dLon = (destinationCoords.lng - pickupCoords.lng) * Math.PI / 180;
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                      Math.cos(pickupCoords.lat * Math.PI / 180) * Math.cos(destinationCoords.lat * Math.PI / 180) *
                      Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const distKm = Math.max(0.5, R * c);
            const fallbackFare = selectedCategory === 'bike' ? Math.round(40 + distKm * 15) : Math.round(100 + distKm * 35);
            setOfferPrice(fallbackFare.toFixed(0));
          }
        } else {
          // Haversine fallback estimation
          const R = 6371;
          const dLat = (destinationCoords.lat - pickupCoords.lat) * Math.PI / 180;
          const dLon = (destinationCoords.lng - pickupCoords.lng) * Math.PI / 180;
          const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                    Math.cos(pickupCoords.lat * Math.PI / 180) * Math.cos(destinationCoords.lat * Math.PI / 180) *
                    Math.sin(dLon / 2) * Math.sin(dLon / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          const distKm = Math.max(0.5, R * c);
          const fallbackFare = selectedCategory === 'bike' ? Math.round(40 + distKm * 15) : Math.round(100 + distKm * 35);
          setOfferPrice(fallbackFare.toFixed(0));
        }

        if (result && result.polyline && result.polyline.length > 0) {
          setRoutePolyline(result.polyline);
          if (mapRef.current) {
            mapRef.current.fitToCoordinates(result.polyline, {
              edgePadding: { top: 120, right: 50, bottom: 250, left: 50 },
              animated: true,
            });
          }
        }
      } catch (error) {
        console.error('Failed to calculate fare:', error);
        // Haversine fallback estimation on error
        const R = 6371;
        const dLat = (destinationCoords.lat - pickupCoords.lat) * Math.PI / 180;
        const dLon = (destinationCoords.lng - pickupCoords.lng) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(pickupCoords.lat * Math.PI / 180) * Math.cos(destinationCoords.lat * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distKm = Math.max(0.5, R * c);
        const fallbackFare = selectedCategory === 'bike' ? Math.round(40 + distKm * 15) : Math.round(100 + distKm * 35);
        setOfferPrice(fallbackFare.toFixed(0));
      } finally {
        setIsCalculatingFare(false);
      }
    };
    calculateFare();
  }, [pickupCoords, destinationCoords, selectedCategory]);

  const handleCreateRide = async () => {
    if (!pickupLocation.trim()) {
      showToast('Please enter a pickup location', 'error');
      return;
    }
    if (!destinationLocation.trim()) {
      showToast('Please enter a destination', 'error');
      return;
    }
    setLoading(true);
    try {
      // Resolve valid Mongo ObjectId for vehicleType to pass DTO validation
      let vtId = selectedVehicleType?._id;
      if (!vtId || vtId === 'bike' || vtId === 'car') {
        const types = vehicleTypes.length > 0 ? vehicleTypes : await rideService.getVehicleTypes();
        const matchedVt = getVehicleTypeByCategory(selectedCategory, types);
        if (matchedVt) {
          vtId = matchedVt._id;
          setSelectedVehicleType(matchedVt);
        }
      }

      if (!vtId) {
        showToast('Please select a vehicle type', 'error');
        setLoading(false);
        return;
      }

      let pLat = pickupCoords ? Number(pickupCoords.lat) : (currentLocation?.latitude || 27.7172);
      let pLng = pickupCoords ? Number(pickupCoords.lng) : (currentLocation?.longitude || 85.324);
      let dLat = destinationCoords ? Number(destinationCoords.lat) : (pLat + 0.03);
      let dLng = destinationCoords ? Number(destinationCoords.lng) : (pLng + 0.03);

      // Validate numeric boundaries for DTO (-90 to 90 for lat, -180 to 180 for lng)
      if (typeof pLat !== 'number' || isNaN(pLat) || pLat < -90 || pLat > 90) pLat = 27.7172;
      if (typeof pLng !== 'number' || isNaN(pLng) || pLng < -180 || pLng > 180) pLng = 85.324;
      if (typeof dLat !== 'number' || isNaN(dLat) || dLat < -90 || dLat > 90) dLat = pLat + 0.03;
      if (typeof dLng !== 'number' || isNaN(dLng) || dLng < -180 || dLng > 180) dLng = pLng + 0.03;

      if (pickupLocation.trim().toLowerCase() === destinationLocation.trim().toLowerCase()) {
        showToast('Pickup and destination cannot be the same', 'error');
        setLoading(false);
        return;
      }

      const rideRequest: RideRequest = {
        vehicleType: vtId,
        pickUpLocation: pickupLocation,
        pickUpLat: pLat,
        pickUpLng: pLng,
        dropOffLocation: destinationLocation,
        dropOffLat: dLat,
        dropOffLng: dLng,
        offerPrice: parseFloat(offerPrice) || 256,
        comments: '',
      };

      const rideData = await rideService.createRide(rideRequest);
      if (!rideData || !rideData._id) {
        showToast('Failed to create ride request', 'error');
        setLoading(false);
        return;
      }

      router.push({
        pathname: '/(tabs)/rideOffers',
        params: {
          rideId: rideData._id,
          pickUpLocation: pickupLocation,
          dropOffLocation: destinationLocation,
          offerPrice: offerPrice || '256',
          vehicleType: selectedVehicleType?.name || 'Bike',
          from: pickupLocation,
          to: destinationLocation,
          fare: offerPrice || '256',
          vehicle: selectedVehicleType?.name || 'Bike',
          pickupLat: pLat.toString(),
          pickupLng: pLng.toString(),
          dropoffLat: dLat.toString(),
          dropoffLng: dLng.toString(),
        },
      });
    } catch (error: any) {
      showToast(error.message || 'Failed to request ride', 'error');
    } finally {
      setLoading(false);
    }
  };

  const openRideTracking = () => {
    router.push({
      pathname: "/(common)/rideTracker",
      params: {
        rideInProgress: "true",
        driverName: localDriverName,
        from: pickupLocation,
        to: destinationLocation,
        fare: offerPrice,
        vehicle: selectedCategory === 'bike' ? 'Moto' : 'Ride',
        progress: progress.toString(),
        userRole: userRole,
      },
    })
  }

  // Determine whether destination has been selected (Triggers ONLY when a place is selected with valid coordinates)
  const isDestinationSelected = Boolean(
    destinationCoords && 
    typeof destinationCoords.lat === 'number' && 
    !isNaN(destinationCoords.lat) && 
    typeof destinationCoords.lng === 'number' && 
    !isNaN(destinationCoords.lng)
  );

  if (!currentLocation) {
    return <PostLoginLoadingScreen statusText="Finding your location..." />;
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* Map View & Top Floating Search Card Overlay */}
      <View style={styles.mapAbsoluteContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          initialRegion={{
            latitude: currentLocation?.latitude || 27.7172,
            longitude: currentLocation?.longitude || 85.324,
            latitudeDelta: 0.015,
            longitudeDelta: 0.0121,
          }}
          minZoomLevel={12}
          maxZoomLevel={17}
          onRegionChangeComplete={async (region, { isGesture }) => {
            if (isGesture && !isDestinationSelected) {
              const { latitude, longitude } = region;
              setPickupCoords({ lat: latitude, lng: longitude });
              try {
                const address = await locationService.getAddressFromCoordinates(latitude, longitude);
                if (address) {
                  setPickupLocation(address);
                }
              } catch (err) {
                console.warn('Map drag reverse geocode notice:', err);
              }
            }
          }}
        >
          {currentLocation && typeof currentLocation.latitude === 'number' && !isNaN(currentLocation.latitude) && typeof currentLocation.longitude === 'number' && !isNaN(currentLocation.longitude) && (
            <Marker
              coordinate={{
                latitude: currentLocation.latitude,
                longitude: currentLocation.longitude,
              }}
              title="Your Location"
            >
              <View style={styles.userMarker}>
                <MaterialIcons name="location-on" size={24} color="#B7102A" />
              </View>
            </Marker>
          )}
          {pickupCoords && typeof pickupCoords.lat === 'number' && !isNaN(pickupCoords.lat) && typeof pickupCoords.lng === 'number' && !isNaN(pickupCoords.lng) && (
            <Marker
              coordinate={{ latitude: pickupCoords.lat, longitude: pickupCoords.lng }}
              title="Pickup"
              pinColor="#B7102A"
            />
          )}
          {destinationCoords && typeof destinationCoords.lat === 'number' && !isNaN(destinationCoords.lat) && typeof destinationCoords.lng === 'number' && !isNaN(destinationCoords.lng) && (
            <Marker
              coordinate={{ latitude: destinationCoords.lat, longitude: destinationCoords.lng }}
              title="Dropoff"
              pinColor="#B7102A"
            />
          )}
          {routePolyline && routePolyline.length > 0 && (
            <Polyline
              coordinates={routePolyline.filter(c => typeof c.latitude === 'number' && !isNaN(c.latitude) && typeof c.longitude === 'number' && !isNaN(c.longitude))}
              strokeColor="#B7102A"
              strokeWidth={4}
            />
          )}
        </MapView>

        {/* Center Marker Pin Overlay for Map Dragging */}
        {!isDestinationSelected && (
          <View style={styles.centerPinContainer} pointerEvents="none">
            <MaterialIcons name="location-on" size={36} color="#B7102A" />
          </View>
        )}

        {/* STATE 2: Floating Top Search Card (ONLY shown when destination is selected) */}
        {isDestinationSelected && (
          <View style={styles.topSearchCard}>
            <View style={styles.searchRow}>
              <Ionicons name="radio-button-off" size={20} color="#B7102A" style={{ marginRight: 10 }} />
              <View style={{ flex: 1 }}>
                <LocationSearch
                  placeholder="Kathmandu"
                  value={pickupLocation}
                  onChangeText={setPickupLocation}
                  onLocationSelect={handlePickupLocationSelect}
                  iconColor="#B7102A"
                  disabled={loading}
                  boundingBox={KATHMANDU_BOUNDING_BOX}
                />
              </View>
            </View>

            <View style={[styles.searchRow, styles.destinationSearchRow]}>
              <Ionicons name="location" size={20} color="#B7102A" style={{ marginRight: 10 }} />
              <View style={{ flex: 1 }}>
                <LocationSearch
                  placeholder="To (Destination)"
                  value={destinationLocation}
                  onChangeText={handleDestinationChangeText}
                  onLocationSelect={handleDestinationLocationSelect}
                  iconColor="#B7102A"
                  disabled={loading}
                  boundingBox={KATHMANDU_BOUNDING_BOX}
                />
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Sliding Bottom Sheet */}
      <Animated.View
        style={[
          styles.bottomSheetWrapper,
          { transform: [{ translateY: sheetY }] }
        ]}
        pointerEvents="box-none"
      >
        <View
          {...panResponder.panHandlers}
          style={styles.dragHandleContainer}
          pointerEvents="auto"
        >
          <View style={styles.dragHandle} />
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
          pointerEvents="box-none"
        >
          <ScrollView
            style={styles.bottomSheet}
            contentContainerStyle={styles.bottomSheetContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            pointerEvents="auto"
          >
            {!isDestinationSelected ? (
              <>
                {/* 1. Dynamic Category Pill Selector (All Admin API Vehicle Types) */}
                <View style={styles.categoryTabContainer}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {vehicleTypes.map((vt) => {
                      const isSelected = selectedVehicleType?._id === vt._id || selectedVehicleType?.name === vt.name;
                      const nameLower = (vt.name || '').toLowerCase().trim();
                      const iconName = (nameLower.includes('bike') || nameLower.includes('moto') || nameLower.includes('motorcycle') || nameLower.includes('scooter'))
                        ? 'motorcycle'
                        : (nameLower.includes('ev') || nameLower.includes('electric') ? 'bolt' : 'car');

                      return (
                        <TouchableOpacity
                          key={vt._id || vt.name}
                          style={[
                            styles.categoryTab,
                            isSelected && styles.activeCategoryTab
                          ]}
                          onPress={() => handleSelectVehicle(vt)}
                          disabled={loading}
                          activeOpacity={0.85}
                        >
                          <FontAwesome5
                            name={iconName}
                            size={16}
                            color={isSelected ? '#FFFFFF' : '#191C1D'}
                          />
                          <Text style={[
                            styles.categoryTabText,
                            isSelected && styles.activeCategoryTabText
                          ]}>
                            {vt.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* 2 & 3. Pickup and Destination Location Cards */}
                <View style={styles.bottomLocationPanel}>
                  <View style={styles.searchRow}>
                    <Ionicons name="radio-button-off" size={20} color="#B7102A" style={{ marginRight: 10 }} />
                    <View style={{ flex: 1 }}>
                      <LocationSearch
                        placeholder="Current location"
                        value={pickupLocation}
                        onChangeText={setPickupLocation}
                        onLocationSelect={handlePickupLocationSelect}
                        iconColor="#B7102A"
                        disabled={loading}
                        boundingBox={KATHMANDU_BOUNDING_BOX}
                      />
                    </View>
                  </View>

                  <View style={[styles.searchRow, styles.destinationSearchRow]}>
                    <Ionicons name="location" size={20} color="#B7102A" style={{ marginRight: 10 }} />
                    <View style={{ flex: 1 }}>
                      <LocationSearch
                        placeholder="To (Destination)"
                        value={destinationLocation}
                        onChangeText={handleDestinationChangeText}
                        onLocationSelect={handleDestinationLocationSelect}
                        iconColor="#B7102A"
                        disabled={loading}
                        boundingBox={KATHMANDU_BOUNDING_BOX}
                      />
                    </View>
                  </View>
                </View>

                {/* 4. Recent Destinations (Maximum 3 Items, Hidden if Empty) */}
                {recentDestinations.length > 0 && (
                  <View style={styles.recentDestinationsCard}>
                    <Text style={styles.recentDestinationsHeader}>Recent destinations</Text>
                    {recentDestinations.slice(0, 3).map((item, index) => (
                      <TouchableOpacity
                        key={index}
                        style={styles.recentDestinationItemRow}
                        onPress={() => handleSelectRecentDestination(item)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.recentIconBadge}>
                          <Ionicons name="location-outline" size={18} color="#B7102A" />
                        </View>
                        <View style={styles.recentTextCol}>
                          <Text style={styles.recentTitleText} numberOfLines={1}>{item.name}</Text>
                          <Text style={styles.recentSubtextText} numberOfLines={1}>{item.address}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color="#8F6F6E" />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </>
            ) : (
              <>
                {/* Segmented Dynamic Category Selector Tabs (Rendered for ALL active backend vehicle types) */}
                <View style={styles.categoryTabContainer}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {vehicleTypes.map((vt) => {
                      const isSelected = selectedVehicleType?._id === vt._id || selectedVehicleType?.name === vt.name;
                      const nameLower = (vt.name || '').toLowerCase().trim();
                      const iconName = (nameLower.includes('bike') || nameLower.includes('moto') || nameLower.includes('motorcycle') || nameLower.includes('scooter'))
                        ? 'motorcycle'
                        : (nameLower.includes('ev') || nameLower.includes('electric') ? 'bolt' : 'car');

                      return (
                        <TouchableOpacity
                          key={vt._id || vt.name}
                          style={[
                            styles.categoryTab,
                            isSelected && styles.activeCategoryTab
                          ]}
                          onPress={() => handleSelectVehicle(vt)}
                          disabled={loading}
                          activeOpacity={0.85}
                        >
                          <FontAwesome5
                            name={iconName}
                            size={16}
                            color={isSelected ? '#FFFFFF' : '#191C1D'}
                          />
                          <Text style={[
                            styles.categoryTabText,
                            isSelected && styles.activeCategoryTabText
                          ]}>
                            {vt.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* Selected Vehicle Pricing Card */}
                <View style={styles.fareSelectionCard}>
                  <View style={styles.activeVehicleHeader}>
                    <View style={styles.activeVehicleInfo}>
                      <Text style={styles.activeVehicleTitle}>
                        {selectedVehicleType?.name || 'Vehicle'}
                      </Text>
                      <View style={styles.activeVehicleMeta}>
                        <Ionicons name="person" size={12} color="#5B403F" />
                        <Text style={styles.activeVehicleCapacity}>
                          {selectedVehicleType?.capacity || 1} passenger{(selectedVehicleType?.capacity || 1) > 1 ? 's' : ''}
                        </Text>
                        <Text style={styles.activeVehicleDot}>•</Text>
                        <Text style={styles.activeVehicleDesc}>
                          {selectedVehicleType?.description || (selectedVehicleType?.name?.toLowerCase().includes('bike') ? 'Fast & economical' : 'Comfortable ride')}
                        </Text>
                      </View>
                    </View>

                    {/* Fare Price Display */}
                    <View style={styles.farePriceRight}>
                      {isCalculatingFare ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <ActivityIndicator size="small" color="#B7102A" style={{ marginRight: 6 }} />
                          <Text style={styles.fareCalculatingText}>Calculating fare...</Text>
                        </View>
                      ) : (
                        <Text style={styles.farePriceValue}>
                          {offerPrice && !isNaN(parseFloat(offerPrice)) ? `रू ${parseFloat(offerPrice).toFixed(0)}` : 'Calculating fare...'}
                        </Text>
                      )}
                      <Text style={styles.farePriceLabel}>Estimated Fare</Text>
                    </View>
                  </View>

                  {/* Price Adjuster Buttons (- / + & Editable Write-In Pill) */}
                  {(() => {
                    const minPriceNum = getMinimumPrice();
                    const currentPriceNum = parseFloat(offerPrice);
                    const isAtMin = !isNaN(currentPriceNum) && currentPriceNum <= minPriceNum;

                    return (
                      <View style={styles.priceAdjusterContainer}>
                        <TouchableOpacity
                          style={[styles.adjustPriceButton, isAtMin && styles.stepBtnDisabled]}
                          onPress={handleDecrementPrice}
                          disabled={loading || isCalculatingFare || isAtMin}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="remove" size={18} color={isAtMin ? "#CCCCCC" : "#191C1D"} />
                        </TouchableOpacity>

                        <View style={styles.priceAdjusterPill}>
                          {isCalculatingFare ? (
                            <ActivityIndicator size="small" color="#B7102A" />
                          ) : (
                            <View style={styles.priceInputWrapper}>
                              <Text style={styles.priceCurrencySymbol}>रू</Text>
                              <RNTextInput
                                style={styles.priceAdjusterInput}
                                value={offerPrice}
                                onChangeText={handleOfferPriceChange}
                                onFocus={() => toggleExpand(true)}
                                onBlur={handleOfferPriceBlur}
                                keyboardType="number-pad"
                                placeholder={minPriceNum ? minPriceNum.toFixed(0) : '0'}
                                placeholderTextColor="#8F6F6E"
                                editable={!loading && !isCalculatingFare}
                              />
                            </View>
                          )}
                        </View>

                        <TouchableOpacity
                          style={styles.adjustPriceButton}
                          onPress={handleIncrementPrice}
                          disabled={loading || isCalculatingFare}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="add" size={18} color="#191C1D" />
                        </TouchableOpacity>
                      </View>
                    );
                  })()}

                  {/* Auto-accept Offers Switch */}
                  <View style={styles.toggleRow}>
                    <View style={styles.toggleTextContainer}>
                      <Ionicons name="flash" size={16} color="#B7102A" style={{ marginRight: 6 }} />
                      <Text style={styles.toggleLabel}>Auto-accept offers</Text>
                    </View>
                    <Switch
                      value={autoAccept}
                      onValueChange={setAutoAccept}
                      trackColor={{ false: '#E4BEBC', true: '#B7102A' }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                </View>

                {/* Dynamic Remaining Vehicle Options */}
                {vehicleTypes
                  .filter((vt) => (vt._id && selectedVehicleType?._id) ? vt._id !== selectedVehicleType._id : vt.name !== selectedVehicleType?.name)
                  .map((altVt) => {
                    const altFare = calculatedFares[altVt._id] || calculatedFares[altVt.name.toLowerCase().trim()];
                    const isBikeType = altVt.name.toLowerCase().includes('bike') || altVt.name.toLowerCase().includes('moto');

                    return (
                      <TouchableOpacity
                        key={altVt._id || altVt.name}
                        style={styles.secondaryVehicleCard}
                        onPress={() => handleSelectVehicle(altVt)}
                        disabled={loading}
                        activeOpacity={0.7}
                      >
                        <View style={styles.secondaryLeft}>
                          {isBikeType ? (
                            <FontAwesome5 name="motorcycle" size={18} color="#191C1D" style={{ marginRight: 10 }} />
                          ) : (
                            <Ionicons name="car-outline" size={20} color="#191C1D" style={{ marginRight: 10 }} />
                          )}
                          <View>
                            <Text style={styles.secondaryTitle}>{altVt.name}</Text>
                            <Text style={styles.secondarySub}>
                              {altVt.capacity || 1} passenger{(altVt.capacity || 1) > 1 ? 's' : ''} • {isBikeType ? 'Fast arrival' : 'Comfortable'}
                            </Text>
                          </View>
                        </View>
                        {isCalculatingFare ? (
                          <ActivityIndicator size="small" color="#B7102A" />
                        ) : (
                          <Text style={styles.secondaryPrice}>
                            {altFare && altFare > 0 ? `~ रू ${altFare.toFixed(0)}` : '--'}
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}

                {/* Primary Action Button ("Find a driver") */}
                <TouchableOpacity
                  style={[styles.findDriverButton, loading && styles.buttonDisabled]}
                  onPress={handleCreateRide}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.buttonText}>Find a driver</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>

      {/* Mini Player when ride in progress */}
      {localRideInProgress && (
        <TouchableOpacity style={styles.miniPlayer} onPress={openRideTracking}>
          <View style={styles.miniPlayerContent}>
            <View style={styles.miniPlayerInfo}>
              <View style={styles.miniPlayerIcon}>
                <Icon name="directions-car" size={16} color="#fff" />
              </View>
              <View style={styles.miniPlayerText}>
                <Text style={styles.miniPlayerTitle}>Ride in Progress</Text>
                <Text style={styles.miniPlayerSubtitle}>
                  {localDriverName} • {progress}% complete
                </Text>
              </View>
            </View>
            <View style={styles.miniPlayerActions}>
              <View style={styles.progressIndicator}>
                <View style={[styles.progressFill, { width: `${progress}%` }]} />
              </View>
              <Icon name="keyboard-arrow-up" size={24} color="#fff" />
            </View>
          </View>
        </TouchableOpacity>
      )}

      {/* Fixed Bottom Navigation Bar (Home, History, Support, Profile) */}
      <View style={styles.bottomTabBar}>
        <TouchableOpacity style={styles.activeTabItem}>
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

      <SidePanel
        visible={sidePanelVisible}
        onClose={() => setSidePanelVisible(false)}
        role="passenger"
        rideInProgress={false}
        onChangeRole={() => {}}
      />

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={hideToast}
      />

      {selectedRideForRaise && (
        <RaiseFareModal
          visible={showRaiseFareModal}
          onClose={() => {
            setShowRaiseFareModal(false);
            setSelectedRideForRaise(null);
          }}
          calculatedFare={selectedRideForRaise.fare}
          onSend={handleConfirmRaiseFare}
          loading={raiseFareLoading}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },
  topHeaderBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 54,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 100,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerBrandTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#B7102A',
    letterSpacing: -0.5,
  },
  headerProfileButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: 'hidden',
  },
  mapAbsoluteContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 70,
    zIndex: 1,
  },
  map: {
    flex: 1,
    width: width,
  },
  centerPinContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -36,
    marginLeft: -18,
    zIndex: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topSearchCard: {
    position: 'absolute',
    top: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 12 : 54,
    left: 16,
    right: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EAEAEA',
    zIndex: 10,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F5',
    borderRadius: 12,
    height: 46,
    paddingHorizontal: 12,
  },
  destinationSearchRow: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E4BEBC',
  },
  bottomLocationPanel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#EAEAEA',
  },
  userMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomSheetWrapper: {
    position: 'absolute',
    bottom: 70,
    left: 0,
    right: 0,
    height: height * 0.70,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: 1,
    borderTopColor: '#EAEAEA',
    zIndex: 20,
  },
  dragHandleContainer: {
    alignItems: 'center',
    paddingVertical: 10,
    width: '100%',
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E0E0E0',
  },
  bottomSheet: {
    backgroundColor: 'transparent',
    flex: 1,
  },
  bottomSheetContent: {
    paddingHorizontal: 18,
    paddingBottom: Platform.OS === 'ios' ? 90 : 80,
  },
  categoryTabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F5',
    borderRadius: 16,
    padding: 4,
    marginBottom: 14,
  },
  recentDestinationsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#EFEDF3',
  },
  recentDestinationsHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#191C1D',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  recentDestinationItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F4F3F8',
  },
  recentIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFDAD8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  recentTextCol: {
    flex: 1,
    marginRight: 8,
  },
  recentTitleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#191C1D',
  },
  recentSubtextText: {
    fontSize: 12,
    color: '#5B403F',
    marginTop: 1,
  },
  categoryTab: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  activeCategoryTab: {
    backgroundColor: '#B7102A',
  },
  categoryTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#191C1D',
  },
  activeCategoryTabText: {
    color: '#FFFFFF',
  },
  fareSelectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FFDAD8',
    marginBottom: 12,
  },
  activeVehicleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  activeVehicleInfo: {
    flex: 1,
  },
  activeVehicleTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#191C1D',
    marginBottom: 2,
  },
  activeVehicleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  activeVehicleCapacity: {
    fontSize: 12,
    color: '#5B403F',
    marginLeft: 3,
  },
  activeVehicleDot: {
    fontSize: 12,
    color: '#5B403F',
    marginHorizontal: 4,
  },
  activeVehicleDesc: {
    fontSize: 12,
    color: '#5B403F',
  },
  farePriceRight: {
    alignItems: 'flex-end',
  },
  farePriceValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#B7102A',
  },
  farePriceLabel: {
    fontSize: 11,
    color: '#8F6F6E',
    fontWeight: '500',
  },
  priceAdjusterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginVertical: 8,
  },
  adjustPriceButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E4BEBC',
  },
  stepBtnDisabled: {
    backgroundColor: '#F8F9FA',
    borderColor: '#EAEAEA',
  },
  priceAdjusterPill: {
    backgroundColor: '#F3F4F5',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 14,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceCurrencySymbol: {
    fontSize: 18,
    fontWeight: '700',
    color: '#191C1D',
    marginRight: 4,
  },
  priceAdjusterInput: {
    fontSize: 18,
    fontWeight: '700',
    color: '#191C1D',
    paddingVertical: 0,
    paddingHorizontal: 0,
    minWidth: 45,
    backgroundColor: 'transparent',
    borderWidth: 0,
    margin: 0,
  },
  priceAdjusterValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#191C1D',
  },
  fareCalculatingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#B7102A',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F3F4F5',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 10,
  },
  toggleTextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#191C1D',
  },
  secondaryVehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  secondaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  secondaryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#191C1D',
  },
  secondarySub: {
    fontSize: 12,
    color: '#8F6F6E',
    marginTop: 1,
  },
  secondaryPrice: {
    fontSize: 13,
    fontWeight: '600',
    color: '#191C1D',
  },
  findDriverButton: {
    backgroundColor: '#B7102A',
    borderRadius: 14,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  miniPlayer: {
    position: 'absolute',
    bottom: 64,
    left: 0,
    right: 0,
    backgroundColor: '#B7102A',
    paddingHorizontal: 20,
    paddingVertical: 16,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    zIndex: 1000,
  },
  miniPlayerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  miniPlayerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  miniPlayerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  miniPlayerText: {
    flex: 1,
  },
  miniPlayerTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  miniPlayerSubtitle: {
    color: '#FFDAD8',
    fontSize: 12,
  },
  miniPlayerActions: {
    alignItems: 'center',
    gap: 8,
  },
  progressIndicator: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 2,
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

export default PassengerHomeScreen;
