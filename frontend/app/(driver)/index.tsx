import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Dimensions,
  SafeAreaView,
  Alert,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Clock, BrushCleaning, Star, CarFront } from 'lucide-react-native';
import SidePanel from '../(common)/sidepanel';
import Toast from '../../components/ui/Toast';
import apiClient from '../utils/apiClient';
import { userRoleManager } from '../utils/userRoleManager';
import webSocketService from '../utils/websocketService';

// Add the profit/loss calculation function
const calculateDriverProfitLoss = async (): Promise<{
  profit: number;
  loss: number;
  breakdown: {
    grossEarnings: number;
    commission: number;
    rewards: number;
    netProfit: number;
  };
}> => {
  try {
    const ridesResponse = await apiClient.get('rides/driver?status=completed');
    const completedRides = ridesResponse.data.data || [];
    
    const walletResponse = await apiClient.get('wallet-transactions');
    const walletTransactions = walletResponse.data.data || [];

    const rewardResponse = await apiClient.get('reward-transactions');
    const rewardTransactions = rewardResponse.data.data || [];
    
    const grossEarnings = completedRides.reduce((total: number, ride: any) => {
      return total + (ride.acceptedOffer?.offerAmount || 0);
    }, 0);
    
    // Calculate Total Commission Paid
    const commission = walletTransactions.reduce((total: number, transaction: any) => {
      const desc = (transaction.desc || '').toLowerCase();
      const type = (transaction.type || '').toLowerCase();
      if (desc === 'ride commission' && type === 'debit') {
        return total + Math.abs(transaction.amount);
      }
      return total;
    }, 0);
    
    // Calculate Total Rewards Earned
    const rewards = rewardTransactions.reduce((total: number, transaction: any) => {
      if (transaction.type === 'EARNED') {
        return total + transaction.amount;
      }
      return total;
    }, 0);
    
    // Calculate Net Profit and Loss
    const netProfit = grossEarnings - commission + rewards;
    const loss = commission;
    
    return {
      profit: netProfit,
      loss: loss,
      breakdown: {
        grossEarnings,
        commission,
        rewards,
        netProfit
      }
    };
  } catch (error) {
    const err = error as any;
    console.error('Error calculating profit/loss:', err);
    // Return default values on error
    return {
      profit: 0,
      loss: 0,
      breakdown: {
        grossEarnings: 0,
        commission: 0,
        rewards: 0,
        netProfit: 0
      }
    };
  }
};

const { width, height } = Dimensions.get('window');

