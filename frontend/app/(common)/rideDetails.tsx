"use client"

import { View, Text, StyleSheet, Dimensions, TouchableOpacity, StatusBar, ScrollView, Alert, ActivityIndicator, Image } from "react-native"
import MapView, { Marker, Polyline } from 'react-native-maps'
import Icon from "react-native-vector-icons/MaterialIcons"
import ProfileImage from '../../components/ProfileImage';
import { useRouter, useLocalSearchParams } from "expo-router"
import { useState, useEffect, useRef } from "react"
import { rideService } from '../utils/rideService'
import { useUserRole } from '../utils/userRoleManager'
import AppModal from '../../components/ui/AppModal';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import Toast from '../../components/ui/Toast';
import { emitRideRemoved } from './rideHistory';
import { userRoleManager } from '../utils/userRoleManager';
import { locationService } from '../utils/locationService';

const { width, height } = Dimensions.get("window")

// Ride interface based on backend response
interface RideDetails {
  _id: string;
  passenger: {
    _id: string;
    firstName: string;
    lastName: string;
    mobile: string;
  };
  driver?: {
    _id: string;
    firstName: string;
    lastName: string;
    mobile: string;
    rating: number;
  };
  vehicleType: {
    _id: string;
    name: string;
    basePrice: number;
    pricePerKm: number;
  };
  pickUp?: {
    location: string;
    coords?: {
      type: string;
      coordinates: number[];
    };
  };
  dropOff?: {
    location: string;
    coords?: {
      type: string;
      coordinates: number[];
    };
  };
  pickUpLocation?: string;
  pickUpLat?: number;
  pickUpLng?: number;
  pickUpTime?: Date;
  dropOffLocation?: string;
  dropOffLat?: number;
  dropOffLng?: number;
  offerPrice: number;
  finalPrice?: number;
  status: 'pending' | 'accepted' | 'in-progress' | 'completed' | 'cancelled' | 'searching';
  comments?: string;
  createdAt: Date;
  updatedAt: Date;
  // Optional fields that might not be present
  estDistance?: {
    distance: {
      text: string; // "4.7 km"
      value: number; // 4700 (meters)
    };
    duration: {
      text: string; // "26 min"
      value: number; // 1560 (seconds)
    };
  };
  progress?: number;
  driverRating?: number;
  passengerRating?: number;
  driverProfile?: {
    vehicleMake: string;
    vehicleModel: string;
    vehicleColor: string;
    vehicleRegNum: string;
    rating: number;
    totalRides: number;
  };
}

