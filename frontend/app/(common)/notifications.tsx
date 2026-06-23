import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import websocketService from '../utils/websocketService';
import apiClient from '../utils/apiClient';
import Toast from '../../components/ui/Toast';
import { userRoleManager } from '../utils/userRoleManager';
import * as Haptics from 'expo-haptics';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  time: string;
  icon: string;
  iconColor: string;
  unread: boolean;
  createdAt?: Date;
}

const Notifications = () => {
  const router = useRouter();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: 'mock_1',
      type: 'ride_completed',
      title: 'Ride Completed',
      message: 'Your trip from Kathmandu to Lalitpur has been completed successfully. Fare: रू 150.',
      time: '10 mins ago',
      icon: 'check-circle',
      iconColor: '#4CAF50',
      unread: true,
    },
    {
      id: 'mock_2',
      type: 'promo',
      title: 'Special Promo Offer',
      message: 'Get 20% off on your next 3 rides! Use code SAATHI20 at checkout.',
      time: '2 hours ago',
      icon: 'local-offer',
      iconColor: '#FF9800',
      unread: true,
    },
    {
      id: 'mock_3',
      type: 'support',
      title: 'Support Update',
      message: 'Our support team has resolved your ticket regarding the payment query.',
      time: '1 day ago',
      icon: 'support-agent',
      iconColor: '#2196F3',
      unread: false,
    },
    {
      id: 'mock_4',
      type: 'account',
      title: 'Account Verified',
      message: 'Welcome to Saathi! Your profile registration is complete.',
      time: '2 days ago',
      icon: 'verified-user',
      iconColor: '#075B5E',
      unread: false,
    }
  ]);
  
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

  const hideToast = () => setToast(prev => ({ ...prev, visible: false }));

  const handleBackPress = () => {
    router.back();
  };

  const handleMarkAllRead = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setNotifications(prev => prev.map(n => ({ ...n, unread: false })));
    showToast('All notifications marked as read', 'success');
  };

  const handleClearAll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setNotifications([]);
    showToast('All notifications cleared', 'info');
  };

  const toggleNotificationRead = (id: string) => {
    Haptics.selectionAsync();
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, unread: !n.unread } : n))
    );
  };

  const deleteNotification = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setNotifications(prev => prev.filter(n => n.id !== id));
    showToast('Notification deleted', 'info');
  };

  // Get current user ID on component mount
  useEffect(() => {
    const getCurrentUser = async () => {
      try {
        setLoading(true);
        const response = await apiClient.get('me');
        if (response.data.data && response.data.data.id) {
          setCurrentUserId(response.data.data.id);
          console.log('Notifications: Current user ID set:', response.data.data.id);
        }
      } catch (error) {
        console.error('Notifications: Failed to get current user:', error);
      } finally {
        setLoading(false);
      }
    };
    getCurrentUser();
  }, []);

  useEffect(() => {
    let isMounted = true;
    let rideCompletedListener: any;

    async function setupWebSocket() {
      try {
        const userRole = await userRoleManager.getRole();
        if (userRole === 'driver') {
          await websocketService.connect(undefined, 'driver');
        } else {
          await websocketService.connect(undefined, 'passenger');
        }
        
        rideCompletedListener = (data: any) => {
          if (!currentUserId) {
            console.log('Notifications: No current user ID available, skipping notification');
            return;
          }

          const rideData = data?.data || data;
          const ridePassengerId = rideData?.passengerId || rideData?.passenger?.id || rideData?.passenger?._id;
          const rideDriverId = rideData?.driverId || rideData?.driver?.id || rideData?.driver?._id;
          
          console.log('Notifications: Ride completed event received:', data);
          
          const isMyRide = ridePassengerId === currentUserId || rideDriverId === currentUserId;
          
          if (isMyRide && isMounted) {
            console.log('Notifications: Adding notification for my completed ride');
            const newNotif: NotificationItem = {
              id: 'live_' + Date.now(),
              type: 'ride_completed',
              title: 'Ride Completed',
              message: data.message || `Your trip has been completed successfully.`,
              time: 'Just now',
              icon: 'check-circle',
              iconColor: '#4CAF50',
              unread: true,
              createdAt: new Date(),
            };
            setNotifications(prev => [newNotif, ...prev]);
            showToast('New notification: Ride Completed', 'info');
          }
        };

        websocketService.on('rideCompleted', rideCompletedListener);
        websocketService.on('error', (err) => {
          showToast('WebSocket error: ' + (err?.message || 'Unknown error'), 'error');
        });
      } catch (err) {
        showToast('WebSocket connection failed', 'error');
      }
    }

    if (currentUserId) {
      setupWebSocket();
    }

    return () => {
      isMounted = false;
      if (rideCompletedListener) {
        websocketService.off('rideCompleted', rideCompletedListener);
      }
      websocketService.off('error');
    };
  }, [currentUserId]);

  const renderNotificationItem = ({ item }: { item: NotificationItem }) => (
    <TouchableOpacity
      style={[styles.card, item.unread && styles.unreadCard]}
      onPress={() => toggleNotificationRead(item.id)}
      activeOpacity={0.7}
    >
      <View style={[styles.iconContainer, { backgroundColor: item.iconColor + '15' }]}>
        <Icon name={item.icon} size={24} color={item.iconColor} />
      </View>
      <View style={styles.textContainer}>
        <View style={styles.cardHeader}>
          <Text style={[styles.cardTitle, item.unread && styles.unreadText]}>{item.title}</Text>
          <Text style={styles.timeText}>{item.time}</Text>
        </View>
        <Text style={styles.messageText} numberOfLines={2}>{item.message}</Text>
      </View>
      <View style={styles.actionContainer}>
        {item.unread && <View style={styles.unreadDot} />}
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => deleteNotification(item.id)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Icon name="delete-outline" size={18} color="#999" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Icon name="notifications-none" size={72} color="#CCC" />
      <Text style={styles.emptyTitle}>You are all caught up!</Text>
      <Text style={styles.emptySubtitle}>No new notifications at the moment.</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
          <Icon name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        {notifications.length > 0 && (
          <TouchableOpacity onPress={handleClearAll} style={styles.clearAllButton}>
            <Text style={styles.clearAllText}>Clear All</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#075B5E" />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {notifications.length > 0 && (
            <View style={styles.subHeader}>
              <Text style={styles.countText}>
                {notifications.filter(n => n.unread).length} Unread
              </Text>
              <TouchableOpacity onPress={handleMarkAllRead}>
                <Text style={styles.markReadText}>Mark all as read</Text>
              </TouchableOpacity>
            </View>
          )}

          <FlatList
            data={notifications}
            renderItem={renderNotificationItem}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={renderEmptyState}
          />
        </View>
      )}

      <Toast visible={toast.visible} message={toast.message} type={toast.type} onHide={hideToast} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    marginTop: 33,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    flex: 1,
    marginLeft: 12,
  },
  clearAllButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  clearAllText: {
    color: '#EA2F14',
    fontSize: 14,
    fontWeight: '500',
  },
  subHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F8F9FA',
  },
  countText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  markReadText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#075B5E',
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E9ECEF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  unreadCard: {
    backgroundColor: '#F0F9FF',
    borderColor: '#B8E6E8',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#444',
  },
  unreadText: {
    color: '#000',
    fontWeight: '700',
  },
  timeText: {
    fontSize: 11,
    color: '#999',
  },
  messageText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  actionContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    gap: 8,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#075B5E',
  },
  deleteButton: {
    padding: 4,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default Notifications;