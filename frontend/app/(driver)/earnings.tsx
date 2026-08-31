import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  ActivityIndicator,
  ScrollView,
  Platform,
  RefreshControl,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import apiClient, { initializeApiClient } from '@/services/apiClient';
import SidePanel from '../(common)/sidepanel';
import DriverBottomNav from '@/components/DriverBottomNav';
import AppModal from '@/components/ui/AppModal';
import notificationService from '@/services/notificationService';

const { width } = Dimensions.get('window');

interface EarningsBreakdown {
  todayEarnings: number;
  todayRides: number;
  weeklyEarnings: number;
  monthlyEarnings: number;
  grossEarnings: number;
  commission: number;
  rewards: number;
  netProfit: number;
  totalCompletedRides: number;
  totalDistanceKm: number;
  completedRidesList: any[];
}

const DriverEarningsScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPadding = insets.top > 0 ? insets.top : (Platform.OS === 'ios' ? 44 : 24);
  const bottomPadding = 90 + (insets.bottom > 0 ? insets.bottom : 10);

  const [sidePanelVisible, setSidePanelVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [totalCreditsAdded, setTotalCreditsAdded] = useState<number>(0);

  const [earningsData, setEarningsData] = useState<EarningsBreakdown>({
    todayEarnings: 0,
    todayRides: 0,
    weeklyEarnings: 0,
    monthlyEarnings: 0,
    grossEarnings: 0,
    commission: 0,
    rewards: 0,
    netProfit: 0,
    totalCompletedRides: 0,
    totalDistanceKm: 0,
    completedRidesList: [],
  });

  const [modal, setModal] = useState<{
    visible: boolean;
    type: 'success' | 'error' | 'info';
    title: string;
    message: string;
  }>({
    visible: false,
    type: 'info',
    title: '',
    message: '',
  });

  const showModal = (type: 'success' | 'error' | 'info', title: string, message: string) => {
    setModal({ visible: true, type, title, message });
  };
  const hideModal = () => setModal(prev => ({ ...prev, visible: false }));

  const fetchEarnings = async () => {
    try {
      await initializeApiClient();

      // 1. Fetch live user profile to get exact live wallet deposit balance from Admin
      try {
        const userResponse = await apiClient.get('/users/me');
        if (userResponse.data?.data) {
          const u = userResponse.data.data;
          const liveBal = u.walletBalance ?? u.wallet ?? u.balance ?? 0;
          const numericLiveBal = Number(liveBal) || 0;
          setWalletBalance(numericLiveBal);
          await notificationService.checkAndNotifyDriverBalance(numericLiveBal);
        }
      } catch (userErr) {
        console.warn('[Earnings] Failed to fetch current driver balance:', userErr);
      }

      // 2. Fetch completed driver rides
      const ridesResponse = await apiClient.get('rides/driver?status=completed');
      const completedRides = ridesResponse.data?.data || [];

      // 3. Fetch wallet transactions (for admin credits and commission debits)
      let walletTransactions: any[] = [];
      try {
        const walletResponse = await apiClient.get('wallet-transactions');
        walletTransactions = walletResponse.data?.data || [];
      } catch (err) {
        console.log('[Earnings] Wallet transactions check error:', err);
      }

      // Compute total credits added by Admin vs debits
      let creditsSum = 0;
      let debitsSum = 0;
      if (Array.isArray(walletTransactions)) {
        walletTransactions.forEach((tx: any) => {
          const type = (tx.type || '').toLowerCase();
          const amount = Math.abs(Number(tx.amount) || 0);
          if (type === 'credit' || type === 'deposit') {
            creditsSum += amount;
          } else if (type === 'debit' || type === 'commission') {
            debitsSum += amount;
          }
        });
      }
      setTotalCreditsAdded(creditsSum);

      // 4. Fetch reward transactions (for bonus earnings)
      let rewardTransactions: any[] = [];
      try {
        const rewardResponse = await apiClient.get('reward-transactions');
        rewardTransactions = rewardResponse.data?.data || [];
      } catch (err) {
        console.log('[Earnings] Reward transactions check error:', err);
      }

      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
      const thirtyDaysAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;

      let todayEarnings = 0;
      let todayRidesCount = 0;
      let weeklyEarnings = 0;
      let monthlyEarnings = 0;
      let grossEarnings = 0;
      let totalDistanceKm = 0;

      completedRides.forEach((ride: any) => {
        const fare = ride.acceptedOffer?.offerAmount || ride.offerPrice || 0;
        const rideDateStr = ride.completedAt || ride.updatedAt || ride.createdAt;
        const rideTime = rideDateStr ? new Date(rideDateStr).getTime() : 0;

        grossEarnings += fare;

        if (rideTime >= startOfToday) {
          todayEarnings += fare;
          todayRidesCount += 1;
        }

        if (rideTime >= sevenDaysAgo) {
          weeklyEarnings += fare;
        }

        if (rideTime >= thirtyDaysAgo) {
          monthlyEarnings += fare;
        }

        // Distance calculation
        const distStr = ride.estDistance?.distance?.text || ride.estDistance?.text || ride.distance || '';
        if (distStr) {
          const match = distStr.match(/([\d.]+)/);
          if (match && match[1]) {
            totalDistanceKm += parseFloat(match[1]);
          }
        }
      });

      // Calculate commission paid
      const commission = debitsSum > 0 ? debitsSum : walletTransactions.reduce((total: number, tx: any) => {
        const desc = (tx.desc || tx.description || '').toLowerCase();
        const type = (tx.type || '').toLowerCase();
        if (desc.includes('commission') && type === 'debit') {
          return total + Math.abs(tx.amount || 0);
        }
        return total;
      }, 0);

      // Calculate rewards earned
      const rewards = rewardTransactions.reduce((total: number, tx: any) => {
        if (tx.type === 'EARNED') {
          return total + (tx.amount || 0);
        }
        return total;
      }, 0);

      const netProfit = grossEarnings - commission + rewards;

      setEarningsData({
        todayEarnings,
        todayRides: todayRidesCount,
        weeklyEarnings,
        monthlyEarnings,
        grossEarnings,
        commission,
        rewards,
        netProfit,
        totalCompletedRides: completedRides.length,
        totalDistanceKm: parseFloat(totalDistanceKm.toFixed(1)),
        completedRidesList: completedRides.slice(0, 10), // Recent 10 rides
      });
    } catch (err: any) {
      console.error('[Earnings] Failed to load earnings data:', err);
      showModal('error', 'Error', 'Failed to load earnings data. Please pull down to refresh.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchEarnings();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchEarnings();
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAF8FE' }}>
        <ActivityIndicator size="large" color="#BC001F" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAF8FE" translucent={false} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: topPadding, height: 56 + topPadding }]}>
        <View style={{ width: 24 }} />
        <Text style={styles.headerTitle}>Earnings</Text>
        <TouchableOpacity
          onPress={() => router.push('/(common)/notifications' as any)}
          style={styles.headerIconButton}
          activeOpacity={0.8}
        >
          <MaterialIcons name="notifications" size={24} color="#BC001F" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#BC001F']}
            tintColor="#BC001F"
          />
        }
      >
        {/* Today's Hero Earnings Card */}
        <View style={styles.heroEarningsCard}>
          <View style={styles.heroCardHeader}>
            <View>
              <Text style={styles.heroSublabel}>TODAY&apos;S NET EARNINGS</Text>
              <Text style={styles.heroAmount}>रू {Math.round(earningsData.todayEarnings)}</Text>
            </View>
            <View style={styles.heroIconBadge}>
              <MaterialIcons name="account-balance-wallet" size={28} color="#BC001F" />
            </View>
          </View>

          <View style={styles.heroFooterRow}>
            <View style={styles.heroMetricPill}>
              <MaterialIcons name="directions-car" size={16} color="#BC001F" style={{ marginRight: 4 }} />
              <Text style={styles.heroMetricText}>{earningsData.todayRides} rides today</Text>
            </View>
            <Text style={styles.heroPayoutStatus}>Updated live</Text>
          </View>
        </View>

        {/* Dynamic Driver Wallet & Deposit Account Card */}
        <View style={styles.walletDepositCard}>
          <View style={styles.walletCardHeader}>
            <View style={styles.walletTitleRow}>
              <View style={styles.walletIconCircle}>
                <MaterialIcons name="account-balance-wallet" size={22} color="#059669" />
              </View>
              <View>
                <Text style={styles.walletSublabel}>DRIVER WALLET DEPOSIT</Text>
                <Text style={styles.walletAmountText}>
                  रू {walletBalance.toFixed(0)}
                </Text>
              </View>
            </View>

            {/* Dynamic Status Badge */}
            <View style={[
              styles.walletStatusBadge,
              walletBalance >= 50 ? styles.walletStatusActive : styles.walletStatusLow
            ]}>
              <View style={[
                styles.walletStatusDot,
                { backgroundColor: walletBalance >= 50 ? '#10B981' : '#EF4444' }
              ]} />
              <Text style={[
                styles.walletStatusText,
                { color: walletBalance >= 50 ? '#065F46' : '#991B1B' }
              ]}>
                {walletBalance >= 50 ? 'Active & Eligible' : 'Low Deposit (< रू 50)'}
              </Text>
            </View>
          </View>

          {/* Wallet Balance Details */}
          <View style={styles.walletBreakdownContainer}>
            <View style={styles.walletStatItem}>
              <Text style={styles.walletStatLabel}>Admin Top-ups / Added</Text>
              <Text style={styles.walletStatCredit}>+ रू {Math.round(totalCreditsAdded)}</Text>
            </View>
            <View style={styles.walletStatDivider} />
            <View style={styles.walletStatItem}>
              <Text style={styles.walletStatLabel}>Platform Commission Deductions</Text>
              <Text style={styles.walletStatDebit}>- रू {Math.round(earningsData.commission)}</Text>
            </View>
          </View>

          <View style={styles.walletNoticeRow}>
            <MaterialIcons name="info-outline" size={14} color="#6B7280" />
            <Text style={styles.walletNoticeText}>
              {walletBalance >= 50 
                ? 'Your deposit balance is healthy. You can accept incoming rides.'
                : 'Minimum deposit of रू 50 required to accept passenger ride offers.'}
            </Text>
          </View>
        </View>

        {/* Breakdown Grid Cards */}
        <View style={styles.gridRow}>
          {/* Weekly Earnings */}
          <View style={styles.gridCard}>
            <View style={[styles.gridIconCircle, { backgroundColor: '#F4F3F8' }]}>
              <MaterialIcons name="date-range" size={20} color="#BC001F" />
            </View>
            <Text style={styles.gridCardLabel}>THIS WEEK</Text>
            <Text style={styles.gridCardValue}>रू {Math.round(earningsData.weeklyEarnings)}</Text>
          </View>

          {/* Monthly Earnings */}
          <View style={styles.gridCard}>
            <View style={[styles.gridIconCircle, { backgroundColor: '#F4F3F8' }]}>
              <MaterialIcons name="calendar-today" size={20} color="#286182" />
            </View>
            <Text style={styles.gridCardLabel}>THIS MONTH</Text>
            <Text style={styles.gridCardValue}>रू {Math.round(earningsData.monthlyEarnings)}</Text>
          </View>
        </View>

        <View style={styles.gridRow}>
          {/* Completed Rides */}
          <View style={styles.gridCard}>
            <View style={[styles.gridIconCircle, { backgroundColor: '#F4F3F8' }]}>
              <MaterialIcons name="check-circle-outline" size={20} color="#16A34A" />
            </View>
            <Text style={styles.gridCardLabel}>COMPLETED RIDES</Text>
            <Text style={styles.gridCardValue}>{earningsData.totalCompletedRides}</Text>
          </View>

          {/* Total Distance */}
          <View style={styles.gridCard}>
            <View style={[styles.gridIconCircle, { backgroundColor: '#F4F3F8' }]}>
              <MaterialIcons name="map" size={20} color="#D97706" />
            </View>
            <Text style={styles.gridCardLabel}>TOTAL DISTANCE</Text>
            <Text style={styles.gridCardValue}>
              {earningsData.totalDistanceKm > 0 ? `${earningsData.totalDistanceKm} km` : 'N/A'}
            </Text>
          </View>
        </View>

        {/* Financial Summary Card */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>FINANCIAL SUMMARY</Text>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Gross Ride Earnings</Text>
            <Text style={styles.summaryValue}>रू {Math.round(earningsData.grossEarnings)}</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Commission & Platform Fees</Text>
            <Text style={[styles.summaryValue, { color: '#DC2626' }]}>
              - रू {Math.round(earningsData.commission)}
            </Text>
          </View>

          {earningsData.rewards > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Driver Rewards & Bonuses</Text>
              <Text style={[styles.summaryValue, { color: '#16A34A' }]}>
                + रू {Math.round(earningsData.rewards)}
              </Text>
            </View>
          )}

          <View style={styles.divider} />

          <View style={styles.summaryRow}>
            <Text style={styles.netProfitLabel}>Net Earnings / Profit</Text>
            <Text style={styles.netProfitValue}>रू {Math.round(earningsData.netProfit)}</Text>
          </View>
        </View>

        {/* Recent Completed Trips List */}
        <View style={styles.tripsSection}>
          <Text style={styles.sectionTitle}>RECENT COMPLETED TRIPS</Text>

          {earningsData.completedRidesList.length > 0 ? (
            earningsData.completedRidesList.map((ride) => (
              <View key={ride._id} style={styles.tripCard}>
                <View style={styles.tripHeader}>
                  <View style={styles.passengerInfo}>
                    <MaterialIcons name="person" size={18} color="#5D3F3D" style={{ marginRight: 6 }} />
                    <Text style={styles.passengerName}>
                      {ride.passenger?.firstName || 'Passenger'} {ride.passenger?.lastName || ''}
                    </Text>
                  </View>
                  <Text style={styles.tripFare}>
                    + रू {Math.round(ride.acceptedOffer?.offerAmount || ride.offerPrice || 0)}
                  </Text>
                </View>

                <View style={styles.tripRoute}>
                  <Text style={styles.routeText} numberOfLines={1}>
                    📍 {ride.pickUpLocation || ride.pickUp?.location || 'Pickup'}
                  </Text>
                  <Text style={styles.routeText} numberOfLines={1}>
                    🏁 {ride.dropOffLocation || ride.dropOff?.location || 'Dropoff'}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyCard}>
              <MaterialIcons name="account-balance-wallet" size={48} color="#926E6C" style={{ opacity: 0.5 }} />
              <Text style={styles.emptyTitle}>No earnings recorded yet</Text>
              <Text style={styles.emptySubtitle}>
                Go online on the Driver Map to start accepting rides and earn money!
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Fixed Driver Bottom Navigation */}
      <DriverBottomNav activeTab="earnings" />



      <AppModal
        visible={modal.visible}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        onClose={hideModal}
      />
    </View>
  );
};

export default DriverEarningsScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF8FE',
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    backgroundColor: '#FAF8FE',
    borderBottomWidth: 1,
    borderBottomColor: '#EFEDF3',
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    fontSize: 24,
    fontWeight: '800',
    color: '#BC001F',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 110,
  },
  heroEarningsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 3,
    borderLeftWidth: 4,
    borderLeftColor: '#BC001F',
  },
  heroCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  heroSublabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5D3F3D',
    letterSpacing: 0.8,
  },
  heroAmount: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1A1B1F',
    marginTop: 4,
  },
  heroIconBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FAF8FE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#EFEDF3',
  },
  heroMetricPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAF8FE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  heroMetricText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1A1B1F',
  },
  heroPayoutStatus: {
    fontSize: 12,
    color: '#5D3F3D',
    fontWeight: '500',
  },
  walletDepositCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 3,
    borderLeftWidth: 4,
    borderLeftColor: '#059669',
  },
  walletCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  walletTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  walletIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  walletSublabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 0.7,
  },
  walletAmountText: {
    fontSize: 26,
    fontWeight: '800',
    color: '#059669',
    marginTop: 2,
  },
  walletStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 5,
  },
  walletStatusActive: {
    backgroundColor: '#D1FAE5',
  },
  walletStatusLow: {
    backgroundColor: '#FEE2E2',
  },
  walletStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  walletStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  walletBreakdownContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  walletStatItem: {
    flex: 1,
  },
  walletStatLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 2,
  },
  walletStatCredit: {
    fontSize: 13,
    fontWeight: '700',
    color: '#059669',
  },
  walletStatDebit: {
    fontSize: 13,
    fontWeight: '700',
    color: '#DC2626',
  },
  walletStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 10,
  },
  walletNoticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 4,
  },
  walletNoticeText: {
    fontSize: 11.5,
    color: '#64748B',
    flex: 1,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  gridCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 3,
  },
  gridIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  gridCardLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#5D3F3D',
    letterSpacing: 0.6,
  },
  gridCardValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1A1B1F',
    marginTop: 2,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 3,
  },
  summaryTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5D3F3D',
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  summaryLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#5D3F3D',
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1B1F',
  },
  divider: {
    height: 1,
    backgroundColor: '#EFEDF3',
    marginVertical: 10,
  },
  netProfitLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1B1F',
  },
  netProfitValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#BC001F',
  },
  tripsSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5D3F3D',
    letterSpacing: 0.8,
    marginBottom: 12,
    marginLeft: 4,
  },
  tripCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  tripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  passengerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passengerName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1B1F',
  },
  tripFare: {
    fontSize: 15,
    fontWeight: '800',
    color: '#16A34A',
  },
  tripRoute: {
    gap: 4,
  },
  routeText: {
    fontSize: 13,
    color: '#5D3F3D',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 3,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1B1F',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#5D3F3D',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
});
