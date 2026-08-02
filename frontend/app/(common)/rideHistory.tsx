import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  SectionList,
  SafeAreaView,
  Platform,
  TextInput,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useUserRole } from '@/services/userRoleManager';
import { rideService, Ride } from '@/services/rideService';

const { width } = Dimensions.get('window');

// Simple event emitter for ride removal
const rideRemovedListeners: ((id: string) => void)[] = [];
export const onRideRemoved = (cb: (id: string) => void) => {
  rideRemovedListeners.push(cb);
  return () => {
    const i = rideRemovedListeners.indexOf(cb);
    if (i > -1) rideRemovedListeners.splice(i, 1);
  };
};
export const emitRideRemoved = (id: string) => {
  rideRemovedListeners.forEach((cb) => cb(id));
};

interface SectionData {
  title: string;
  data: Ride[];
}

const RideHistoryScreen = () => {
  const router = useRouter();
  const userRole = useUserRole();

  const [allRides, setAllRides] = useState<Ride[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const formatSectionHeaderTitle = (dateVal: Date | string) => {
    const d = new Date(dateVal);
    const now = new Date();
    
    // Reset hours for day comparison
    const dDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffTime = nowDate.getTime() - dDate.getTime();
    const diffDays = Math.round(diffTime / (1000 * 3600 * 24));

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];

    const month = monthNames[d.getMonth()].toUpperCase();
    const dayNum = d.getDate();

    if (diffDays === 0) {
      return `TODAY, ${month} ${dayNum}`;
    } else if (diffDays === 1) {
      return `YESTERDAY, ${month} ${dayNum}`;
    } else {
      return `${d.getDate()} ${month} ${d.getFullYear()}`;
    }
  };

  const groupRidesByDate = (rides: Ride[]) => {
    const groups: { [key: string]: Ride[] } = {};

    // Sort rides by date descending
    const sortedRides = [...rides].sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });

    sortedRides.forEach((ride) => {
      if (!ride.createdAt) return;
      const title = formatSectionHeaderTitle(ride.createdAt);
      if (!groups[title]) {
        groups[title] = [];
      }
      groups[title].push(ride);
    });

    return Object.keys(groups).map((title) => ({
      title,
      data: groups[title],
    }));
  };

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      let rides: Ride[] = [];
      if (userRole === 'driver') {
        rides = await rideService.getDriverRides();
      } else {
        rides = await rideService.getPassengerRides();
      }

      // Filter exclusively for completed or cancelled rides
      const filteredRides = rides.filter(
        (r) => r.status === 'completed' || r.status === 'cancelled'
      );

      setAllRides(filteredRides);
    } catch (err) {
      console.error('[RideHistory] Error fetching rides:', err);
      setAllRides([]);
      setError('Failed to load ride history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [userRole]);

  useEffect(() => {
    const unsub = onRideRemoved((removedId) => {
      setAllRides((prev) => prev.filter((r) => r._id !== removedId));
    });
    return () => unsub();
  }, []);

  // Compute filtered rides based on search query
  const filteredRidesList = useMemo(() => {
    if (!searchQuery.trim()) return allRides;
    const query = searchQuery.toLowerCase().trim();
    return allRides.filter((ride) => {
      const pickup = (ride.pickUpLocation || ride.pickUp?.location || '').toLowerCase();
      const dropoff = (ride.dropOffLocation || ride.dropOff?.location || '').toLowerCase();
      const vehicle = (ride.vehicleType?.name || '').toLowerCase();
      return pickup.includes(query) || dropoff.includes(query) || vehicle.includes(query);
    });
  }, [allRides, searchQuery]);

  const sections: SectionData[] = useMemo(() => {
    return groupRidesByDate(filteredRidesList);
  }, [filteredRidesList]);

  // Compute monthly stats
  const totalRidesCount = allRides.length;
  const thisMonthRidesCount = useMemo(() => {
    const now = new Date();
    return allRides.filter((r) => {
      if (!r.createdAt) return false;
      const d = new Date(r.createdAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
  }, [allRides]);

  const handleRidePress = (ride: Ride) => {
    router.push({
      pathname: '/(common)/rideDetails',
      params: {
        rideId: ride._id,
        userRole: userRole,
        driverName: ride.driver
          ? `${ride.driver.firstName} ${ride.driver.lastName}`
          : 'Driver Not Assigned',
        driverRating: ride.driver?.rating?.toString() || 'N/A',
        passengerName: ride.passenger
          ? `${ride.passenger.firstName} ${ride.passenger.lastName}`
          : 'Unknown Passenger',
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
        distance: calculateDistance(
          ride.pickUpLat || 0,
          ride.pickUpLng || 0,
          ride.dropOffLat || 0,
          ride.dropOffLng || 0
        ),
        duration: calculateDuration(ride.createdAt, ride.updatedAt),
        pickupLat:
          ride.pickUpLat?.toString() ||
          ride.pickUp?.coords?.coordinates?.[1]?.toString() ||
          '',
        pickupLng:
          ride.pickUpLng?.toString() ||
          ride.pickUp?.coords?.coordinates?.[0]?.toString() ||
          '',
        dropoffLat:
          ride.dropOffLat?.toString() ||
          ride.dropOff?.coords?.coordinates?.[1]?.toString() ||
          '',
        dropoffLng:
          ride.dropOffLng?.toString() ||
          ride.dropOff?.coords?.coordinates?.[0]?.toString() ||
          '',
      },
    });
  };

  const calculateDistance = (
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): string => {
    if (!lat1 || !lng1 || !lat2 || !lng2) return 'Unknown';
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance < 1 ? `${(distance * 1000).toFixed(0)} m` : `${distance.toFixed(1)} km`;
  };

  const calculateDuration = (startTime: Date, endTime: Date): string => {
    if (!startTime || !endTime) return 'Unknown';
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
    if (
      lowerName.includes('bike') ||
      lowerName.includes('moto') ||
      lowerName.includes('motorcycle')
    ) {
      return 'two-wheeler';
    }
    return 'directions-car';
  };

  const renderRideItem = ({ item: ride }: { item: Ride }) => {
    const isCancelled = ride.status === 'cancelled';
    const rideCode = ride._id ? `#TRP-${ride._id.slice(-4).toUpperCase()}` : '#TRP-8821';
    const vehicleTypeName = ride.vehicleType?.name || 'Car';
    const tierName = vehicleTypeName.toLowerCase().includes('bike') ? 'Lite' : 'Pro';

    return (
      <TouchableOpacity
        style={[
          styles.rideCard,
          isCancelled ? styles.rideCardCancelledBorder : styles.rideCardCompletedBorder,
        ]}
        onPress={() => handleRidePress(ride)}
        activeOpacity={0.88}
      >
        {/* Card Header Row */}
        <View style={styles.cardHeader}>
          <View style={styles.vehicleBadgeRow}>
            <View style={styles.vehicleIconCircle}>
              <MaterialIcons
                name={getVehicleIcon(vehicleTypeName)}
                size={20}
                color="#B7102A"
              />
            </View>
            <View>
              <Text style={styles.vehicleTitle}>
                {vehicleTypeName} • Saathi {tierName}
              </Text>
              <Text style={styles.timeAndCodeText}>
                {ride.createdAt ? formatTime(ride.createdAt) : '9:45 AM'} • {rideCode}
              </Text>
            </View>
          </View>

          {/* Status Badge */}
          <View
            style={[
              styles.statusPill,
              isCancelled ? styles.statusPillCancelled : styles.statusPillCompleted,
            ]}
          >
            <Text
              style={[
                styles.statusPillText,
                isCancelled ? styles.statusTextCancelled : styles.statusTextCompleted,
              ]}
            >
              {isCancelled ? 'Cancelled' : 'Successful'}
            </Text>
          </View>
        </View>

        {/* Timeline Locations & Fare Row */}
        <View style={styles.cardBodyRow}>
          {/* Left Timeline */}
          <View style={styles.timelineContainer}>
            {/* Pickup */}
            <View style={styles.locationPointRow}>
              <View style={styles.pickupCircle} />
              <Text style={styles.locationText} numberOfLines={1}>
                {ride.pickUpLocation || ride.pickUp?.location || 'Kathmandu Durbar Square'}
              </Text>
            </View>

            {/* Connecting Vertical Line */}
            <View style={styles.timelineLine} />

            {/* Dropoff */}
            <View style={styles.locationPointRow}>
              <View style={styles.dropoffSquare} />
              <Text style={styles.locationText} numberOfLines={1}>
                {ride.dropOffLocation || ride.dropOff?.location || 'Labim Mall, Lalitpur'}
              </Text>
            </View>
          </View>

          {/* Right Fare Container */}
          <View style={styles.fareContainer}>
            <Text style={styles.fareLabel}>NPR</Text>
            <Text style={styles.fareAmount}>
              {isCancelled ? '0' : Math.round(ride.offerPrice || 0)}
            </Text>
            <Text style={styles.paymentMethodText}>
              {ride.paymentMethod || 'Cash Payment'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" translucent={false} />

      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
            activeOpacity={0.8}
          >
            <MaterialIcons name="arrow-back" size={22} color="#191C1D" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.headerTitle}>History</Text>
            <Text style={styles.headerSubtitle}>Review your past travels and receipts.</Text>
          </View>
        </View>

        {/* Stats Banner Cards */}
        <View style={styles.statsBannerRow}>
          {/* Card 1: Total Rides (Primary Energetic Red) */}
          <View style={styles.statCardRed}>
            <MaterialIcons name="verified-user" size={24} color="#FFFFFF" style={{ marginBottom: 12 }} />
            <Text style={styles.statLabelRed}>Total Rides</Text>
            <Text style={styles.statValueRed}>{totalRidesCount}</Text>
          </View>

          {/* Card 2: This Month (Light Container) */}
          <View style={styles.statCardGray}>
            <MaterialIcons name="bar-chart" size={24} color="#B7102A" style={{ marginBottom: 12 }} />
            <Text style={styles.statLabelGray}>This Month</Text>
            <Text style={styles.statValueGray}>{thisMonthRidesCount} Rides</Text>
          </View>
        </View>

        {/* Search & Filter Bar */}
        <View style={styles.searchBarRow}>
          <View style={styles.searchInputContainer}>
            <MaterialIcons name="search" size={22} color="#8F6F6E" style={{ marginRight: 8 }} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search by destination"
              placeholderTextColor="#8F6F6E"
              style={styles.searchInput}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <MaterialIcons name="close" size={18} color="#8F6F6E" />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity style={styles.filterButton} activeOpacity={0.8}>
            <MaterialIcons name="tune" size={20} color="#191C1D" />
          </TouchableOpacity>
        </View>

        {/* Main List */}
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#B7102A" />
            <Text style={styles.loadingText}>Loading your trips...</Text>
          </View>
        ) : error ? (
          <View style={styles.centerContainer}>
            <MaterialIcons name="error-outline" size={48} color="#BA1A1A" />
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
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderLine} />
                <Text style={styles.sectionHeaderTitle}>{title}</Text>
                <View style={styles.sectionHeaderLine} />
              </View>
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconCircle}>
                  <MaterialIcons name="history" size={40} color="#B7102A" />
                </View>
                <Text style={styles.emptyTitle}>No trips yet</Text>
                <Text style={styles.emptySubtext}>
                  {searchQuery ? 'No rides match your search query.' : 'Your completed and past rides will appear here.'}
                </Text>
              </View>
            }
          />
        )}
      </SafeAreaView>
    </View>
  );
};

