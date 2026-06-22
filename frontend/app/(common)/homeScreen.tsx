"use client"

import { useState, useEffect } from "react"
import { View, Text, StyleSheet, TouchableOpacity } from "react-native"
import { useRouter } from "expo-router"
import { SafeAreaView } from "react-native-safe-area-context"
import { StatusBar } from "expo-status-bar"
import SidePanel from "./sidepanel"
import LocationSearch from '../../components/LocationSearch';
import { locationService } from '../utils/locationService';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { MaterialIcons } from '@expo/vector-icons'
import Toast from '../../components/ui/Toast';
import { useRef } from 'react';

export default function HomeScreen() {
  const router = useRouter()
  type LocationType = { coords: { latitude: number; longitude: number } } | null
  const [location, setLocation] = useState<LocationType>(null)
  const [errorMsg, setErrorMsg] = useState(null)
  const [sidePanelVisible, setSidePanelVisible] = useState(false)
  const [localRideInProgress, setLocalRideInProgress] = useState(false)
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' | 'info' }>({
    visible: false,
    message: '',
    type: 'info',
  });
  const showToast = (message: string, type: 'success' | 'error' | 'info') => setToast({ visible: true, message, type });
  const hideToast = () => setToast(prev => ({ ...prev, visible: false }));

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
  const [pickup, setPickup] = useState<string>('');
  const [dropoff, setDropoff] = useState<string>('');
  const [pickupPlace, setPickupPlace] = useState<any>(null);
  const [dropoffPlace, setDropoffPlace] = useState<any>(null);
  const [routePolyline, setRoutePolyline] = useState<{ latitude: number; longitude: number }[]>([]);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const mapRef = useRef<MapView>(null);

  // Mock location data - replace with real GPS when ready
  useEffect(() => {
    // TODO: Replace with actual location service when backend is ready
    // const getLocation = async () => {
    //   let { status } = await Location.requestForegroundPermissionsAsync();
    //   if (status !== 'granted') {
    //     showToast('Permission to access location was denied', 'error');
    //     return;
    //   }
    //   let location = await Location.getCurrentPositionAsync({});
    //   setLocation(location);
    // };
    // getLocation();

    // Mock location for now
    setLocation({
      coords: {
        latitude: 27.7172,
        longitude: 85.324,
      },
    })
  }, [])

  // Mock ride status check - replace with API call later
  useEffect(() => {
    // TODO: Replace with API call to check ride status
    // const checkRideStatus = async () => {
    //   try {
    //     const response = await fetch('/api/user/ride-status');
    //     const data = await response.json();
    //     setLocalRideInProgress(data.rideInProgress);
    //   } catch (error) {
    //     console.error('Error checking ride status:', error);
    //   }
    // };
    // checkRideStatus();

    // Mock data for now
    setLocalRideInProgress(false)
  }, [])

  useEffect(() => {
    const fetchRoute = async () => {
      if (!pickupPlace || !dropoffPlace) {
        setRoutePolyline([]);
        return;
      }
      setLoadingRoute(true);
      try {
        const origin = { lat: pickupPlace.location.lat, lng: pickupPlace.location.lng };
        const destination = { lat: dropoffPlace.location.lat, lng: dropoffPlace.location.lng };
        const inAllowedArea = isInKathmandu(origin.lat, origin.lng) && isInKathmandu(destination.lat, destination.lng);
        if (!inAllowedArea) {
          setRoutePolyline([]);
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
        setRoutePolyline(decodePolyline(route.polyline));
      } catch (e) {
        setRoutePolyline([]);
      }
      setLoadingRoute(false);
    };
    fetchRoute();
  }, [pickupPlace, dropoffPlace]);

  const openSidePanel = () => {
    setSidePanelVisible(true)
  }

  const closeSidePanel = () => {
    setSidePanelVisible(false)
  }

  const handleRoleChange = (newRole: "driver" | "passenger") => {
    if (newRole === "driver") {
      router.push("/(driver)")
    } else {
      router.push("/(tabs)")
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      {toast.visible && (
        <Toast visible={toast.visible} message={toast.message} type={toast.type} onHide={hideToast} />
      )}

      <View style={styles.mapContainer}>
        <TouchableOpacity style={styles.hamburgerButton} onPress={openSidePanel}>
          <View style={styles.hamburgerLine} />
          <View style={styles.hamburgerLine} />
          <View style={styles.hamburgerLine} />
        </TouchableOpacity>

        <View style={styles.searchContainer}>
          <LocationSearch
            placeholder="Pickup location"
            value={pickup}
            onChangeText={setPickup}
            onLocationSelect={setPickupPlace}
            boundingBox={KATHMANDU_BOUNDING_BOX}
          />
          <LocationSearch
            placeholder="Dropoff location"
            value={dropoff}
            onChangeText={setDropoff}
            onLocationSelect={setDropoffPlace}
            boundingBox={KATHMANDU_BOUNDING_BOX}
          />
        </View>

        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          initialRegion={{
            latitude: location?.coords.latitude || 27.7172,
            longitude: location?.coords.longitude || 85.324,
            latitudeDelta: 0.0922,
            longitudeDelta: 0.0421,
          }}
          minZoomLevel={12}
          maxZoomLevel={17}
          onRegionChangeComplete={(region) => {
            const lat = region.latitude;
            const lng = region.longitude;
            if (!isInKathmandu(lat, lng)) {
              mapRef.current?.animateToRegion({
                latitude: 27.7172,
                longitude: 85.324,
                latitudeDelta: 0.1,
                longitudeDelta: 0.1,
              }, 500);
            }
          }}
        >
          <Marker
            coordinate={{
              latitude: location?.coords.latitude || 27.7172,
              longitude: location?.coords.longitude || 85.324,
            }}
            title="Your Location"
          >
            <View style={styles.userMarker}>
              <MaterialIcons name="location-on" size={20} color="#4CAF50" />
            </View>
          </Marker>
          {pickupPlace && (
            <Marker
              coordinate={{
                latitude: pickupPlace.location.lat,
                longitude: pickupPlace.location.lng,
              }}
              title="Pickup"
              pinColor="#2196F3"
            />
          )}
          {dropoffPlace && (
            <Marker
              coordinate={{
                latitude: dropoffPlace.location.lat,
                longitude: dropoffPlace.location.lng,
              }}
              title="Dropoff"
              pinColor="#4CAF50"
            />
          )}
          {routePolyline.length > 0 && (
            <Polyline
              coordinates={routePolyline}
              strokeColor="#2196F3"
              strokeWidth={4}
            />
          )}
        </MapView>
      </View>

      {/* Welcome Message */}
      <View style={styles.welcomeContainer}>
        <Text style={styles.welcomeTitle}>Welcome!</Text>
        <Text style={styles.welcomeSubtitle}>{errorMsg ? errorMsg : "Choose your mode to get started"}</Text>

        <View style={styles.modeButtons}>
          <TouchableOpacity style={styles.modeButton} onPress={() => router.push("/(tabs)")}>
            <Text style={styles.modeButtonText}>🚗 Book a Ride</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.modeButton} onPress={() => router.push("/(driver)")}>
            <Text style={styles.modeButtonText}>👨‍💼 Drive & Earn</Text>
          </TouchableOpacity>
        </View>
      </View>

      <SidePanel
        visible={sidePanelVisible}
        onClose={closeSidePanel}
        role="passenger"
        rideInProgress={localRideInProgress}
        onChangeRole={handleRoleChange}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  mapContainer: {
    flex: 1,
    position: "relative",
  },
  hamburgerButton: {
    position: "absolute",
    top: 20,
    left: 20,
    zIndex: 10,
    backgroundColor: "white",
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  hamburgerLine: {
    width: 20,
    height: 2,
    backgroundColor: "#333",
    marginVertical: 2,
    borderRadius: 1,
  },
  map: {
    flex: 1,
  },
  searchContainer: {
    position: 'absolute',
    top: 100, // Adjust based on hamburger button height
    left: 20,
    right: 20,
    zIndex: 5,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  welcomeContainer: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#333",
    textAlign: "center",
    marginBottom: 8,
  },
  welcomeSubtitle: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 24,
  },
  modeButtons: {
    gap: 12,
  },
  modeButton: {
    backgroundColor: "#075B5E",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  modeButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  userMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
})
