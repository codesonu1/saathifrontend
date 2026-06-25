"use client"

import { useState, useEffect } from "react"
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, StatusBar, ActivityIndicator, SectionList, SafeAreaView } from "react-native"
import Icon from "react-native-vector-icons/MaterialIcons"
import { useRouter } from "expo-router"
import { useUserRole } from "../utils/userRoleManager"
import { rideService, Ride } from '../utils/rideService';

const { width } = Dimensions.get("window")

// Add a simple event emitter for ride removal
const rideRemovedListeners: ((id: string) => void)[] = [];
export const onRideRemoved = (cb: (id: string) => void) => {
  rideRemovedListeners.push(cb);
  return () => {
    const i = rideRemovedListeners.indexOf(cb);
    if (i > -1) rideRemovedListeners.splice(i, 1);
  }
};
export const emitRideRemoved = (id: string) => {
  rideRemovedListeners.forEach(cb => cb(id));
};

interface SectionData {
  title: string;
  data: Ride[];
}

const RideHistoryScreen = () => {
  const router = useRouter()
  const userRole = useUserRole();

  const [sections, setSections] = useState<SectionData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const getSectionTitle = (dateVal: Date | string) => {
    const d = new Date(dateVal);
    const day = d.getDate();
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = monthNames[d.getMonth()];
    return `${day} ${month}`; // e.g. "8 Aug"
  };

  const groupRidesByDate = (rides: Ride[]) => {
    const groups: { [key: string]: Ride[] } = {};
    
    // Sort rides by date descending first
    const sortedRides = [...rides].sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });

    sortedRides.forEach(ride => {
      if (!ride.createdAt) return;
      const title = getSectionTitle(ride.createdAt);
      if (!groups[title]) {
        groups[title] = [];
      }
      groups[title].push(ride);
    });

    return Object.keys(groups).map(title => ({
      title,
      data: groups[title]
    }));
  };

  const fetchHistory = async () => {
    setLoading(true)
    setError(null)
    try {
      let rides: Ride[] = []
      if (userRole === 'driver') {
        rides = await rideService.getDriverRides()
      } else {
        rides = await rideService.getPassengerRides()
      }
      
      // Filter for completed or cancelled rides
      const filteredRides = rides.filter(r => r.status === 'completed' || r.status === 'cancelled');
      
      // Generate a random price for the fake completed car ride
      const randomCarPrice = Math.floor(Math.random() * 200) + 150; // Random price between 150 and 350
      const mockRides: Ride[] = [
        {
          _id: 'mock_ride_1',
          status: 'completed',
          offerPrice: randomCarPrice,
          pickUpLocation: 'Kathmandu Mall',
          dropOffLocation: 'Road Division Bhaktapur, Katunje',
          createdAt: new Date(), // Today
          updatedAt: new Date(),
          vehicleType: {
            _id: 'vt_car',
            name: 'Car',
            basePrice: 150,
            pricePerKm: 35
          },
          passenger: {
            _id: 'p_1',
            firstName: 'Sagar',
            lastName: 'Thapa',
            mobile: '+9779812345678'
          },
          driver: {
            _id: 'd_1',
            firstName: 'Ramesh',
            lastName: 'Adhikari',
            mobile: '+9779876543210',
            rating: 4.8
          }
        },
        {
          _id: 'mock_ride_2',
          status: 'completed',
          offerPrice: 120,
          pickUpLocation: 'Ekkakrit Marg',
          dropOffLocation: 'Srijana Nagar',
          createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
          updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
          vehicleType: {
            _id: 'vt_bike',
            name: 'Bike',
            basePrice: 50,
            pricePerKm: 15
          },
          passenger: {
            _id: 'p_1',
            firstName: 'Sagar',
            lastName: 'Thapa',
            mobile: '+9779812345678'
          },
          driver: {
            _id: 'd_2',
            firstName: 'Sita',
            lastName: 'Shrestha',
            mobile: '+9779811111111',
            rating: 4.9
          }
        },
        {
          _id: 'mock_ride_3',
          status: 'cancelled',
          offerPrice: 0,
          pickUpLocation: 'Agyat Sadak',
          dropOffLocation: 'Albert English Boarding School',
          createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
          updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          vehicleType: {
            _id: 'vt_car',
            name: 'Car',
            basePrice: 150,
            pricePerKm: 35
          },
          passenger: {
            _id: 'p_1',
            firstName: 'Sagar',
            lastName: 'Thapa',
            mobile: '+9779812345678'
          }
        },
        {
          _id: 'mock_ride_4',
          status: 'completed',
          offerPrice: 85,
          pickUpLocation: 'F099',
          dropOffLocation: 'Sampanna Stores',
          createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
          updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          vehicleType: {
            _id: 'vt_car',
            name: 'Car',
            basePrice: 150,
            pricePerKm: 35
          },
          passenger: {
            _id: 'p_1',
            firstName: 'Sagar',
            lastName: 'Thapa',
            mobile: '+9779812345678'
          },
          driver: {
            _id: 'd_1',
            firstName: 'Ramesh',
            lastName: 'Adhikari',
            mobile: '+9779876543210',
            rating: 4.8
          }
        }
      ];
      
      const combinedRides = [...filteredRides, ...mockRides];
      const grouped = groupRidesByDate(combinedRides);
      setSections(grouped);
    } catch (err) {
      console.error('[RideHistory] Error fetching rides:', err)
      setSections([])
      setError('Failed to load ride history')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHistory()
  }, [userRole])

  useEffect(() => {
    // Listen for ride removal
    const unsub = onRideRemoved((removedId) => {
      setSections(prev => {
        const updated = prev.map(section => ({
          ...section,
          data: section.data.filter(r => r._id !== removedId)
        })).filter(section => section.data.length > 0);
        return updated;
      });
    });
    return () => unsub();
  }, []);

  const handleRidePress = (ride: Ride) => {
    router.push({
      pathname: '/(common)/rideDetails',
      params: {
        rideId: ride._id,
        userRole: userRole,
        driverName: ride.driver ? `${ride.driver.firstName} ${ride.driver.lastName}` : 'Driver Not Assigned',
        driverRating: ride.driver?.rating?.toString() || 'N/A',
        passengerName: ride.passenger ? `${ride.passenger.firstName} ${ride.passenger.lastName}` : 'Unknown Passenger',
        from: ride.pickUpLocation || ride.pickUp?.location || 'Unknown Location',
        to: ride.dropOffLocation || ride.dropOff?.location || 'Unknown Location',
        vehicle: ride.vehicleType?.name || 'Unknown Vehicle',
        vehicleNo: '',
        vehicleMake: '',
        vehicleModel: '',
        vehicleColor: '',
        fare: ride.offerPrice?.toString() || '0',
        status: ride.status || 'completed',
        date: ride.createdAt ? new Date(ride.createdAt).toLocaleDateString() : '',
        pickupTime: '',
        dropoffTime: '',
        distance: calculateDistance(ride.pickUpLat || 0, ride.pickUpLng || 0, ride.dropOffLat || 0, ride.dropOffLng || 0),
        duration: calculateDuration(ride.createdAt, ride.updatedAt),
        pickupLat: ride.pickUpLat?.toString() || ride.pickUp?.coords?.coordinates?.[1]?.toString() || '',
        pickupLng: ride.pickUpLng?.toString() || ride.pickUp?.coords?.coordinates?.[0]?.toString() || '',
        dropoffLat: ride.dropOffLat?.toString() || ride.dropOff?.coords?.coordinates?.[1]?.toString() || '',
        dropoffLng: ride.dropOffLng?.toString() || ride.dropOff?.coords?.coordinates?.[0]?.toString() || '',
      },
    });
  }

  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): string => {
    if (!lat1 || !lng1 || !lat2 || !lng2) return "Unknown";
    
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    
    return distance < 1 ? `${(distance * 1000).toFixed(0)} m` : `${distance.toFixed(1)} km`;
  }

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

  const formatTime = (dateVal: Date | string) => {
    const d = new Date(dateVal);
    let hours = d.getHours();
    const minutes = d.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const minutesStr = minutes < 10 ? '0' + minutes : minutes;
    const hoursStr = hours < 10 ? '0' + hours : hours;
    return `${hoursStr}:${minutesStr} ${ampm}`;
  };

  const getVehicleIcon = (name: string = '') => {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('bike') || lowerName.includes('moto') || lowerName.includes('motorcycle')) {
      return 'motorcycle';
    }
    return 'directions-car';
  };

  const renderRideItem = ({ item: ride }: { item: Ride }) => {
    const isCancelled = ride.status === 'cancelled';
    return (
      <TouchableOpacity style={styles.card} onPress={() => handleRidePress(ride)}>
        <View style={styles.iconContainer}>
          <Icon name={getVehicleIcon(ride.vehicleType?.name)} size={28} color="#fff" />
        </View>
        <View style={styles.detailsContainer}>
          <View style={styles.routeContainer}>
            <Text style={styles.routeText} numberOfLines={1}>
              {ride.pickUpLocation || ride.pickUp?.location || 'Unknown pickup'}
            </Text>
            <Icon name="arrow-forward" size={16} color="#666" style={styles.arrowIcon} />
            <Text style={styles.routeText} numberOfLines={1}>
              {ride.dropOffLocation || ride.dropOff?.location || 'Unknown destination'}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.timeText}>
              {ride.createdAt ? formatTime(ride.createdAt) : ''}
            </Text>
            <Text style={styles.bulletSeparator}>•</Text>
            <Text style={[styles.statusText, isCancelled ? styles.cancelledStatusText : styles.completedStatusText]}>
              {isCancelled ? 'Cancelled' : 'Successful'}
            </Text>
          </View>
        </View>
        <View style={styles.priceContainer}>
          <Text style={styles.priceText}>
            NPR {isCancelled ? '0.00' : (ride.offerPrice || 0).toFixed(2)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" translucent />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
            <Icon name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Trip history</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{userRole === 'driver' ? 'Driver' : 'Passenger'}</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#075B5E" />
            <Text style={styles.loadingText}>Loading your trips...</Text>
          </View>
        ) : error ? (
          <View style={styles.centerContainer}>
            <Icon name="error-outline" size={48} color="#F44336" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={fetchHistory}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item, index) => item._id || index.toString()}
            renderItem={renderRideItem}
            renderSectionHeader={({ section: { title } }) => (
              <Text style={styles.sectionHeader}>{title}</Text>
            )}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.centerContainer}>
                <Icon name="history" size={64} color="#ccc" />
                <Text style={styles.emptyText}>No trips found</Text>
                <Text style={styles.emptySubtext}>Your trip history will appear here</Text>
              </View>
            }
          />
        )}
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },
  header: {
    marginTop: 33,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E9ECEF",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    flex: 1,
    marginLeft: 12,
  },
  backButton: {
    padding: 4,
  },
  roleBadge: {
    backgroundColor: "#E6F2F2",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#075B5E",
  },
  roleText: {
    fontSize: 12,
    color: "#075B5E",
    fontWeight: "600",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
  },
  sectionHeader: {
    fontSize: 15,
    fontWeight: "700",
    color: "#333",
    marginTop: 20,
    marginBottom: 10,
    paddingLeft: 4,
  },
  card: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E9ECEF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: "#0A0A0A", // Keep icon box black as in mockup
    justifyContent: "center",
    alignItems: "center",
  },
  detailsContainer: {
    flex: 1,
    paddingLeft: 14,
    justifyContent: "center",
  },
  pickupText: {
    fontSize: 12,
    color: "#666",
    marginBottom: 2,
  },
  cancelledText: {
    fontSize: 12,
    color: "#EA2F14",
    fontWeight: "600",
    marginBottom: 2,
  },
  destinationText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  timeText: {
    fontSize: 12,
    color: "#999",
  },
  priceContainer: {
    justifyContent: "center",
    alignItems: "flex-end",
    paddingLeft: 8,
  },
  priceText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#333",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 100,
    paddingHorizontal: 20,
  },
  loadingText: {
    fontSize: 16,
    color: "#666",
    marginTop: 12,
  },
  errorText: {
    fontSize: 16,
    color: "#EA2F14",
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
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginTop: 4,
  },
  routeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  routeText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
    flex: 1,
  },
  arrowIcon: {
    marginHorizontal: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  bulletSeparator: {
    fontSize: 12,
    color: '#ccc',
    marginHorizontal: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  completedStatusText: {
    color: '#075B5E',
  },
  cancelledStatusText: {
    color: '#EA2F14',
  },
})

export default RideHistoryScreen
