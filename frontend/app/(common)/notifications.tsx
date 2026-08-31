import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  FlatList,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { notificationService, NotificationItem, NotificationType } from '@/services/notificationService';
import { userRoleManager } from '@/services/userRoleManager';
import websocketService from '@/services/websocketService';
import apiClient from '@/services/apiClient';
import Toast from '../../components/ui/Toast';

type FilterTab = 'all' | 'rides' | 'wallet';

const NotificationsScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPadding = Math.max(insets.top + (Platform.OS === 'android' ? 8 : 4), 36);
  const bottomPadding = Math.max(insets.bottom + 16, 24);

  const [currentRole, setCurrentRole] = useState<'driver' | 'passenger'>('passenger');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: 'info' | 'success' | 'error';
  }>({
    visible: false,
    message: '',
    type: 'info',
  });

  const showToast = (message: string, type: 'info' | 'success' | 'error') => {
    setToast({ visible: true, message, type });
    if (type === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (type === 'error') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    else Haptics.selectionAsync();
  };

  const hideToast = () => setToast((prev) => ({ ...prev, visible: false }));

  const loadNotifications = useCallback(async () => {
    try {
      const role = await userRoleManager.getRole();
      setCurrentRole(role);
      if (role === 'passenger' && activeTab === 'wallet') {
        setActiveTab('all');
      }
      const items = await notificationService.getNotifications(role);
      setNotifications(items);
    } catch (error) {
      console.warn('[Notifications] Error loading items:', error);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadNotifications();
    const unsubscribe = notificationService.subscribe(() => {
      loadNotifications();
    });
    return () => unsubscribe();
  }, [loadNotifications]);

  // Fetch current user & initialize role
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const role = userRoleManager.getRole();
        setCurrentRole(role);

        const response = await apiClient.get('/users/me');
        if (response.data?.data?._id || response.data?.data?.id) {
          const uId = response.data.data._id || response.data.data.id;
          setCurrentUserId(uId);

          // Driver balance check (triggers single non-looping notification when low or zero)
          if (role === 'driver') {
            const bal = response.data.data.walletBalance ?? response.data.data.wallet ?? response.data.data.balance ?? 100;
            await notificationService.checkAndNotifyDriverBalance(Number(bal) || 0);
          }
        }
      } catch (err) {
        console.warn('[Notifications] Failed to load current user:', err);
      }
    };
    fetchUser();
  }, []);

  // Listen to live WebSocket events to capture real-time notifications
  useEffect(() => {
    let isMounted = true;

    const setupSocketListeners = async () => {
      try {
        const role = userRoleManager.getRole();
        setCurrentRole(role);

        // Driver-only notifications
        if (role === 'driver') {
          const handleNewRideRequest = (data: any) => {
            if (!isMounted) return;
            const ride = data?.data || data;
            notificationService.addNotification({
              type: 'ride_request',
              title: 'New Ride Request Nearby',
              message: `Pickup: ${ride?.pickUp?.location || ride?.pickUpLocation || 'Nearby'} • Fare: रू ${ride?.offerPrice || ride?.fare || 150}`,
              role: 'driver',
              actionRoute: '/(driver)/driverSection',
            });
          };

          const handleOfferAccepted = (data: any) => {
            if (!isMounted) return;
            const ride = data?.data?.ride || data?.ride || data?.data;
            notificationService.addNotification({
              type: 'ride_accepted',
              title: 'Ride Offer Accepted',
              message: 'Passenger accepted your offer! Tap to view live trip route.',
              role: 'driver',
              actionRoute: '/(common)/rideTracker',
              actionParams: { rideId: ride?._id || data?.rideId },
            });
          };

          const handleWalletUpdated = (data: any) => {
            if (!isMounted) return;
            const payload = data?.data || data;
            const isCredit = payload?.type === 'credit' || payload?.amount > 0;
            notificationService.addNotification({
              type: isCredit ? 'wallet_credit' : 'wallet_debit',
              title: isCredit ? 'Wallet Balance Credited' : 'Wallet Deduction',
              message: isCredit
                ? `रू ${payload?.amount || 0} has been added to your account by Admin.`
                : `रू ${payload?.amount || 0} deducted for ride commission.`,
              role: 'driver',
            });
          };

          websocketService.on('newRideRequest', handleNewRideRequest, 'driver');
          websocketService.on('offerAccepted', handleOfferAccepted, 'driver');
          websocketService.on('walletUpdated', handleWalletUpdated, 'driver');
        }

        // Passenger-only notifications
        if (role === 'passenger') {
          const handleDriverArrived = (data: any) => {
            if (!isMounted) return;
            notificationService.addNotification({
              type: 'driver_arrived',
              title: 'Driver Has Arrived',
              message: 'Your driver has arrived at the pickup location.',
              role: 'passenger',
              actionRoute: '/(common)/rideTracker',
              actionParams: { rideId: data?.rideId },
            });
          };
          websocketService.on('driverArrived', handleDriverArrived, 'ride');
        }

        // Shared completion notification
        const handleRideCompleted = (data: any) => {
          if (!isMounted) return;
          const rideData = data?.data || data;
          const isDriver = role === 'driver';
          notificationService.addNotification({
            type: 'ride_completed',
            title: 'Trip Completed',
            message: isDriver
              ? `Ride completed successfully. Earned रू ${rideData?.acceptedOffer?.offerAmount || rideData?.offerPrice || 150}.`
              : 'You have arrived at your destination. Thank you for riding with Saathi.',
            role: isDriver ? 'driver' : 'passenger',
            actionRoute: '/(tabs)/rideRate',
            actionParams: { rideId: rideData?._id || data?.rideId },
          });
        };

        websocketService.on('rideCompleted', handleRideCompleted);
      } catch (err) {
        console.warn('[Notifications] Socket setup error:', err);
      }
    };

    setupSocketListeners();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleMarkAllRead = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await notificationService.markAllAsRead(currentRole);
    showToast('All marked as read', 'success');
  };

  const handleClearAll = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await notificationService.clearAll(currentRole);
    showToast('All notifications cleared', 'info');
  };

  const handleNotificationPress = async (item: NotificationItem) => {
    Haptics.selectionAsync();
    await notificationService.markAsRead(item.id);
    
    if (item.actionRoute) {
      router.push({
        pathname: item.actionRoute as any,
        params: item.actionParams,
      });
    }
  };

  const handleDeleteItem = async (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await notificationService.deleteNotification(id);
    showToast('Notification removed', 'info');
  };

  const filteredNotifications = notifications.filter((item) => {
    if (activeTab === 'rides') {
      return (
        item.type === 'ride_request' ||
        item.type === 'ride_accepted' ||
        item.type === 'driver_arrived' ||
        item.type === 'ride_started' ||
        item.type === 'ride_completed' ||
        item.type === 'ride_cancelled'
      );
    }
    if (activeTab === 'wallet') {
      return (
        item.type === 'wallet_credit' ||
        item.type === 'wallet_low' ||
        item.type === 'wallet_zero' ||
        item.type === 'wallet_debit'
      );
    }
    return true;
  });

  const unreadCount = notifications.filter((n) => n.unread).length;

  const renderItem = ({ item }: { item: NotificationItem }) => {
    const isUnread = item.unread;
    const timeFormatted = item.createdAt 
      ? getTimeAgo(item.createdAt)
      : item.time;

    return (
      <TouchableOpacity
        style={[styles.card, isUnread && styles.unreadCard]}
        onPress={() => handleNotificationPress(item)}
        activeOpacity={0.8}
      >
        <View style={[styles.iconContainer, { backgroundColor: `${item.iconColor}14` }]}>
          <MaterialIcons name={item.icon as any} size={22} color={item.iconColor} />
        </View>

        <View style={styles.textContainer}>
          <View style={styles.cardHeaderRow}>
            <Text style={[styles.cardTitle, isUnread && styles.unreadTitle]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.timeText}>{timeFormatted}</Text>
          </View>
          <Text style={styles.messageText} numberOfLines={2}>
            {item.message}
          </Text>
        </View>

        <View style={styles.actionContainer}>
          {isUnread && <View style={styles.unreadDot} />}
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => handleDeleteItem(item.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="trash-outline" size={16} color="#94A3B8" />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyStateContainer}>
      <View style={styles.emptyIconCircle}>
        <Ionicons name="notifications-off-outline" size={36} color="#94A3B8" />
      </View>
      <Text style={styles.emptyTitle}>No Notifications</Text>
      <Text style={styles.emptySubtitle}>
        {activeTab === 'all'
          ? "You're all caught up! Important updates about rides and wallet will appear here."
          : `No ${activeTab} notifications at the moment.`}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Notch-Safe Header */}
      <View style={[styles.header, { paddingTop: topPadding }]}>
        <TouchableOpacity 
          onPress={() => router.back()} 
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Notifications</Text>

        {notifications.length > 0 && (
          <TouchableOpacity onPress={handleClearAll} style={styles.clearAllBtn}>
            <Text style={styles.clearAllText}>Clear All</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'all' && styles.activeTabButton]}
          onPress={() => {
            Haptics.selectionAsync();
            setActiveTab('all');
          }}
        >
          <Text style={[styles.tabText, activeTab === 'all' && styles.activeTabText]}>
            All {unreadCount > 0 ? `(${unreadCount})` : ''}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'rides' && styles.activeTabButton]}
          onPress={() => {
            Haptics.selectionAsync();
            setActiveTab('rides');
          }}
        >
          <Text style={[styles.tabText, activeTab === 'rides' && styles.activeTabText]}>
            Rides
          </Text>
        </TouchableOpacity>

        {currentRole === 'driver' && (
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'wallet' && styles.activeTabButton]}
            onPress={() => {
              Haptics.selectionAsync();
              setActiveTab('wallet');
            }}
          >
            <Text style={[styles.tabText, activeTab === 'wallet' && styles.activeTabText]}>
              Wallet & Credit
            </Text>
          </TouchableOpacity>
        )}

        {unreadCount > 0 && (
          <TouchableOpacity 
            style={styles.markReadAction} 
            onPress={handleMarkAllRead}
          >
            <Ionicons name="checkmark-done" size={16} color="#BC001F" style={{ marginRight: 4 }} />
            <Text style={styles.markReadActionText}>Mark Read</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Notifications List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#BC001F" />
        </View>
      ) : (
        <FlatList
          data={filteredNotifications}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: bottomPadding }]}
          ListEmptyComponent={renderEmptyState}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Toast visible={toast.visible} message={toast.message} type={toast.type} onHide={hideToast} />
    </View>
  );
};

function getTimeAgo(timestamp: number): string {
  const diffSecs = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSecs < 60) return 'Just now';
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backButton: {
    padding: 6,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
    marginLeft: 8,
  },
  clearAllBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  clearAllText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 8,
  },
  tabButton: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  activeTabButton: {
    backgroundColor: '#0F172A',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  activeTabText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  markReadAction: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  markReadActionText: {
    color: '#BC001F',
    fontSize: 12,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  unreadCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderLeftWidth: 3,
    borderLeftColor: '#BC001F',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  textContainer: {
    flex: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    flex: 1,
    marginRight: 8,
  },
  unreadTitle: {
    fontWeight: '700',
    color: '#0F172A',
  },
  timeText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  messageText: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
  actionContainer: {
    alignItems: 'center',
    justifyContent: 'space-between',
    marginLeft: 8,
    alignSelf: 'stretch',
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#BC001F',
  },
  deleteButton: {
    marginTop: 'auto',
    padding: 4,
  },
  emptyStateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 24,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default NotificationsScreen;