const RideDetailsScreen = () => {
  const router = useRouter()
  const params = useLocalSearchParams()
  const rideId = params.rideId as string
  const userRole = useUserRole()

  const [rideDetails, setRideDetails] = useState<RideDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
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
  const [receiptModal, setReceiptModal] = useState<{ visible: boolean; type: 'success' | 'error' | 'info'; title: string; message: string; loading?: boolean }>({ visible: false, type: 'info', title: '', message: '', loading: false });
  const [routePolyline, setRoutePolyline] = useState<{ latitude: number; longitude: number }[]>([]);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const mapRef = useRef<MapView>(null);


  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' | 'info' }>({ visible: false, message: '', type: 'info' });
  const showToast = (message: string, type: 'success' | 'error' | 'info') => setToast({ visible: true, message, type });
  const hideToast = () => setToast(prev => ({ ...prev, visible: false }));

  const showModal = (type: 'success' | 'error' | 'info', title: string, message: string, actionText?: string, onAction?: (() => void)) => {
    setModal({ visible: true, type, title, message, actionText, onAction });
  };
  const hideModal = () => setModal((prev) => ({ ...prev, visible: false }));

  const showReceiptModal = (type: 'success' | 'error' | 'info', title: string, message: string, loading = false) => setReceiptModal({ visible: true, type, title, message, loading });
  const hideReceiptModal = () => setReceiptModal(prev => ({ ...prev, visible: false, loading: false }));

  // Extract string values from params (handle arrays) for fallback
  const getString = (val: string | string[] | undefined, defaultVal = "") =>
    Array.isArray(val) ? val[0] || defaultVal : val || defaultVal

  // Fallback data from params if API fails
  const fallbackData = {
    date: getString(params.date, "Unknown Date"),
    from: getString(params.from, "Unknown Location"),
    to: getString(params.to, "Unknown Location"),
    fare: getString(params.fare, "0"),
    driverName: getString(params.driverName, "Unknown Driver"),
    vehicle: getString(params.vehicle, "Unknown Vehicle"),
    vehicleNo: getString(params.vehicleNo, ""),
    status: getString(params.status, "completed"),
    passengerName: getString(params.passengerName, "Unknown Passenger"),
    rating: getString(params.rating, "0"),
    driverRating: getString(params.driverRating, "0"),
    pickupTime: getString(params.pickupTime, ""),
    dropoffTime: getString(params.dropoffTime, ""),
    duration: getString(params.duration, ""),
    distance: getString(params.distance, ""),
    pickupLat: getString(params.pickupLat, "27.7172"),
    pickupLng: getString(params.pickupLng, "85.324"),
    dropoffLat: getString(params.dropoffLat, "27.7089"),
    dropoffLng: getString(params.dropoffLng, "85.3206"),
    vehicleMake: getString(params.vehicleMake, ""),
    vehicleColor: getString(params.vehicleColor, ""),
  }

  const isDriver = userRole === "driver"

  // Use real data if available, otherwise fallback
  const rideData = rideDetails || fallbackData
  const isRealData = !!rideDetails

  // Format date for display
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString)
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    } catch {
      return dateString
    }
  }

  // Format time for display
  const formatTime = (dateString: string) => {
    try {
      const date = new Date(dateString)
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      })
    } catch {
      return dateString
    }
  }

  // Get person name based on role
  const getPersonName = () => {
    if (isRealData) {
      if (isDriver && rideDetails?.passenger) {
        return `${rideDetails.passenger.firstName} ${rideDetails.passenger.lastName}`.trim() || 'Unknown Passenger'
      } else if (!isDriver && rideDetails?.driver) {
        return `${rideDetails.driver.firstName} ${rideDetails.driver.lastName}`.trim() || 'Unknown Driver'
      } else if (!isDriver && !rideDetails?.driver) {
        return 'Driver Not Assigned'
      }
    }
    return isDriver ? fallbackData.passengerName : fallbackData.driverName
  }

  // Get person photo
  const getPersonPhoto = () => {
    // Photo property doesn't exist in the new interface, return null
    return null
  }

  // Get vehicle info
  const getVehicleInfo = () => {
    if (isRealData && rideDetails?.driverProfile) {
      return {
        make: rideDetails.driverProfile.vehicleMake,
        model: rideDetails.driverProfile.vehicleModel,
        color: rideDetails.driverProfile.vehicleColor,
        regNum: rideDetails.driverProfile.vehicleRegNum,
        rating: rideDetails.driverProfile.rating,
        totalRides: rideDetails.driverProfile.totalRides
      }
    }
    return {
      make: fallbackData.vehicle,
      model: fallbackData.vehicleMake || "",
      color: fallbackData.vehicleColor || "",
      regNum: fallbackData.vehicleNo,
      rating: parseFloat(fallbackData.driverRating || fallbackData.rating) || 0,
      totalRides: 0
    }
  }

  // Get locations
  const getLocations = () => {
    if (isRealData && rideDetails) {
      return {
        from: rideDetails.pickUpLocation || rideDetails.pickUp?.location || '',
        to: rideDetails.dropOffLocation || rideDetails.dropOff?.location || '',
        pickupLat: rideDetails.pickUpLat || rideDetails.pickUp?.coords?.coordinates?.[1] || 0,
        pickupLng: rideDetails.pickUpLng || rideDetails.pickUp?.coords?.coordinates?.[0] || 0,
        dropoffLat: rideDetails.dropOffLat || rideDetails.dropOff?.coords?.coordinates?.[1] || 0,
        dropoffLng: rideDetails.dropOffLng || rideDetails.dropOff?.coords?.coordinates?.[0] || 0
      }
    }
    return {
      from: fallbackData.from,
      to: fallbackData.to,
      pickupLat: parseFloat(fallbackData.pickupLat),
      pickupLng: parseFloat(fallbackData.pickupLng),
      dropoffLat: parseFloat(fallbackData.dropoffLat),
      dropoffLng: parseFloat(fallbackData.dropoffLng)
    }
  }

  // Get fare
  const getFare = () => {
    if (isRealData && rideDetails) {
      return rideDetails.offerPrice
    }
    return parseFloat(fallbackData.fare) || 0
  }

  // Get distance and duration
  const getDistanceDuration = () => {
    if (isRealData && rideDetails?.estDistance) {
      return {
        distance: rideDetails.estDistance.distance.text,
        duration: rideDetails.estDistance.duration.text
      }
    }
    return {
      distance: fallbackData.distance || "Unknown",
      duration: fallbackData.duration || "Unknown"
    }
  }

  // Get ride date
  const getRideDate = () => {
    if (isRealData && rideDetails?.createdAt) {
      return formatDate(rideDetails.createdAt.toString())
    }
    return fallbackData.date
  }

  // Get pickup and dropoff times
  const getTimes = () => {
    // startedAt and completedAt don't exist in the new interface, use fallback data
    return {
      pickup: fallbackData.pickupTime,
      dropoff: fallbackData.dropoffTime
    }
  }

  const locations = getLocations();
  const vehicleInfo = getVehicleInfo();
  const fare = getFare();
  const distanceDuration = getDistanceDuration();
  const rideDate = getRideDate();
  const times = getTimes();

  useEffect(() => {
    const fetchRideDetails = async () => {
      if (!rideId) {
        setError('Ride ID is required')
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)
      try {
        const rideData = await rideService.getRideDetails(rideId)

        if (rideData) {
          setRideDetails(rideData)
        } else {
         
          setRideDetails(null) 
        }
      } catch (err) {
        console.error('[RideDetails] Error fetching ride details:', err)
        setRideDetails(null)
      } finally {
        setLoading(false)
      }
    }

    fetchRideDetails()
  }, [rideId])

  useEffect(() => {
    const fetchRoute = async () => {
      setLoadingRoute(true);
      try {
        const origin = { lat: locations.pickupLat, lng: locations.pickupLng };
        const destination = { lat: locations.dropoffLat, lng: locations.dropoffLng };
        // Kathmandu Valley bounding box (approx):
        // North: 27.85, South: 27.60, West: 85.20, East: 85.55
        // Directions API does not support bounding box directly, but we can check if both points are inside
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
        const inAllowedArea = isInKathmandu(origin.lat, origin.lng) && isInKathmandu(destination.lat, destination.lng);
        if (!inAllowedArea) {
          setRoutePolyline([]);
          setLoadingRoute(false);
          return;
        }
        const route = await locationService.getRouteBetweenPoints(origin, destination);
        // Decode polyline
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
        setRoutePolyline(decodePolyline(route.polyline));
      } catch (e) {
        setRoutePolyline([]);
      }
      setLoadingRoute(false);
    };
    fetchRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations.pickupLat, locations.pickupLng, locations.dropoffLat, locations.dropoffLng]);

  const handleReceipt = async () => {
    showReceiptModal('info', 'Generating Receipt', 'Please wait while we generate your PDF receipt...', true);
    try {
      const locations = getLocations();
      const personName = getPersonName();
      const vehicleInfo = getVehicleInfo();
      const html = `
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body { font-family: 'Arial', sans-serif; margin: 0; padding: 24px; background: #fff; color: #222; }
              .header { text-align: center; margin-bottom: 24px; }
              .title { font-size: 22px; font-weight: bold; margin-bottom: 8px; }
              .subtitle { font-size: 16px; color: #666; margin-bottom: 16px; }
              .section { margin-bottom: 18px; }
              .row { display: flex; justify-content: space-between; margin-bottom: 8px; }
              .label { color: #888; font-size: 14px; }
              .value { font-weight: 500; font-size: 15px; }
              .fare { font-size: 20px; font-weight: bold; color: #075B5E; margin-top: 16px; }
              .footer { text-align: center; color: #aaa; font-size: 12px; margin-top: 32px; }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="title">Saathi Ride Receipt</div>
              <div class="subtitle">${getRideDate()}</div>
            </div>
            <div class="section">
              <div class="row"><span class="label">From</span><span class="value">${locations.from}</span></div>
              <div class="row"><span class="label">To</span><span class="value">${locations.to}</span></div>
              <div class="row"><span class="label">Distance</span><span class="value">${getDistanceDuration().distance}</span></div>
              <div class="row"><span class="label">Duration</span><span class="value">${getDistanceDuration().duration}</span></div>
            </div>
            <div class="section">
              <div class="row"><span class="label">Passenger</span><span class="value">${rideDetails?.passenger ? rideDetails.passenger.firstName + ' ' + rideDetails.passenger.lastName : ''}</span></div>
              <div class="row"><span class="label">Driver</span><span class="value">${rideDetails?.driver ? rideDetails.driver.firstName + ' ' + rideDetails.driver.lastName : ''}</span></div>
              <div class="row"><span class="label">Vehicle</span><span class="value">${vehicleInfo.make} ${vehicleInfo.model} ${vehicleInfo.regNum}</span></div>
            </div>
            <div class="fare">Fare: रू ${getFare().toFixed(0)}</div>
            <div class="footer">Thank you for riding with Saathi!</div>
          </body>
        </html>
      `;
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Share your ride receipt' });
        showReceiptModal('success', 'Receipt Shared', 'Your PDF receipt was shared successfully!', false);
      } else {
        showReceiptModal('success', 'Receipt Generated', 'PDF receipt generated and saved to your device.', false);
      }
    } catch (err) {
      showReceiptModal('error', 'Receipt Error', 'Failed to generate receipt. Please try again.', false);
    }
  };

  const handleBackPress = () => {
    router.back();
  };
  
  const handleSupport = () => {
    router.push("/support")
  }

  const handleRepeatRide = () => {
    router.push({
      pathname: "/(tabs)",
      params: {
        from: locations.from,
        to: locations.to,
        fare: fare.toString(),
        vehicle: rideDetails?.vehicleType?.name || "Ride",
        pickupLat: locations.pickupLat.toString(),
        pickupLng: locations.pickupLng.toString(),
        dropoffLat: locations.dropoffLat.toString(),
        dropoffLng: locations.dropoffLng.toString(),
      },
    })
  }

  const handleReturnRoute = () => {
    router.push({
      pathname: "/(tabs)",
      params: {
        from: locations.to,
        to: locations.from,
        fare: fare.toString(),
        vehicle: rideDetails?.vehicleType?.name || "Ride",
        pickupLat: locations.dropoffLat.toString(),
        pickupLng: locations.dropoffLng.toString(),
        dropoffLat: locations.pickupLat.toString(),
        dropoffLng: locations.pickupLng.toString(),
      },
    })
  }

  const handleRemoveFromHistory = async () => {
    try {
      await rideService.deleteRide(rideId);
      emitRideRemoved(rideId);
      showToast('Ride removed from history', 'success');
      setTimeout(() => router.back(), 600);
    } catch (err) {
        showToast('Ride not removed from history', 'error')
    }
  };

  // Show loading state
  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
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
          }}>
            <Icon name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Ride Details</Text>
          <View style={styles.roleIndicator}>
            <Text style={styles.roleText}>{userRole}</Text>
          </View>
        </View>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#075B5E" />
          <Text style={styles.loadingText}>Loading ride details...</Text>
        </View>
      </View>
    )
  }

  // Show error state
  if (error) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
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
          }}>
            <Icon name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Ride Details</Text>
          <View style={styles.roleIndicator}>
            <Text style={styles.roleText}>{userRole}</Text>
          </View>
        </View>
        <View style={styles.centerContainer}>
          <Icon name="error-outline" size={48} color="#F44336" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => window.location.reload()}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header with role indicator */}
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
          pointerEvents: 'auto',
          zIndex: 10,
        }}>
          <Icon name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{rideDate}</Text>
        <View style={styles.roleIndicator}>
          <Text style={styles.roleText}>{userRole}</Text>
        </View>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Map */}
        <View style={styles.mapContainer}>
          <MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={{
              latitude: locations.pickupLat,
              longitude: locations.pickupLng,
              latitudeDelta: Math.abs(locations.pickupLat - locations.dropoffLat) + 0.01,
              longitudeDelta: Math.abs(locations.pickupLng - locations.dropoffLng) + 0.01,
            }}
            showsUserLocation={false}
            showsMyLocationButton={false}
            scrollEnabled={true}
            zoomEnabled={true}
            pitchEnabled={true}
            rotateEnabled={true}
            pointerEvents="auto"
            minZoomLevel={12}
            maxZoomLevel={17}
            onRegionChangeComplete={(region) => {
              // Prevent panning outside Kathmandu Valley
              const lat = region.latitude;
              const lng = region.longitude;
              if (lat < 27.60 || lat > 27.85 || lng < 85.20 || lng > 85.55) {
                // Snap back to valley center
                mapRef.current?.animateToRegion({
                  latitude: 27.7172,
                  longitude: 85.324,
                  latitudeDelta: 0.1,
                  longitudeDelta: 0.1,
                }, 500);
              }
            }}
          >
            {/* Pickup Marker */}
            <Marker
              coordinate={{
                latitude: locations.pickupLat,
                longitude: locations.pickupLng,
              }}
              title="Pickup"
              pinColor="#2196F3"
            />
            {/* Dropoff Marker */}
            <Marker
              coordinate={{
                latitude: locations.dropoffLat,
                longitude: locations.dropoffLng,
              }}
              title="Dropoff"
              pinColor="#4CAF50"
            />
            {/* Route Polyline */}
            {routePolyline.length > 0 && (
              <Polyline
                coordinates={routePolyline}
                strokeColor="#2196F3"
                strokeWidth={4}
              />
            )}
          </MapView>
        </View>

        {/* Location Details */}
        {/* --- Vertical timeline for pickup/dropoff --- */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginHorizontal: 16, marginVertical: 16 }}>
          {/* Timeline dots and line */}
          <View style={{ alignItems: 'center', width: 24 }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#2196F3', marginBottom: 4 }} />
            <View style={{ width: 2, height: 32, backgroundColor: '#B0BEC5' }} />
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#4CAF50', marginTop: 4 }} />
          </View>
          {/* Location text */}
          <View style={{ flex: 1, justifyContent: 'space-between', height: 60 }}>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#000' }}>{locations.from}</Text>
              <Text style={{ fontSize: 14, color: '#666' }}>{times.pickup}</Text>
            </View>
            <View>
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#000' }}>{locations.to}</Text>
              <Text style={{ fontSize: 14, color: '#666' }}>{times.dropoff}</Text>
            </View>
          </View>
        </View>

        {/* Duration & Distance */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Icon name="schedule" size={16} color="#666" />
            <Text style={styles.statLabel}>Duration</Text>
            <Text style={styles.statValue}>{distanceDuration.duration}</Text>
          </View>
          <View style={styles.statItem}>
            <Icon name="straighten" size={16} color="#666" />
            <Text style={styles.statLabel}>Distance</Text>
            <Text style={styles.statValue}>{distanceDuration.distance}</Text>
          </View>
        </View>

        {/* Driver/Passenger Info - Changes based on role */}
        {/* --- Driver/Passenger info section --- */}
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2, marginVertical: 8, marginHorizontal: 16, padding: 16 }}>
          <ProfileImage
            photoUrl={getPersonPhoto()}
            size={60}
            showBorder={true}
            borderColor={isDriver ? '#075B5E' : '#fff'}
            fallbackIconColor={isDriver ? '#075B5E' : '#fff'}
            fallbackIconSize={24}
          />
          <View style={{ flex: 1, marginLeft: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#075B5E' }}>{getPersonName()}</Text>
            {isDriver ? (
              <Text style={{ fontSize: 14, color: '#666', marginBottom: 4 }}>Passenger</Text>
            ) : (
              <Text style={{ fontSize: 14, color: '#666', marginBottom: 4 }}>Driver</Text>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
              <Icon name="directions-car" size={16} color="#075B5E" style={{ marginRight: 6 }} />
              <Text style={{ fontSize: 15, color: '#333' }}>{vehicleInfo.make} {vehicleInfo.model} {vehicleInfo.regNum}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Icon name="star" size={16} color="#FFD700" style={{ marginRight: 6 }} />
              <Text style={{ fontSize: 15, color: '#333' }}>{vehicleInfo.rating > 0 ? vehicleInfo.rating.toFixed(1) : 'N/A'}</Text>
              {vehicleInfo.totalRides > 0 && (
                <Text style={{ fontSize: 15, color: '#888' }}> • {vehicleInfo.totalRides} rides</Text>
              )}
            </View>
          </View>
        </View>

        {/* Action Buttons - Different for driver vs passenger */}
        <View style={styles.actionButtonsContainer}>
          <TouchableOpacity style={styles.actionButton} onPress={handleReceipt}>
            <Icon name="receipt" size={24} color="#666" />
            <Text style={styles.actionButtonText}>Receipt</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={handleSupport}>
            <Icon name="support-agent" size={24} color="#666" />
            <Text style={styles.actionButtonText}>Support</Text>
          </TouchableOpacity>

          {/* Only show these for passengers */}
          {!isDriver && (
            <>
              <TouchableOpacity style={styles.actionButton} onPress={handleRepeatRide}>
                <Icon name="refresh" size={24} color="#666" />
                <Text style={styles.actionButtonText}>Repeat ride</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionButton} onPress={handleReturnRoute}>
                <Icon name="swap-horiz" size={24} color="#666" />
                <Text style={styles.actionButtonText}>Return route</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Payment Section - Changes text based on role */}
        <View style={styles.paymentSection}>
          <Text style={styles.paymentTitle}>{isDriver ? "Total earned" : "Total paid"}</Text>

          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>Fare</Text>
            <Text style={styles.paymentAmount}>रू {getFare().toFixed(0)}</Text>
          </View>

        </View>

        {/* Remove from History */}
        {/* --- Remove from history button --- */}
        <TouchableOpacity style={styles.removeButton} onPress={handleRemoveFromHistory}>
          <Text style={styles.removeButtonText}>Remove from history</Text>
        </TouchableOpacity>
        <Toast visible={toast.visible} message={toast.message} type={toast.type} onHide={hideToast} />
      </ScrollView>
      <AppModal
        visible={modal.visible}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        onClose={hideModal}
        actionText={modal.actionText}
        onAction={modal.onAction}
      />
      <AppModal
        visible={receiptModal.visible && (receiptModal.loading || receiptModal.type === 'error')}
        type={receiptModal.type}
        title={receiptModal.title}
        message={receiptModal.message}
        onClose={hideReceiptModal}
        actionText={!receiptModal.loading && receiptModal.type === 'error' ? 'Close' : undefined}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    paddingTop: 30,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: "#fff",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#000",
    flex: 1,
    textAlign: "center",
    marginLeft: -60, // Compensate for role indicator
  },
  roleIndicator: {
    backgroundColor: "#f0f9ff",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#075B5E",
  },
  roleText: {
    fontSize: 12,
    color: "#075B5E",
    fontWeight: "500",
  },
  scrollView: {
    flex: 1,
  },
  mapContainer: {
    height: 250,
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    marginVertical: 8,
    marginHorizontal: 16,
  },
  map: {
    flex: 1,
  },
  locationSection: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: "#fff",
    borderRadius: 14,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    marginVertical: 8,
    marginHorizontal: 16,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  blueDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#2196F3",
    marginRight: 12,
  },
  greenDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#4CAF50",
    marginRight: 12,
  },
  locationInfo: {
    flex: 1,
  },
  locationName: {
    fontSize: 16,
    color: "#000",
    fontWeight: "600",
    marginBottom: 2,
  },
  locationTime: {
    fontSize: 14,
    color: "#666",
  },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderRadius: 14,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    marginVertical: 8,
    marginHorizontal: 16,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 6,
  },
  statLabel: {
    fontSize: 14,
    color: "#666",
  },
  statValue: {
    fontSize: 14,
    color: "#000",
    fontWeight: "600",
  },
  personSection: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: "#fff",
    borderRadius: 14,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    marginVertical: 8,
    marginHorizontal: 16,
  },
  personAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#075B5E",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    overflow: "hidden",
  },
  driverAvatar: {
    backgroundColor: "#f0f0f0",
  },
  personImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  personDetails: {
    flex: 1,
  },
  personName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
    marginBottom: 4,
  },
  personSubtext: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  ratingText: {
    fontSize: 14,
    color: "#666",
    marginLeft: 4,
  },
  actionButtonsContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 20,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
    borderRadius: 14,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    marginVertical: 8,
    marginHorizontal: 16,
  },
  actionButton: {
    alignItems: "center",
    flex: 1,
  },
  actionButtonText: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
    textAlign: "center",
  },
  backButton: {
    padding: 8,
  },
  paymentSection: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
    borderRadius: 14,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    marginVertical: 8,
    marginHorizontal: 16,
  },
  paymentTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
    marginBottom: 12,
  },
  paymentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  paymentLabel: {
    fontSize: 14,
    color: "#666",
  },
  paymentAmount: {
    fontSize: 14,
    color: "#000",
    fontWeight: "600",
  },
  totalPaymentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  totalPaymentLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  totalPaymentLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#000",
  },
  totalPaymentAmount: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
  },
  removeButton: {
    alignItems: "center",
    paddingVertical: 16,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
    borderRadius: 14,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    marginVertical: 8,
    marginHorizontal: 16,
  },
  removeButtonText: {
    fontSize: 14,
    color: "#D32F2F",
    fontWeight: "500",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  loadingText: {
    fontSize: 16,
    color: "#666",
    marginTop: 12,
  },
  errorText: {
    fontSize: 16,
    color: "#F44336",
    textAlign: "center",
    marginTop: 12,
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: "#075B5E",
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
})

export default RideDetailsScreen