export default RideHistoryScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 8 : 12,
    paddingBottom: 14,
    backgroundColor: '#F8F9FA',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    fontSize: 24,
    fontWeight: '700',
    color: '#191C1D',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#5B403F',
    marginTop: 2,
  },
  statsBannerRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 14,
    marginBottom: 16,
  },
  statCardRed: {
    flex: 1,
    backgroundColor: '#B7102A',
    borderRadius: 16,
    padding: 16,
    elevation: 3,
    shadowColor: '#B7102A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  statLabelRed: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
    opacity: 0.9,
    marginBottom: 4,
  },
  statValueRed: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  statCardGray: {
    flex: 1,
    backgroundColor: '#F3F4F5',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EDEEEF',
  },
  statLabelGray: {
    fontSize: 13,
    fontWeight: '600',
    color: '#5B403F',
    marginBottom: 4,
  },
  statValueGray: {
    fontSize: 22,
    fontWeight: '700',
    color: '#191C1D',
  },
  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 16,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F5',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 46,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#191C1D',
  },
  filterButton: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#F3F4F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 14,
  },
  sectionHeaderLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#EDEEEF',
  },
  sectionHeaderTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5B403F',
    letterSpacing: 0.8,
    marginHorizontal: 10,
  },
  rideCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: '#EDEEEF',
    borderLeftWidth: 4,
  },
  rideCardCompletedBorder: {
    borderLeftColor: '#B7102A',
  },
  rideCardCancelledBorder: {
    borderLeftColor: '#8F6F6E',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  vehicleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vehicleIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFDAD8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  vehicleTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#191C1D',
  },
  timeAndCodeText: {
    fontSize: 12,
    color: '#5B403F',
    marginTop: 2,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  statusPillCompleted: {
    backgroundColor: '#FFDAD8',
  },
  statusPillCancelled: {
    backgroundColor: '#E7E8E9',
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusTextCompleted: {
    color: '#B7102A',
  },
  statusTextCancelled: {
    color: '#5B403F',
  },
  cardBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timelineContainer: {
    flex: 1,
    marginRight: 12,
  },
  locationPointRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pickupCircle: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#B7102A',
    backgroundColor: '#FFFFFF',
    marginRight: 10,
  },
  dropoffSquare: {
    width: 9,
    height: 9,
    backgroundColor: '#B7102A',
    marginRight: 10.5,
  },
  timelineLine: {
    width: 2,
    height: 14,
    backgroundColor: '#EDEEEF',
    marginLeft: 4,
    marginVertical: 2,
  },
  locationText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: '#191C1D',
  },
  fareContainer: {
    alignItems: 'flex-end',
  },
  fareLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#191C1D',
  },
  fareAmount: {
    fontSize: 22,
    fontWeight: '800',
    color: '#191C1D',
    lineHeight: 26,
  },
  paymentMethodText: {
    fontSize: 11,
    color: '#5B403F',
    marginTop: 2,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    fontSize: 15,
    color: '#5B403F',
    marginTop: 12,
  },
  errorText: {
    fontSize: 15,
    color: '#BA1A1A',
    textAlign: 'center',
    marginVertical: 12,
  },
  retryButton: {
    backgroundColor: '#B7102A',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFDAD8',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#191C1D',
    marginBottom: 6,
  },
  emptySubtext: {
    fontSize: 14,
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
