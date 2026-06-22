"use client"

import { useState, useEffect } from "react"
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, StatusBar, ActivityIndicator, FlatList, SafeAreaView } from "react-native"
import Icon from "react-native-vector-icons/MaterialIcons"
import { useRouter } from "expo-router"
import { useUserRole, userRoleManager } from "../utils/userRoleManager"
import { rideService, Ride } from '../utils/rideService';

const { width, height } = Dimensions.get("window")

// Add a simple event emitter for ride removal
const rideRemovedListeners: ((id: string) => void)[] = [];
export const onRideRemoved = (cb: (id: string) => void) => { rideRemovedListeners.push(cb); return () => { const i = rideRemovedListeners.indexOf(cb); if (i > -1) rideRemovedListeners.splice(i, 1); } };
export const emitRideRemoved = (id: string) => { rideRemovedListeners.forEach(cb => cb(id)); };

const RideHistoryScreen = () => {
  const router = useRouter()
  const userRole = useUserRole();

  const [rideHistory, setRideHistory] = useState<Ride[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true)
      setError(null)
      try {
        let rides: Ride[] = []
        if (userRole === 'driver') {
          rides = await rideService.getDriverRides('completed')
        } else {
          rides = await rideService.getPassengerRides('completed')
        }
        
        setRideHistory(rides)
      } catch (err) {
        setRideHistory([])
        setError('Failed to load ride history')
      } finally {
        setLoading(false)
      }
    }
    fetchHistory()
  }, [userRole])

  useEffect(() => {
    // Listen for ride removal
    const unsub = onRideRemoved((removedId) => setRideHistory(prev => prev.filter(r => r._id !== removedId)));
    return () => unsub();
  }, []);

  const resetToPassenger = async () => {
    await userRoleManager.setRole('passenger')
  }

  const fetchHistory = async () => {
    setLoading(true)
    setError(null)
    try {
      let rides: Ride[] = []
      if (userRole === 'driver') {
        rides = await rideService.getDriverRides('completed')
      } else {
        rides = await rideService.getPassengerRides('completed')
      }
      
      setRideHistory(rides)
    } catch (err) {
      console.error('[RideHistory] Error fetching rides:', err)
      setRideHistory([])
      setError('Failed to load ride history')
    } finally {
      setLoading(false)
    }
  }

  const handleRidePress = (ride: Ride) => {
    
    // Navigate to ride details screen with proper data
    router.push({
      pathname: '/(common)/rideDetails',
      params: {
        rideId: ride._id,
        userRole: userRole,
        // Driver info - handle missing driver data
        driverName: ride.driver ? `${ride.driver.firstName} ${ride.driver.lastName}` : 'Driver Not Assigned',
        driverRating: ride.driver?.rating?.toString() || 'N/A',
        // Passenger info  
        passengerName: ride.passenger ? `${ride.passenger.firstName} ${ride.passenger.lastName}` : 'Unknown Passenger',
        // Location info
        from: ride.pickUpLocation || ride.pickUp?.location || 'Unknown Location',
        to: ride.dropOffLocation || ride.dropOff?.location || 'Unknown Location',
        // Vehicle info
        vehicle: ride.vehicleType?.name || 'Unknown Vehicle',
        vehicleNo: '',
        vehicleMake: '',
        vehicleModel: '',
        vehicleColor: '',
        // Ride info
        fare: ride.offerPrice?.toString() || '0',
        status: ride.status || 'completed',
        // Timing info
        date: ride.createdAt ? new Date(ride.createdAt).toLocaleDateString() : '',
        pickupTime: '',
        dropoffTime: '',
        // Distance/Duration - calculate from coordinates if available
        distance: calculateDistance(ride.pickUpLat || 0, ride.pickUpLng || 0, ride.dropOffLat || 0, ride.dropOffLng || 0),
        duration: calculateDuration(ride.createdAt, ride.updatedAt),
        // Coordinates for map
        pickupLat: ride.pickUpLat?.toString() || ride.pickUp?.coords?.coordinates?.[1]?.toString() || '',
        pickupLng: ride.pickUpLng?.toString() || ride.pickUp?.coords?.coordinates?.[0]?.toString() || '',
        dropoffLat: ride.dropOffLat?.toString() || ride.dropOff?.coords?.coordinates?.[1]?.toString() || '',
        dropoffLng: ride.dropOffLng?.toString() || ride.dropOff?.coords?.coordinates?.[0]?.toString() || '',
        // No function param
      },
    });
  }

  // Helper function to calculate distance between two points
  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): string => {
    if (!lat1 || !lng1 || !lat2 || !lng2) return "Unknown";
    
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    
    return distance < 1 ? `${(distance * 1000).toFixed(0)} m` : `${distance.toFixed(1)} km`;
  }

  // Helper function to calculate duration
  const calculateDuration = (startTime: Date, endTime: Date): string => {
    if (!startTime || !endTime) return "Unknown";
    
    const start = new Date(startTime);
    const end = new Date(endTime);
    const diffMs = end.getTime() - start.getTime();
    const diffMins = Math.round(diffMs / 60000);
    
    if (diffMins < 60) {
      return `${diffMins} min`;
    } else {
      const hours = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
  }

  const handleBackPress = () => {
    router.back();
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <SafeAreaView>
        <View style={styles.header} pointerEvents="auto">
          <TouchableOpacity onPress={handleBackPress} style={[
            styles.backButton,
            {
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
              zIndex: 1001,
            }
          ]}>
            <Icon name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My rides</Text>
          {/* Show current role */}
          <View style={styles.roleIndicator}>
            <Text style={styles.roleText}>{userRole}</Text>
            <TouchableOpacity onPress={resetToPassenger} style={styles.resetButton}>
              <Icon name="refresh" size={12} color="#075B5E" />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
      <View style={[styles.rideList, { marginTop: 5 }] }>
        <FlatList
          data={rideHistory}
          keyExtractor={(ride, index) => ride._id || index.toString()}
          showsVerticalScrollIndicator={true}
          scrollEnabled={true}
          renderItem={({ item: ride }) => (
            <TouchableOpacity style={styles.rideItem} onPress={() => handleRidePress(ride)}>
              <View style={styles.rideDetails}>
                <Text style={styles.rideDate}>
                  {ride.createdAt ? new Date(ride.createdAt).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  }) : ''}
                </Text>
                <View style={styles.locationRow}>
                  <Icon name="location-on" size={16} color={ride.status === "cancelled" ? "#666" : "#4CAF50"} />
                  <Text style={styles.rideLocation} numberOfLines={1}>
                    {ride.pickUpLocation || ride.pickUp?.location || 'Unknown pickup'}
                  </Text>
                </View>
                <View style={styles.locationRow}>
                  <Icon name="location-on" size={16} color={ride.status === "cancelled" ? "#666" : "#2196F3"} />
                  <Text style={styles.rideLocation} numberOfLines={1}>
                    {ride.dropOffLocation || ride.dropOff?.location || 'Unknown destination'}
                  </Text>
                </View>
                {ride.status === "cancelled" && <Text style={styles.cancelledText}>Ride cancelled</Text>}
              </View>
              <View style={styles.rideFare}>
                <Text style={styles.fareText}>रू {(ride.offerPrice || 0).toFixed(0)}</Text>
                <Icon name="chevron-right" size={24} color="#666" />
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            loading ? (
              <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color="#075B5E" />
                <Text style={styles.loadingText}>Loading your rides...</Text>
              </View>
            ) : error ? (
              <View style={styles.centerContainer}>
                <Icon name="error-outline" size={48} color="#F44336" />
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity style={styles.retryButton} onPress={() => fetchHistory()}>
                  <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.centerContainer}>
                <Icon name="history" size={48} color="#666" />
                <Text style={styles.emptyText}>No completed rides found</Text>
                <Text style={styles.emptySubtext}>Your ride history will appear here</Text>
              </View>
            )
          }
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 20 }}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    paddingTop: 40,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    marginBottom: 20,
    zIndex: 1000,
    position: 'relative',
    backgroundColor: '#fff',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#333",
    flex: 1,
    textAlign: "center",
    marginLeft: -24,
  },
  backButton: {
    padding: 8,
    zIndex: 1001,
    pointerEvents: 'auto',
  },
  roleIndicator: {
    flexDirection: "row",
    alignItems: "center",
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
  resetButton: {
    marginLeft: 4,
    padding: 4,
  },

  rideList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  rideItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 32,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  rideDetails: {
    flex: 1,
  },
  rideDate: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  rideLocation: {
    fontSize: 16,
    color: "#333",
    marginLeft: 8,
  },
  cancelledText: {
    fontSize: 12,
    color: "#666",
    fontStyle: "italic",
  },
  rideFare: {
    flexDirection: "row",
    alignItems: "center",
  },
  fareText: {
    fontSize: 16,
    color: "#333",
    marginRight: 8,
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
    backgroundColor: "#075B5E",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 16,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  emptyText: {
    fontSize: 18,
    color: "#333",
    fontWeight: "600",
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginTop: 4,
  },
})

export default RideHistoryScreen
