"use client"

import { useState, useEffect, useRef } from "react"
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, ActivityIndicator, StatusBar, Platform, ScrollView, KeyboardAvoidingView, Animated, PanResponder, Switch } from "react-native"
import { TextInput } from "react-native-paper"
import Icon from "react-native-vector-icons/MaterialIcons"
import { Ionicons, MaterialIcons, FontAwesome5 } from '@expo/vector-icons'
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
  const topHeaderPos = insets.top > 0 ? insets.top + 2 : (Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 36)
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
  const [offerPrice, setOfferPrice] = useState<string>(getString(fare))
  const [loading, setLoading] = useState(false)
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([])
  const [selectedVehicleType, setSelectedVehicleType] = useState<VehicleType | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<'bike' | 'car'>('bike')
  const [bikeFare, setBikeFare] = useState<number | null>(null)
  const [carFare, setCarFare] = useState<number | null>(null)
  const [autoAccept, setAutoAccept] = useState<boolean>(true)

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
    if (category === 'bike') {
      const bikeType = typesList.find(t => 
        t.name.toLowerCase().includes('bike') || 
        t.name.toLowerCase().includes('moto') || 
        t.name.toLowerCase().includes('motorcycle')
      );
      return bikeType || typesList[0];
    } else {
      const carType = typesList.find(t => 
        t.name.toLowerCase().includes('car') || 
        t.name.toLowerCase().includes('ride') || 
        t.name.toLowerCase().includes('comfort') || 
        t.name.toLowerCase().includes('taxi')
      );
      if (carType) return carType;
      const nonBikeType = typesList.find(t => 
        !t.name.toLowerCase().includes('bike') && 
        !t.name.toLowerCase().includes('moto') && 
        !t.name.toLowerCase().includes('motorcycle')
      );
      return nonBikeType || typesList[typesList.length - 1];
    }
  };

  const handleCategoryChange = (category: 'bike' | 'car') => {
    setSelectedCategory(category);
    const vt = getVehicleTypeByCategory(category, vehicleTypes);
    if (vt) {
      setSelectedVehicleType(vt);
    }
    if (category === 'bike') {
      const fareVal = bikeFare !== null ? bikeFare : 256;
      setOfferPrice(fareVal.toFixed(0));
    } else {
      const fareVal = carFare !== null ? carFare : 420;
      setOfferPrice(fareVal.toFixed(0));
    }
  };

  const handleIncrementPrice = () => {
    const currentPrice = parseFloat(offerPrice) || 256;
    const newPrice = currentPrice + 10;
    setOfferPrice(newPrice.toString());
  };

  const handleDecrementPrice = () => {
    const currentPrice = parseFloat(offerPrice) || 256;
    const minPrice = selectedVehicleType?.basePrice || 50;
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

  const initializeApp = async () => {
    try {
      const location = await locationService.getCurrentLocation();
      setCurrentLocation(location);

      if (!pickupLocation || pickupLocation === '') {
        if (isInKathmandu(location.latitude, location.longitude)) {
          const address = await locationService.getAddressFromCoordinates(location.latitude, location.longitude);
          setPickupLocation(address);
        } else {
          setPickupLocation('Kathmandu');
        }
      }

      const types = await rideService.getVehicleTypes();
      setVehicleTypes(types);

      if (types.length > 0) {
        const defaultVt = getVehicleTypeByCategory('bike', types);
        if (defaultVt) {
          setSelectedVehicleType(defaultVt);
        }
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
      try {
        const result = await locationService.getRouteWithFare(
          pickupCoords.lat,
          pickupCoords.lng,
          destinationCoords.lat,
          destinationCoords.lng
        );
        
        if (result && result.fares) {
          setBikeFare(result.fares.bike);
          setCarFare(result.fares.car);
          const calculatedFare = selectedCategory === 'bike' ? result.fares.bike : result.fares.car;
          setOfferPrice(calculatedFare.toFixed(0));
        }

        if (result && result.polyline) {
          setRoutePolyline(result.polyline);
        }
      } catch (error) {
        console.error('Failed to calculate fare:', error);
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
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Top Header Bar (Clean Header matching Stitch Reference) */}
      <View style={[styles.topHeaderBar, { top: topHeaderPos }]}>
        <View style={{ width: 38 }} />

        <Text style={styles.headerBrandTitle}>Saathi</Text>

        <TouchableOpacity
          style={styles.headerProfileButton}
          onPress={() => router.push('/(common)/profile')}
          activeOpacity={0.8}
        >
          <ProfileImage size={38} />
        </TouchableOpacity>
      </View>

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
              <Ionicons name="search" size={20} color="#8F6F6E" style={{ marginLeft: 6 }} />
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
            {/* Location Section inside Bottom Panel (Layout-stable before and after destination selection) */}
            {!isDestinationSelected ? (
              <View style={styles.bottomLocationPanel}>
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
                  <Ionicons name="search" size={20} color="#8F6F6E" style={{ marginLeft: 6 }} />
                </View>
              </View>
            ) : null}
            {/* Segmented Category Pill Switcher (Bike / Car) */}
            <View style={styles.categoryTabContainer}>
              <TouchableOpacity
                style={[
                  styles.categoryTab,
                  selectedCategory === 'bike' && styles.activeCategoryTab
                ]}
                onPress={() => handleCategoryChange('bike')}
                disabled={loading}
                activeOpacity={0.85}
              >
                <FontAwesome5
                  name="motorcycle"
                  size={18}
                  color={selectedCategory === 'bike' ? '#FFFFFF' : '#191C1D'}
                />
                <Text style={[
                  styles.categoryTabText,
                  selectedCategory === 'bike' && styles.activeCategoryTabText
                ]}>
                  Bike
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.categoryTab,
                  selectedCategory === 'car' && styles.activeCategoryTab
                ]}
                onPress={() => handleCategoryChange('car')}
                disabled={loading}
                activeOpacity={0.85}
              >
                <Ionicons
                  name="car"
                  size={20}
                  color={selectedCategory === 'car' ? '#FFFFFF' : '#191C1D'}
                />
                <Text style={[
                  styles.categoryTabText,
                  selectedCategory === 'car' && styles.activeCategoryTabText
                ]}>
                  Car
                </Text>
              </TouchableOpacity>
            </View>

            {/* Selected Vehicle Pricing Card (Moto / Ride Premium) */}
            <View style={styles.fareSelectionCard}>
              <View style={styles.activeVehicleHeader}>
                <View style={styles.activeVehicleInfo}>
                  <Text style={styles.activeVehicleTitle}>
                    {selectedCategory === 'bike' ? 'Moto' : 'Ride Premium'}
                  </Text>
                  <View style={styles.activeVehicleMeta}>
                    <Ionicons name="person" size={13} color="#5B403F" />
                    <Text style={styles.activeVehicleCapacity}>
                      {selectedCategory === 'bike' ? '1' : '4 passengers'}
                    </Text>
                    <Text style={styles.activeVehicleDot}>•</Text>
                    <Text style={styles.activeVehicleDesc}>
                      {selectedCategory === 'bike' ? 'No traffic, faster arrival' : 'Comfortable'}
                    </Text>
                  </View>
                </View>

                {/* Fare Price Display */}
                <View style={styles.farePriceRight}>
                  <Text style={styles.farePriceValue}>
                    रू {offerPrice ? parseFloat(offerPrice).toFixed(0) : (selectedCategory === 'bike' ? '256' : '420')}
                  </Text>
                  <Text style={styles.farePriceLabel}>Estimated Fare</Text>
                </View>
              </View>

              {/* Price Adjuster Buttons (- / +) */}
              <View style={styles.priceAdjusterContainer}>
                <TouchableOpacity
                  style={styles.adjustPriceButton}
                  onPress={handleDecrementPrice}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  <Ionicons name="remove" size={22} color="#191C1D" />
                </TouchableOpacity>

                <View style={styles.priceAdjusterPill}>
                  <Text style={styles.priceAdjusterValue}>
                    रू {offerPrice ? parseFloat(offerPrice).toFixed(0) : (selectedCategory === 'bike' ? '256' : '420')}
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.adjustPriceButton}
                  onPress={handleIncrementPrice}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  <Ionicons name="add" size={22} color="#191C1D" />
                </TouchableOpacity>
              </View>

              {/* Auto-accept Offers Switch */}
              <View style={styles.toggleRow}>
                <View style={styles.toggleTextContainer}>
                  <Ionicons name="flash" size={18} color="#B7102A" style={{ marginRight: 8 }} />
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

            {/* Secondary Vehicle Row (Clicking switches category automatically) */}
            {selectedCategory === 'bike' ? (
              <TouchableOpacity
                style={styles.secondaryVehicleCard}
                onPress={() => handleCategoryChange('car')}
                disabled={loading}
                activeOpacity={0.7}
              >
                <View style={styles.secondaryLeft}>
                  <Ionicons name="car-outline" size={24} color="#191C1D" style={{ marginRight: 12 }} />
                  <View>
                    <Text style={styles.secondaryTitle}>Ride Premium</Text>
                    <Text style={styles.secondarySub}>4 passengers • Comfortable</Text>
                  </View>
                </View>
                <Text style={styles.secondaryPrice}>
                  ~ रू {carFare !== null ? carFare.toFixed(0) : '420'}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.secondaryVehicleCard}
                onPress={() => handleCategoryChange('bike')}
                disabled={loading}
                activeOpacity={0.7}
              >
                <View style={styles.secondaryLeft}>
                  <FontAwesome5 name="motorcycle" size={20} color="#191C1D" style={{ marginRight: 12 }} />
                  <View>
                    <Text style={styles.secondaryTitle}>Moto</Text>
                    <Text style={styles.secondarySub}>1 passenger • No traffic, faster arrival</Text>
                  </View>
                </View>
                <Text style={styles.secondaryPrice}>
                  ~ रू {bikeFare !== null ? bikeFare.toFixed(0) : '256'}
                </Text>
              </TouchableOpacity>
            )}

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
          currentFare={selectedRideForRaise.fare}
          onRaiseFare={handleConfirmRaiseFare}
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
  topSearchCard: {
    position: 'absolute',
    top: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 64 : 108,
    left: 16,
    right: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
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
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
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
    paddingBottom: 24,
  },
  categoryTabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F5',
    borderRadius: 16,
    padding: 4,
    marginBottom: 16,
  },
  categoryTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  activeCategoryTab: {
    backgroundColor: '#B7102A',
    shadowColor: '#B7102A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  categoryTabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#191C1D',
  },
  activeCategoryTabText: {
    color: '#FFFFFF',
  },
  fareSelectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FFDAD8',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  activeVehicleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  activeVehicleInfo: {
    flex: 1,
  },
  activeVehicleTitle: {
    fontSize: 22,
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
    fontSize: 26,
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
    gap: 16,
    marginVertical: 10,
  },
  adjustPriceButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E4BEBC',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  priceAdjusterPill: {
    backgroundColor: '#F3F4F5',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 28,
    minWidth: 130,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceAdjusterValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#191C1D',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F3F4F5',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  toggleTextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#191C1D',
  },
  secondaryVehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  secondaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  secondaryTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#191C1D',
  },
  secondarySub: {
    fontSize: 12,
    color: '#8F6F6E',
    marginTop: 1,
  },
  secondaryPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#191C1D',
  },
  findDriverButton: {
    backgroundColor: '#B7102A',
    borderRadius: 16,
    height: 54,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#B7102A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
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
