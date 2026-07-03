"use client"

import { useState, useEffect, useRef } from "react"
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, ActivityIndicator, StatusBar, Platform, ScrollView, KeyboardAvoidingView, Animated, PanResponder } from "react-native"
import { TextInput } from "react-native-paper"
import Icon from "react-native-vector-icons/MaterialIcons"
import * as Location from 'expo-location'
import { useRouter, useLocalSearchParams } from "expo-router"
import SidePanel from "../(common)/sidepanel"
import Toast from "../../components/ui/Toast"
import LocationSearch from "../../components/LocationSearch"
import RaiseFareModal from "../../components/ui/RaiseFareModal"
import { locationService, LocationData, GoogleMapsPlace } from "../utils/locationService"
import { rideService, VehicleType, RideRequest } from "../utils/rideService"
import { userRoleManager, useUserRole } from "../utils/userRoleManager"
import MapView, { Marker, PROVIDER_GOOGLE, Polyline } from 'react-native-maps'
import MaterialIcons from "react-native-vector-icons/MaterialIcons"

const { width, height } = Dimensions.get("window")
const MAP_HEIGHT = height * 0.4;

const PassengerHomeScreen = () => {
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

  // Sliding bottom sheet state and animation
  const collapsedVal = height * 0.45;
  const expandedVal = 0;
  const sheetY = useRef(new Animated.Value(collapsedVal)).current;
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpand = (expand: boolean) => {
    setIsExpanded(expand);
    Animated.spring(sheetY, {
      toValue: expand ? expandedVal : collapsedVal,
      useNativeDriver: true, // Hardware accelerated translateY (smooth GPU transitions, no flickering)
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
        // Allow dragging but clamp it within range (0 to height * 0.8)
        const clampedVal = Math.max(0, Math.min(height * 0.8, newVal));
        sheetY.setValue(clampedVal);
      },
      onPanResponderRelease: (evt, gestureState) => {
        // Snapping based on velocity (swipe speed)
        if (gestureState.vy < -0.5) {
          toggleExpand(true);
        } else if (gestureState.vy > 0.5) {
          toggleExpand(false);
        } 
        // Snapping based on position (halfway threshold)
        else {
          const currentY = (isExpanded ? expandedVal : collapsedVal) + gestureState.dy;
          const halfway = collapsedVal / 2;
          if (currentY < halfway) {
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
  };

  const handleIncrementPrice = () => {
    const currentPrice = parseFloat(offerPrice) || 0;
    const newPrice = currentPrice + 10;
    setOfferPrice(newPrice.toString());
  };

  const handleDecrementPrice = () => {
    const currentPrice = parseFloat(offerPrice) || 0;
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

  // --- STATE FOR RAISE FARE MODAL ---
  const [showRaiseFareModal, setShowRaiseFareModal] = useState(false);
  const [raiseFareLoading, setRaiseFareLoading] = useState(false); 

  // Initialize location and vehicle types
  useEffect(() => {
    initializeApp();
  }, []);

  // Handle URL parameters for repeat/return rides
  useEffect(() => {
    const handleUrlParameters = async () => {
      console.log('Handling URL parameters, setting isSettingUpFromUrl to true');
      setIsSettingUpFromUrl(true);
      
      // Check if we have URL parameters
      const hasParams = !!(from && to && vehicle && fare);
      setHasUrlParameters(hasParams);
      console.log('Has URL parameters:', hasParams);
      
      // Handle pickup and destination locations from URL params
      if (from && to) {
        setPickupLocation(getString(from));
        setDestinationLocation(getString(to));
        
        // Set coordinates if provided
        if (pickupLat && pickupLng) {
          const coords = { 
            lat: parseFloat(getString(pickupLat)), 
            lng: parseFloat(getString(pickupLng)) 
          };
          setPickupCoords(coords);
        }
        
        if (dropoffLat && dropoffLng) {
          const coords = { 
            lat: parseFloat(getString(dropoffLat)), 
            lng: parseFloat(getString(dropoffLng)) 
          };
          setDestinationCoords(coords);
        }
      }

      // Handle vehicle type from URL params
      if (vehicle && vehicleTypes.length > 0) {
        const vehicleName = getString(vehicle);
        const matchingVehicle = vehicleTypes.find(vt => 
          vt.name.toLowerCase().includes(vehicleName.toLowerCase()) ||
          vehicleName.toLowerCase().includes(vt.name.toLowerCase())
        );
        if (matchingVehicle) {
          setSelectedVehicleType(matchingVehicle);
          const isBike = matchingVehicle.name.toLowerCase().includes('bike') || 
                         matchingVehicle.name.toLowerCase().includes('moto') || 
                         matchingVehicle.name.toLowerCase().includes('motorcycle');
          setSelectedCategory(isBike ? 'bike' : 'car');
        }
      }

      // Handle fare from URL params
      if (fare) {
        const fareValue = getString(fare);
        console.log('Setting fare from URL:', fareValue);
        setOfferPrice(fareValue);
      }
      
      // Reset the flag after a short delay to allow state updates to complete
      setTimeout(() => {
        console.log('Resetting isSettingUpFromUrl to false');
        setIsSettingUpFromUrl(false);
      }, 1000);
    };

    // Only run after vehicle types are loaded
    if (vehicleTypes.length > 0) {
      handleUrlParameters();
    }
  }, [from, to, vehicle, fare, pickupLat, pickupLng, dropoffLat, dropoffLng, vehicleTypes]);

  const initializeApp = async () => {
    try {
      // Get current location
      const location = await locationService.getCurrentLocation();
      setCurrentLocation(location);

      // Kathmandu bounding box
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

      // Set pickup location to current location name if in Kathmandu, else default to Kathmandu
      // Only if no pickup location is already set from URL parameters
      if (!pickupLocation || pickupLocation === '') {
        if (location && isInKathmandu(location.latitude, location.longitude)) {
          try {
            const address = await locationService.getAddressFromCoordinates(location.latitude, location.longitude);
            setPickupLocation(address);
          } catch {
            setPickupLocation('Current Location');
          }
          setPickupCoords({ lat: location.latitude, lng: location.longitude });
        } else {
          setPickupLocation('Kathmandu');
          setPickupCoords({ lat: 27.7172, lng: 85.324 });
        }
      }

      // Get vehicle types from API
      const types = await rideService.getVehicleTypes();
      console.log('Fetched vehicle types:', types);
      // Map backend fields to frontend expected fields
      let mappedTypes = types.map(t => ({
        ...t,
        basePrice: (t as any).pricingBase ?? t.basePrice,
        pricePerKm: (t as any).pricingPerKm ?? t.pricePerKm,
      }));
      // Fallback mock types if database is empty
      if (mappedTypes.length === 0) {
        mappedTypes = [
          {
            _id: '507f1f77bcf86cd799439011',
            name: 'Bike',
            description: 'No traffic, lower prices',
            basePrice: 50,
            pricePerKm: 15,
            isActive: true,
          },
          {
            _id: '507f1f77bcf86cd799439012',
            name: 'Car',
            description: 'Affordable fares',
            basePrice: 150,
            pricePerKm: 35,
            isActive: true,
          }
        ];
      }
      setVehicleTypes(mappedTypes);
      
      if (mappedTypes.length > 0 && !selectedVehicleType) {
        const defaultVT = getVehicleTypeByCategory('bike', mappedTypes);
        if (defaultVT) {
          setSelectedVehicleType(defaultVT);
        }
      }

      // Start location tracking for passenger
      try {
        await locationService.startLocationTracking((newLocation) => {
          setCurrentLocation(newLocation);
          setPickupLocation(prev => {
            if (!prev || prev === '' || prev === 'Current Location' || prev === 'Kathmandu') {
              if (isInKathmandu(newLocation.latitude, newLocation.longitude)) {
                locationService.getAddressFromCoordinates(newLocation.latitude, newLocation.longitude)
                  .then(address => setPickupLocation(address))
                  .catch(() => setPickupLocation('Current Location'));
                return prev;
              } else {
                setPickupLocation('Kathmandu');
                setPickupCoords({ lat: 27.7172, lng: 85.324 });
                return 'Kathmandu';
              }
            }
            return prev;
          });
          // Only update coordinates if no specific pickup coordinates are set from URL parameters
          if (!pickupCoords || (pickupCoords.lat === 27.7172 && pickupCoords.lng === 85.324)) {
            setPickupCoords({ lat: newLocation.latitude, lng: newLocation.longitude });
          }
        }, {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 30000,
          distanceInterval: 50,
          role: 'passenger'
        });
      } catch (err) {
        showToast('Location tracking error: ' + ((err as any)?.message || 'Unknown error'), 'error');
      }

    } catch (error) {
      showToast('Location error: ' + ((error as any)?.message || 'Unknown error'), 'error');
    }
  };

  // Handle pickup location selection
  const handlePickupLocationSelect = (place: GoogleMapsPlace) => {
    setPickupLocation(place.name);
    // Use actual coordinates from the place data
    if (place.location) {
      setPickupCoords({ lat: place.location.lat, lng: place.location.lng });
    } else {
      // Fallback coordinates
      setPickupCoords({ lat: 27.7172, lng: 85.324 });
    }
    setRoutePolyline([]);
  };

  // Handle destination location selection
  const handleDestinationLocationSelect = (place: GoogleMapsPlace) => {
    setDestinationLocation(place.name);
    // Use actual coordinates from the place data
    if (place.location) {
      setDestinationCoords({ lat: place.location.lat, lng: place.location.lng });
    } else {
      // Fallback coordinates
      setDestinationCoords({ lat: 27.7089, lng: 85.3206 });
    }
    setRoutePolyline([]);
  };

  // --- MODIFIED CALCULATE FARE ---
  const calculateEstimatedFare = async () => {
    // Skip fare calculation if we have URL parameters (repeat/return ride)
    if (hasUrlParameters) {
      return;
    }

    if (!pickupLocation || !destinationLocation) {
      console.log('Missing required data for fare calculation:', {
        pickupLocation,
        destinationLocation
      });
      showToast('Select pickup and dropoff locations', 'info');
      return;
    }

    try {
      console.log('Calculating fare with:', {
        pickupLocation,
        destinationLocation,
        pickupCoords,
        destinationCoords
      });

      const distanceData = await locationService.calculateDistance(
        pickupLocation, 
        destinationLocation,
        pickupCoords || undefined,
        destinationCoords || undefined
      );
      
      console.log('Distance calculation result:', distanceData);
      
      if (distanceData) {
        const distanceInKm = distanceData.distance.value / 1000;
        console.log('Distance for fare calculation:', distanceInKm);
        
        const bikeVT = getVehicleTypeByCategory('bike', vehicleTypes);
        const carVT = getVehicleTypeByCategory('car', vehicleTypes);
        
        let calculatedBikeFare = 0;
        let calculatedCarFare = 0;
        
        if (bikeVT) {
          calculatedBikeFare = rideService.calculateEstimatedFare(distanceInKm, bikeVT);
          setBikeFare(calculatedBikeFare);
        }
        
        if (carVT) {
          calculatedCarFare = rideService.calculateEstimatedFare(distanceInKm, carVT);
          setCarFare(calculatedCarFare);
        }
        
        const estimatedFare = selectedCategory === 'bike' ? calculatedBikeFare : calculatedCarFare;
        console.log('Estimated fare calculated for active category:', {
          category: selectedCategory,
          fare: estimatedFare
        });
        
        if (estimatedFare > 0) {
          setOfferPrice(estimatedFare.toString());
        }
      } else {
        showToast('Could not calculate distance for fare', 'error');
      }
    } catch (error) {
      showToast('Error calculating fare: ' + ((error as any)?.message || 'Unknown error'), 'error');
    }
  };

  useEffect(() => {
    if (selectedCategory === 'bike' && bikeFare !== null) {
      setOfferPrice(bikeFare.toString());
    } else if (selectedCategory === 'car' && carFare !== null) {
      setOfferPrice(carFare.toString());
    }
  }, [selectedCategory, bikeFare, carFare]);

  // --- RAISE FARE HANDLERS ---
  const handleRaiseFare = () => {
    setShowRaiseFareModal(true);
  };

  const handleRaiseFareSend = async (proposedFare: number) => {
    setRaiseFareLoading(true);
    try {
      // Update the offer price with the proposed fare
      setOfferPrice(proposedFare.toString());
      setShowRaiseFareModal(false);
      showToast('Fare raised successfully!', 'success');
    } catch (error) {
      showToast('Failed to raise fare', 'error');
    } finally {
      setRaiseFareLoading(false);
    }
  };

  // Create ride request
  const handleCreateRide = async () => {
    if (!pickupLocation.trim()) {
      showToast('Please select pickup location', 'error');
      return;
    }

    if (!destinationLocation.trim()) {
      showToast('Please select destination', 'error');
      return;
    }

    if (!selectedVehicleType) {
      showToast('Please select a vehicle type', 'error');
      return;
    }

    if (!pickupCoords || !destinationCoords) {
      showToast('Please select valid locations', 'error');
      return;
    }

    // Check if pickup and destination are the same location
    const pickupLat = Number(pickupCoords.lat);
    const pickupLng = Number(pickupCoords.lng);
    const destLat = Number(destinationCoords.lat);
    const destLng = Number(destinationCoords.lng);
    
    // Calculate distance between pickup and destination using Haversine formula
    const R = 6371; // Earth's radius in kilometers
    const dLat = (destLat - pickupLat) * Math.PI / 180;
    const dLng = (destLng - pickupLng) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(pickupLat * Math.PI / 180) * Math.cos(destLat * Math.PI / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    
    if (distance < 0.1) {
      showToast('You cannot have the same pickup and dropoff location', 'error');
      return;
    }
    
    if (pickupLocation.toLowerCase().trim() === destinationLocation.toLowerCase().trim()) {
      showToast('You cannot have the same pickup and dropoff location', 'error');
      return;
    }


    setLoading(true);
    showToast('Creating ride request...', 'info');

    try {
      // Ensure coordinates are valid numbers
      const pickUpLat = Number(pickupCoords.lat);
      const pickUpLng = Number(pickupCoords.lng);
      const dropOffLat = Number(destinationCoords.lat);
      const dropOffLng = Number(destinationCoords.lng);

      // Validate coordinates
      if (isNaN(pickUpLat) || isNaN(pickUpLng) || isNaN(dropOffLat) || isNaN(dropOffLng)) {
        showToast('Invalid coordinates. Please select valid locations.', 'error');
        return;
      }

      if (pickUpLat < -90 || pickUpLat > 90 || dropOffLat < -90 || dropOffLat > 90) {
        showToast('Invalid latitude values. Must be between -90 and 90.', 'error');
        return;
      }

      if (pickUpLng < -180 || pickUpLng > 180 || dropOffLng < -180 || dropOffLng > 180) {
        showToast('Invalid longitude values. Must be between -180 and 180.', 'error');
        return;
      }

      const rideData: RideRequest = {
        vehicleType: selectedVehicleType._id,
        pickUpLocation: pickupLocation,
        pickUpLat: pickUpLat,
        pickUpLng: pickUpLng,
        dropOffLocation: destinationLocation,
        dropOffLat: dropOffLat,
        dropOffLng: dropOffLng,
        offerPrice: Math.round(parseFloat(offerPrice) * 100) / 100, // Use current offer price
      };

      console.log('Creating ride with data:', {
        vehicleType: rideData.vehicleType,
        pickUpLocation: rideData.pickUpLocation,
        pickUpLat: rideData.pickUpLat,
        pickUpLng: rideData.pickUpLng,
        dropOffLocation: rideData.dropOffLocation,
        dropOffLat: rideData.dropOffLat,
        dropOffLng: rideData.dropOffLng,
        offerPrice: rideData.offerPrice,
        pickupCoordsType: typeof pickupCoords.lat,
        destinationCoordsType: typeof destinationCoords.lat,
      });

      const ride = await rideService.createRide(rideData);
      
      if (ride) {
        showToast('Ride request created successfully!', 'success');
        setTimeout(() => {
          router.push({
            pathname: "/(tabs)/rideOffers",
            params: { 
              rideId: ride._id,
              from: pickupLocation,
              to: destinationLocation,
              fare: parseFloat(offerPrice).toFixed(0),
              vehicle: selectedVehicleType.name,
            },
          });
        }, 1500);
      } else {
        showToast('Failed to create ride request', 'error');
      }
    } catch (error: any) {
      let errorMessage = 'Failed to create ride request';
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }
      showToast(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    let timer: number
    if (localRideInProgress && progress < 100) {
      timer = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            clearInterval(timer)
            setTimeout(() => {
              router.push({
                pathname: "/rideRate",
                params: {
                  driverName: localDriverName,
                  from: pickupLocation,
                  to: destinationLocation,
                  fare: parseFloat(offerPrice).toFixed(0),
                  vehicle: selectedVehicleType?.name || 'Ride',
                },
              })
            }, 1000)
            return 100
          }
          return prev + 5
        })
      }, 1000)
    }
    return () => clearInterval(timer)
  }, [localRideInProgress, progress])

  const handleRoleChange = (newRole: "driver" | "passenger") => {
    if (newRole === "driver") {
      router.push("/(driver)")
    }
  }

  const openRideTracking = () => {
          router.push({
        pathname: "../(common)/rideTracker",
        params: {
          driverName: localDriverName,
          from: pickupLocation,
          to: destinationLocation,
          fare: parseFloat(offerPrice).toFixed(0),
          vehicle: selectedVehicleType?.name || 'Ride',
          rideInProgress: localRideInProgress.toString(),
          progress: progress.toString(),
        },
      })
  }

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
  const [routePolyline, setRoutePolyline] = useState<{ latitude: number; longitude: number }[]>([]);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const mapRef = useRef<MapView>(null);

  // Fetch route polyline when both pickup and dropoff are set
  useEffect(() => {
    const fetchRoute = async () => {
      if (!pickupCoords || !destinationCoords) {
        setRoutePolyline([]);
        return;
      }
      // Check if both are in allowed areas
      const inAllowedArea = isInKathmandu(pickupCoords.lat, pickupCoords.lng) && isInKathmandu(destinationCoords.lat, destinationCoords.lng);
      if (!inAllowedArea) {
        setRoutePolyline([]);
        return;
      }
      setLoadingRoute(true);
      try {
        const route = await locationService.getRouteBetweenPoints(
          { lat: pickupCoords.lat, lng: pickupCoords.lng },
          { lat: destinationCoords.lat, lng: destinationCoords.lng }
        );
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
        // Optionally fit map to route
        if (mapRef.current && routePolyline.length > 0) {
          const allCoords = [
            { latitude: pickupCoords.lat, longitude: pickupCoords.lng },
            { latitude: destinationCoords.lat, longitude: destinationCoords.lng },
            ...decodePolyline(route.polyline)
          ];
          mapRef.current.fitToCoordinates(allCoords, { edgePadding: { top: 80, bottom: 80, left: 40, right: 40 }, animated: true });
        }
      } catch (e) {
        setRoutePolyline([]);
      }
      setLoadingRoute(false);
    };
    fetchRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickupCoords, destinationCoords]);

  // Auto-recalculate fare when vehicle type, pickup, or dropoff changes and all are set
  useEffect(() => {
    console.log('Auto-recalculate useEffect triggered:', {
      selectedVehicleType: selectedVehicleType?.name,
      pickupCoords: !!pickupCoords,
      destinationCoords: !!destinationCoords,
      hasUrlParameters
    });
    
    if (selectedVehicleType && pickupCoords && destinationCoords) {
      console.log('Auto-recalculating fare...');
      calculateEstimatedFare();
    } else {
      console.log('Skipping auto-recalculation because:', {
        noVehicleType: !selectedVehicleType,
        noPickupCoords: !pickupCoords,
        noDestinationCoords: !destinationCoords
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVehicleType, pickupCoords, destinationCoords]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

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
          {currentLocation && (
            <Marker
              coordinate={{
                latitude: currentLocation.latitude,
                longitude: currentLocation.longitude,
              }}
              title="Your Location"
              description="This is your current location"
            >
              <View style={styles.userMarker}>
                <MaterialIcons name="location-on" size={20} color="#4CAF50" />
              </View>
            </Marker>
          )}
          {pickupCoords && (
            <Marker
              coordinate={{ latitude: pickupCoords.lat, longitude: pickupCoords.lng }}
              title="Pickup"
              pinColor="#075B5E"
            />
          )}
          {destinationCoords && (
            <Marker
              coordinate={{ latitude: destinationCoords.lat, longitude: destinationCoords.lng }}
              title="Dropoff"
              pinColor="#EA2F14"
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

      <Animated.View 
        style={[
          styles.bottomSheetWrapper,
          { 
            transform: [{ translateY: sheetY }] 
          }
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
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
          style={{ flex: 1 }}
          pointerEvents="box-none"
        >

          <ScrollView 
            style={styles.bottomSheet}
            contentContainerStyle={[styles.bottomSheetContent, { paddingBottom: 32, flexGrow: 1 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            pointerEvents="auto"
          >
          {/* Category Tabs: Bike & Car */}
          <View style={styles.categoryTabContainer}>
            <TouchableOpacity
              style={[
                styles.categoryTab,
                selectedCategory === 'bike' && styles.activeCategoryTab
              ]}
              onPress={() => handleCategoryChange('bike')}
              disabled={loading}
            >
              <Icon 
                name="motorcycle" 
                size={22} 
                color={selectedCategory === 'bike' ? '#fff' : '#666'} 
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
            >
              <Icon 
                name="directions-car" 
                size={22} 
                color={selectedCategory === 'car' ? '#fff' : '#666'} 
              />
              <Text style={[
                styles.categoryTabText,
                selectedCategory === 'car' && styles.activeCategoryTabText
              ]}>
                Car
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.inputSection}>
            <View style={styles.inputRow}>
              <LocationSearch
                placeholder="From (Pickup Location)"
                value={pickupLocation}
                onChangeText={setPickupLocation}
                onLocationSelect={handlePickupLocationSelect}
                iconColor="#075B5E"
                disabled={loading}
                boundingBox={KATHMANDU_BOUNDING_BOX}
              />
            </View>

            <View style={styles.inputRow}>
              <LocationSearch
                placeholder="To (Destination)"
                value={destinationLocation}
                onChangeText={setDestinationLocation}
                onLocationSelect={handleDestinationLocationSelect}
                iconColor="#EA2F14"
                disabled={loading}
                boundingBox={KATHMANDU_BOUNDING_BOX}
              />
            </View>

          </View>

          {/* Interactive Fare Card (only when pickup and destination coordinates are set) */}
          {pickupCoords && destinationCoords ? (
            <View style={styles.fareSelectionCard}>
              {/* Selected Vehicle Info Header */}
              <View style={styles.activeVehicleHeader}>
                <View style={styles.activeVehicleInfo}>
                  <Text style={styles.activeVehicleTitle}>
                    {selectedCategory === 'bike' ? 'Moto' : 'Ride'}
                  </Text>
                  <View style={styles.activeVehicleMeta}>
                    <Icon name="person" size={14} color="#666" />
                    <Text style={styles.activeVehicleCapacity}>
                      {selectedCategory === 'bike' ? '1' : '4'}
                    </Text>
                    <Text style={styles.activeVehicleDot}>•</Text>
                    <Text style={styles.activeVehicleDesc}>
                      {selectedCategory === 'bike' ? 'No traffic, lower prices' : 'Affordable fares'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Price Adjuster Widget */}
              <View style={styles.priceAdjusterContainer}>
                <TouchableOpacity 
                  style={styles.adjustPriceButton} 
                  onPress={handleDecrementPrice}
                  disabled={loading}
                >
                  <Icon name="remove" size={24} color="#075B5E" />
                </TouchableOpacity>

                <View style={styles.priceAdjusterPill}>
                  <Text style={styles.priceAdjusterCurrency}>रू</Text>
                  <Text style={styles.priceAdjusterValue}>
                    {offerPrice ? parseFloat(offerPrice).toFixed(0) : '---'}
                  </Text>
                </View>

                <TouchableOpacity 
                  style={styles.adjustPriceButton} 
                  onPress={handleIncrementPrice}
                  disabled={loading}
                >
                  <Icon name="add" size={24} color="#075B5E" />
                </TouchableOpacity>
              </View>

              <Text style={styles.recommendedFareLabel}>
                Recommended fare: रू {selectedCategory === 'bike' ? (bikeFare ? bikeFare.toFixed(0) : '---') : (carFare ? carFare.toFixed(0) : '---')}
              </Text>

              {/* Alternative Options List */}
              <View style={styles.alternativeContainer}>
                {selectedCategory === 'bike' && carFare !== null && (
                  <TouchableOpacity 
                    style={styles.alternativeRow}
                    onPress={() => handleCategoryChange('car')}
                    disabled={loading}
                  >
                    <View style={styles.alternativeLeft}>
                      <Icon name="directions-car" size={20} color="#666" />
                      <View style={styles.alternativeTexts}>
                        <Text style={styles.alternativeTitle}>Ride</Text>
                        <Text style={styles.alternativeSub}>4 passengers • Affordable fares</Text>
                      </View>
                    </View>
                    <Text style={styles.alternativePrice}>~रू {carFare.toFixed(0)}</Text>
                  </TouchableOpacity>
                )}

                {selectedCategory === 'car' && bikeFare !== null && (
                  <TouchableOpacity 
                    style={styles.alternativeRow}
                    onPress={() => handleCategoryChange('bike')}
                    disabled={loading}
                  >
                    <View style={styles.alternativeLeft}>
                      <Icon name="motorcycle" size={20} color="#666" />
                      <View style={styles.alternativeTexts}>
                        <Text style={styles.alternativeTitle}>Moto</Text>
                        <Text style={styles.alternativeSub}>1 passenger • No traffic, lower prices</Text>
                      </View>
                    </View>
                    <Text style={styles.alternativePrice}>~रू {bikeFare.toFixed(0)}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Auto-accept Toggle Row */}
              <View style={styles.toggleRow}>
                <View style={styles.toggleTextContainer}>
                  <Icon name="near-me" size={18} color="#075B5E" style={{ marginRight: 8 }} />
                  <Text style={styles.toggleLabel}>
                    Auto-accept offer of रू {offerPrice ? parseFloat(offerPrice).toFixed(0) : '---'}
                  </Text>
                </View>
                <TouchableOpacity 
                  onPress={() => setAutoAccept(!autoAccept)}
                  style={[
                    styles.switchTrack,
                    autoAccept ? styles.switchTrackActive : styles.switchTrackInactive
                  ]}
                >
                  <View style={[
                    styles.switchThumb,
                    autoAccept ? styles.switchThumbActive : styles.switchThumbInactive
                  ]} />
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.findDriverButton, { marginBottom: 32 }, loading && styles.buttonDisabled]}
            onPress={handleCreateRide}
            disabled={loading}
          >
            <View style={styles.buttonContent}>
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.buttonText}>
                  Find a driver
                </Text>
              )}
            </View>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Animated.View>

    {/* Hamburger menu button layered at root level */}
    {!sidePanelVisible && (
      <TouchableOpacity style={styles.hamburgerButton} onPress={() => setSidePanelVisible(true)}>
        <Icon name="menu" size={24} color="#333" />
      </TouchableOpacity>
    )}

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

      <SidePanel
        visible={sidePanelVisible}
        onClose={() => setSidePanelVisible(false)}
        role="passenger"
        rideInProgress={localRideInProgress}
        onChangeRole={handleRoleChange}
      />

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={hideToast}
      />

      <RaiseFareModal
        visible={showRaiseFareModal}
        onClose={() => setShowRaiseFareModal(false)}
        onSend={handleRaiseFareSend}
        calculatedFare={parseFloat(offerPrice) || 0}
        loading={raiseFareLoading}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  mapAbsoluteContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
  hamburgerButton: {
    position: "absolute",
    top: 50,
    left: 16,
    zIndex: 2000,
    backgroundColor: "#fff",
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    elevation: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  map: {
    flex: 1,
    width: width,
  },
  bottomSheetWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: height * 0.88,
    backgroundColor: "#fff",
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    elevation: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    zIndex: 2,
  },
  bottomSheet: {
    backgroundColor: "transparent",
    flex: 1,
  },
  dragHandleContainer: {
    alignItems: 'center',
    paddingVertical: 14,
    backgroundColor: 'transparent',
    width: '100%',
    zIndex: 3,
  },
  dragHandle: {
    width: 44,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#E0E0E0',
  },
  bottomSheetContent: {
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  vehicleContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  vehicleOption: {
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    minWidth: 80,
  },
  selectedVehicle: {
    backgroundColor: "#f0f9ff",
  },
  vehicleIconContainer: {
    position: "relative",
    marginBottom: 8,
  },
  passengerBadge: {
    position: "absolute",
    top: -8,
    right: -8,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    borderRadius: 10,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  passengerCount: {
    fontSize: 10,
    color: "#666",
    marginLeft: 2,
  },
  vehicleName: {
    fontSize: 12,
    color: "#333",
    textAlign: "center",
  },
  inputSection: {
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  searchIcon: {
    marginRight: 16,
  },
  rupeeSymbol: {
    fontSize: 18,
    color: "#333",
    marginRight: 16,
    fontWeight: "500",
  },
  locationInput: {
    flex: 1,
    backgroundColor: "transparent",
    fontSize: 16,
  },
  fareInput: {
    flex: 1,
    backgroundColor: "transparent",
    fontSize: 16,
  },
  inputDisabled: {
    opacity: 0.5,
  },
  inputContent: {
    paddingHorizontal: 0,
  },
  findDriverButton: {
    backgroundColor: "#075B5E",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  miniPlayer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#075B5E",
    paddingHorizontal: 20,
    paddingVertical: 25,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    zIndex: 1000,
  },
  miniPlayerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  miniPlayerInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  miniPlayerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  miniPlayerText: {
    flex: 1,
  },
  miniPlayerTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
  },
  miniPlayerSubtitle: {
    color: "#B8E6E8",
    fontSize: 12,
  },
  miniPlayerActions: {
    alignItems: "center",
    gap: 8,
  },
  progressIndicator: {
    width: 40,
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#fff",
    borderRadius: 2,
  },
  calculateButton: {
    backgroundColor: "#075B5E",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  calculateButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  userMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  priceSection: {
    marginVertical: 16,
    paddingHorizontal: 4,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8f9fa',
    borderRadius: 16,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  pricePill: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginRight: 12,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  priceText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#075B5E',
    textAlign: 'center',
  },
  raiseFareButton: {
    backgroundColor: '#075B5E',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#075B5E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  raiseFareButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Redesigned components styles
  categoryTabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F5F5F5',
    borderRadius: 14,
    padding: 4,
    marginBottom: 20,
  },
  categoryTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  activeCategoryTab: {
    backgroundColor: '#075B5E',
    shadowColor: '#075B5E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  categoryTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  activeCategoryTabText: {
    color: '#fff',
  },
  fareSelectionCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    marginVertical: 12,
  },
  activeVehicleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  activeVehicleInfo: {
    flex: 1,
  },
  activeVehicleTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
  },
  activeVehicleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  activeVehicleCapacity: {
    fontSize: 12,
    color: '#666',
    marginLeft: 4,
  },
  activeVehicleDot: {
    fontSize: 12,
    color: '#666',
    marginHorizontal: 6,
  },
  activeVehicleDesc: {
    fontSize: 12,
    color: '#666',
  },
  priceAdjusterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginVertical: 12,
  },
  adjustPriceButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F0F9FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#B8E6E8',
  },
  priceAdjusterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9F9F9',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    paddingVertical: 12,
    paddingHorizontal: 28,
    minWidth: 140,
  },
  priceAdjusterCurrency: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginRight: 6,
  },
  priceAdjusterValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#075B5E',
  },
  recommendedFareLabel: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    marginBottom: 20,
  },
  alternativeContainer: {
    borderTopWidth: 1,
    borderTopColor: '#F5F5F5',
    paddingTop: 16,
    marginBottom: 16,
  },
  alternativeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  alternativeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  alternativeTexts: {
    justifyContent: 'center',
  },
  alternativeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  alternativeSub: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
  },
  alternativePrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F5F5F5',
  },
  toggleTextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#555',
  },
  switchTrack: {
    width: 46,
    height: 24,
    borderRadius: 12,
    padding: 2,
    justifyContent: 'center',
  },
  switchTrackActive: {
    backgroundColor: '#075B5E',
  },
  switchTrackInactive: {
    backgroundColor: '#CCC',
  },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
    elevation: 2,
  },
  switchThumbActive: {
    alignSelf: 'flex-end',
  },
  switchThumbInactive: {
    alignSelf: 'flex-start',
  },
})

export default PassengerHomeScreen