const DriverHomeScreen = () => {
  const router = useRouter();
  const { isAccountRestored: initialRestored, registrationComplete } = useLocalSearchParams();
  const [sidePanelVisible, setSidePanelVisible] = useState(false);
  const [role, setRole] = useState<'driver' | 'passenger'>('driver');
  const [rideInProgress, setRideInProgress] = useState(false);
  const [isAccountRestored, setIsAccountRestored] = useState(false);
  const [vehicleDetails, setVehicleDetails] = useState({ type: '', licensePlate: '', model: '' });
  const [passengerRatings, setPassengerRatings] = useState({ averageRating: 0, totalReviews: 0 });
  const [loading, setLoading] = useState(true);
  const [recentRide, setRecentRide] = useState({ from: '', to: '', date: '', fare: '' });
  const [profitLossData, setProfitLossData] = useState({
    profit: 0,
    loss: 0,
    breakdown: {
      grossEarnings: 0,
      commission: 0,
      rewards: 0,
      netProfit: 0
    }
  });
  
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: 'success' | 'error' | 'info';
  }>({
    visible: false,
    message: '',
    type: 'info',
  });

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ visible: true, message, type });
  };

  const hideToast = () => {
    setToast(prev => ({ ...prev, visible: false }));
  };

  useEffect(() => {
    // Always check if driver is logged in, regardless of params
    const checkDriverStatus = async () => {
      try {
        setLoading(true);
        const response = await apiClient.get('driver-profile');
        if (response.data.data) {
          // Driver is logged in and has a profile
          setIsAccountRestored(true);
          const profile = response.data.data;
          
          setVehicleDetails({
            type: profile.vehicleMake || 'Not specified',
            licensePlate: profile.vehicleRegNum || profile.licensePlate || 'Not specified',
            model: profile.vehicleModel || profile.model || 'Not specified',
          });
          setPassengerRatings({
            averageRating: profile.rating || 0,
            totalReviews: profile.totalRides || 0,
          });
          setRecentRide({
            from: profile.lastRide?.pickupLocation || 'No recent rides',
            to: profile.lastRide?.dropoffLocation || 'No recent rides',
            date: profile.lastRide?.date ? new Date(profile.lastRide.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'No recent rides',
            fare: profile.lastRide?.fare ? `रू${profile.lastRide.fare}` : 'No recent rides',
          });

          // Fetch profit/loss data for registered drivers
          const profitData = await calculateDriverProfitLoss();
          setProfitLossData(profitData);
        } else {
          // Driver is not logged in or has no profile
          setIsAccountRestored(false);
        }
      } catch (err) {
        // If API call fails, assume driver is not logged in
        setIsAccountRestored(false);
        console.log('Driver not logged in or API error:', err);
      } finally {
        setLoading(false);
      }
    };

    checkDriverStatus();
  }, [initialRestored, registrationComplete]);



  const openSidePanel = () => setSidePanelVisible(true);
  const closeSidePanel = () => setSidePanelVisible(false);
  const handleChangeRole = async (newRole: 'driver' | 'passenger') => {
    await userRoleManager.setRole(newRole);
    webSocketService.disconnect('driver');
    webSocketService.disconnect('passenger');
    webSocketService.disconnect('ride');
    if (newRole === 'passenger') {
      router.push('/(tabs)');
    } else {
      router.push('/(driver)');
    }
    closeSidePanel();
  };

  const handleDriverPress = () => router.push('/registerVehicle');
  const handleAccountPress = () => router.push('/accountRestoration');
  const handlePassengerMode = () => router.push('/(tabs)');
  const handleDriverSection = () => router.push('/driverSection');

  if (loading) return (
    <SafeAreaView style={styles.container}>
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    </SafeAreaView>
  );

  // Show driver mode (online/offline) only after registration is complete
  if (isAccountRestored) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#f5f5f5" />
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.hamburgerButton} onPress={openSidePanel}>
              <View style={styles.hamburgerLine} />
              <View style={styles.hamburgerLine} />
              <View style={styles.hamburgerLine} />
            </TouchableOpacity>
          </View>
          <View style={styles.content}>
            <View style={styles.incomeCard}>
              <Text style={styles.incomeTitle}>
                {'Welcome to Saathi! 🎉'}
              </Text>
                <>
                  <Text style={styles.welcomeText}>You can now start accepting rides and earning money.</Text>
                </>
            </View>

            <View style={styles.vehicleDetailsCard}>
              <Text style={styles.sectionTitle}>Vehicle Details</Text>
              <Text style={styles.detailText}>Type: {vehicleDetails.type}</Text>
              <Text style={styles.detailText}>License Plate: {vehicleDetails.licensePlate}</Text>
              <Text style={styles.detailText}>Model: {vehicleDetails.model}</Text>
            </View>

            <View style={styles.ratingsCard}>
              <Text style={styles.sectionTitle}>Passenger Ratings</Text>
              <Text style={styles.detailText}>Average Rating: {passengerRatings.averageRating.toFixed(1)} / 5</Text>
              <Text style={styles.detailText}>Total Reviews: {passengerRatings.totalReviews}</Text>
            </View>

            <View style={styles.profitLossCard}>
              <Text style={styles.sectionTitle}>Earnings & Expenses</Text>
              <Text style={styles.detailText}>
                Net Profit: रू {Math.round(profitLossData.profit)}
              </Text>
              <Text style={styles.detailText}>
                Total Loss: रू {profitLossData.loss > 0 ? Math.round(profitLossData.loss) : 0}
              </Text>
            </View>

            {/* Driver Section Button */}
            <TouchableOpacity style={styles.driverSectionButton} onPress={handleDriverSection}>
              <View style={styles.driverSectionContent}>
                <MaterialIcons name="directions-car" size={24} color="#fff" />
                <Text style={styles.driverSectionText}>Driver Section</Text>
              </View>
              <MaterialIcons name="arrow-forward-ios" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          <SidePanel
            visible={sidePanelVisible}
            onClose={closeSidePanel}
            role={role}
            rideInProgress={rideInProgress}
            onChangeRole={handleChangeRole}
          />

          <Toast
            visible={toast.visible}
            message={toast.message}
            type={toast.type}
            onHide={hideToast}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Show registration options if not registered
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f5f5f5" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.hamburgerButton} onPress={openSidePanel}>
          <View style={styles.hamburgerLine} />
          <View style={styles.hamburgerLine} />
          <View style={styles.hamburgerLine} />
        </TouchableOpacity>
      </View>
      <View style={styles.content}>
        <View style={styles.incomeCard}>
          <Text style={styles.incomeTitle}>Tips for drivers</Text>
          <View style={styles.benefitItem}>
            <Clock size={20} color="#333" />
            <Text style={styles.benefitText}>Peak hours are 8-10 AM and 6-8 PM</Text>
          </View>
          <View style={styles.benefitItem}>
            <BrushCleaning size={20} color="#333" />
            <Text style={styles.benefitText}>Keep your vehicle clean</Text>
          </View>
          <View style={styles.benefitItem}>
            <Star size={20} color="#333" />
            <Text style={styles.benefitText}>Maintain good ratings</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.driverButton} onPress={handleDriverPress}>
          <View style={styles.driverContent}>
            <View style={styles.carIcon}>
              <CarFront size={24} color="#333" />
            </View>
            <Text style={styles.driverText}>Driver</Text>
          </View>
        </TouchableOpacity>
        <View style={styles.bottomSection}>
          <TouchableOpacity style={styles.accountButton} onPress={handleAccountPress}>
            <Text style={styles.accountText}>I already have an account</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handlePassengerMode}>
            <Text style={styles.passengerText}>Go to passenger mode</Text>
          </TouchableOpacity>
        </View>
      </View>
      <SidePanel
        visible={sidePanelVisible}
        onClose={closeSidePanel}
        role={role}
        rideInProgress={rideInProgress}
        onChangeRole={handleChangeRole}
      />
      {toast.visible && (
        <Toast visible={toast.visible} message={toast.message} type={toast.type} onHide={hideToast} />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    marginTop: 28,
  },
  hamburgerButton: {
    width: 24,
    height: 18,
    justifyContent: 'space-between',
    marginTop: 28,
  },
  hamburgerLine: {
    width: 24,
    height: 3,
    backgroundColor: '#333',
    borderRadius: 2,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 40,
  },
  incomeCard: {
    backgroundColor: '#A4CCD9',
    borderRadius: 20,
    padding: 24,
    marginBottom: 40,
  },
  incomeTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    marginBottom: 20,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  benefitText: {
    fontSize: 16,
    color: '#333',
    marginLeft: 12,
    fontWeight: '500',
  },
  driverButton: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 40,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  driverContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  carIcon: {
    marginRight: 16,
  },
  carEmoji: {
    fontSize: 24,
  },
  driverText: {
    fontSize: 18,
    color: '#333',
    fontWeight: '500',
  },
  bottomSection: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 40,
  },
  accountButton: {
    backgroundColor: 'transparent',
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  accountText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  passengerText: {
    fontSize: 16,
    color: '#007AFF',
    textAlign: 'center',
    fontWeight: '500',
  },
  vehicleDetailsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  ratingsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  profitLossCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  recentRideCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    marginBottom: 10,
  },
  detailText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  welcomeText: {
    fontSize: 16,
    color: '#333',
    marginBottom: 8,
  },
  driverSectionButton: {
    backgroundColor: '#075B5E',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  driverSectionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  driverSectionText: {
    fontSize: 18,
    color: '#fff',
    fontWeight: '600',
    marginLeft: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
});

export default DriverHomeScreen;