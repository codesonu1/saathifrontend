import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';

export type NotificationType = 
  | 'wallet_credit' 
  | 'wallet_low' 
  | 'wallet_zero'
  | 'wallet_debit'
  | 'ride_request' 
  | 'ride_accepted' 
  | 'driver_arrived' 
  | 'ride_started' 
  | 'ride_completed' 
  | 'ride_cancelled'
  | 'rating_received' 
  | 'rating_prompt'
  | 'message'
  | 'info';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  time: string;
  icon: string;
  iconColor: string;
  unread: boolean;
  role?: 'driver' | 'passenger' | 'all';
  actionRoute?: string;
  actionParams?: Record<string, any>;
  createdAt: number;
}

class NotificationService {
  private static STORAGE_KEY = '@saathi_notifications_v1';
  private static LOW_NOTIF_KEY = '@saathi_notified_low_balance';
  private static ZERO_NOTIF_KEY = '@saathi_notified_zero_balance';

  private listeners: (() => void)[] = [];
  private notifications: NotificationItem[] = [];
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    try {
      const stored = await AsyncStorage.getItem(NotificationService.STORAGE_KEY);
      if (stored) {
        this.notifications = JSON.parse(stored);
      }
    } catch (e) {
      console.warn('[NotificationService] Failed to load stored notifications', e);
      this.notifications = [];
    }
    this.initialized = true;
  }

  private async save(): Promise<void> {
    try {
      await AsyncStorage.setItem(
        NotificationService.STORAGE_KEY,
        JSON.stringify(this.notifications.slice(0, 100))
      );
    } catch (e) {
      console.warn('[NotificationService] Failed to save notifications', e);
    }
  }

  private notifyListeners(): void {
    this.listeners.forEach((fn) => fn());
  }

  subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  async getNotifications(role?: 'driver' | 'passenger'): Promise<NotificationItem[]> {
    await this.init();
    if (!role) return [...this.notifications];
    
    if (role === 'passenger') {
      // Passenger ONLY sees: Trip Completed
      return this.notifications.filter(
        (n) => n.role === 'passenger' && n.type === 'ride_completed'
      );
    }

    if (role === 'driver') {
      // Driver ONLY sees: Trip Completed, Passenger Rating, and Wallet Low / Zero / Credit Alerts
      return this.notifications.filter(
        (n) =>
          n.role === 'driver' &&
          (n.type === 'ride_completed' ||
           n.type === 'rating_received' ||
           n.type.startsWith('wallet_'))
      );
    }

    return this.notifications.filter((n) => n.role === role);
  }

  async addNotification(params: {
    type: NotificationType;
    title: string;
    message: string;
    icon?: string;
    iconColor?: string;
    role?: 'driver' | 'passenger';
    actionRoute?: string;
    actionParams?: Record<string, any>;
    showBanner?: boolean;
    duration?: number;
  }): Promise<NotificationItem> {
    await this.init();

    // Auto-infer target role
    const targetRole =
      params.role ||
      (params.type.startsWith('wallet_') ||
       params.type === 'rating_received' ||
       params.type === 'ride_request' ||
       params.type === 'ride_accepted'
        ? 'driver'
        : 'passenger');

    // ONLY store important notifications in persistent inbox:
    // - Passenger: Trip Completed
    // - Driver: Trip Completed, Rating Received, Wallet Low/Zero/Credit
    const isAllowedForStorage =
      (targetRole === 'passenger' && params.type === 'ride_completed') ||
      (targetRole === 'driver' &&
        (params.type === 'ride_completed' ||
         params.type === 'rating_received' ||
         params.type.startsWith('wallet_')));

    const { icon, iconColor } = this.getDefaultVisuals(params.type, params.icon, params.iconColor);

    const newNotif: NotificationItem = {
      id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      type: params.type,
      title: params.title,
      message: params.message,
      time: 'Just now',
      icon,
      iconColor,
      unread: true,
      role: targetRole,
      actionRoute: params.actionRoute,
      actionParams: params.actionParams,
      createdAt: Date.now(),
    };

    if (isAllowedForStorage) {
      this.notifications = [newNotif, ...this.notifications];
      await this.save();
      this.notifyListeners();
    }

    if (params.showBanner !== false) {
      DeviceEventEmitter.emit('showInteractiveNotification', {
        title: newNotif.title,
        message: newNotif.message,
        type: newNotif.type,
        role: targetRole,
        actionLabel: params.actionRoute ? 'View' : undefined,
        actionRoute: params.actionRoute,
        actionParams: params.actionParams,
        duration: params.duration || 5000,
      });
    }

    return newNotif;
  }

  async markAsRead(id: string): Promise<void> {
    await this.init();
    this.notifications = this.notifications.map((n) =>
      n.id === id ? { ...n, unread: false } : n
    );
    await this.save();
    this.notifyListeners();
  }

  async markAllAsRead(role?: 'driver' | 'passenger'): Promise<void> {
    await this.init();
    this.notifications = this.notifications.map((n) => {
      if (!role || n.role === role) {
        return { ...n, unread: false };
      }
      return n;
    });
    await this.save();
    this.notifyListeners();
  }

  async deleteNotification(id: string): Promise<void> {
    await this.init();
    this.notifications = this.notifications.filter((n) => n.id !== id);
    await this.save();
    this.notifyListeners();
  }

  async clearAll(role?: 'driver' | 'passenger'): Promise<void> {
    await this.init();
    if (!role) {
      this.notifications = [];
    } else {
      this.notifications = this.notifications.filter((n) => n.role !== role);
    }
    await this.save();
    this.notifyListeners();
  }

  async getUnreadCount(role?: 'driver' | 'passenger'): Promise<number> {
    const list = await this.getNotifications(role);
    return list.filter((n) => n.unread).length;
  }

  /**
   * Checks driver balance and sends a one-time non-looping notification:
   * - Once when balance is low (< रू 50)
   * - Once when balance reaches 0 (रू 0)
   * Resets when driver balance is topped up >= 50.
   */
  async checkAndNotifyDriverBalance(balance: number): Promise<void> {
    try {
      const numBal = Number(balance) || 0;

      if (numBal >= 50) {
        // Driver topped up wallet: reset notification flags
        await AsyncStorage.multiRemove([
          NotificationService.LOW_NOTIF_KEY,
          NotificationService.ZERO_NOTIF_KEY,
        ]);
        return;
      }

      if (numBal <= 0) {
        // Zero balance: check if already notified
        const alreadyNotifiedZero = await AsyncStorage.getItem(NotificationService.ZERO_NOTIF_KEY);
        if (!alreadyNotifiedZero) {
          await this.addNotification({
            type: 'wallet_zero',
            title: 'Zero Wallet Balance Alert',
            message: 'Your deposit balance is रू 0. You cannot accept or receive passenger ride offers until recharged.',
            role: 'driver',
            actionRoute: '/(driver)/earnings',
            showBanner: true,
            duration: 6500,
          });
          await AsyncStorage.setItem(NotificationService.ZERO_NOTIF_KEY, 'true');
        }
        return;
      }

      if (numBal > 0 && numBal < 50) {
        // Low balance (< 50): check if already notified
        const alreadyNotifiedLow = await AsyncStorage.getItem(NotificationService.LOW_NOTIF_KEY);
        if (!alreadyNotifiedLow) {
          await this.addNotification({
            type: 'wallet_low',
            title: 'Low Wallet Balance',
            message: `Your balance is रू ${numBal.toFixed(0)}. Minimum रू 50 required to accept rides. Please recharge your wallet.`,
            role: 'driver',
            actionRoute: '/(driver)/earnings',
            showBanner: true,
            duration: 6000,
          });
          await AsyncStorage.setItem(NotificationService.LOW_NOTIF_KEY, 'true');
        }
      }
    } catch (e) {
      console.warn('[NotificationService] Balance check error:', e);
    }
  }

  private getDefaultVisuals(
    type: NotificationType,
    customIcon?: string,
    customColor?: string
  ): { icon: string; iconColor: string } {
    if (customIcon && customColor) {
      return { icon: customIcon, iconColor: customColor };
    }

    switch (type) {
      case 'wallet_credit':
        return { icon: 'account-balance-wallet', iconColor: '#2E7D32' };
      case 'wallet_low':
        return { icon: 'warning', iconColor: '#D97706' };
      case 'wallet_zero':
        return { icon: 'error', iconColor: '#DC2626' };
      case 'wallet_debit':
        return { icon: 'receipt-long', iconColor: '#475569' };
      case 'ride_request':
        return { icon: 'directions-car', iconColor: '#BC001F' };
      case 'ride_accepted':
        return { icon: 'check-circle', iconColor: '#2563EB' };
      case 'driver_arrived':
        return { icon: 'location-on', iconColor: '#059669' };
      case 'ride_started':
        return { icon: 'navigation', iconColor: '#2563EB' };
      case 'ride_completed':
        return { icon: 'done-all', iconColor: '#16A34A' };
      case 'ride_cancelled':
        return { icon: 'cancel', iconColor: '#DC2626' };
      case 'rating_received':
      case 'rating_prompt':
        return { icon: 'star', iconColor: '#EAB308' };
      case 'message':
        return { icon: 'chat', iconColor: '#6366F1' };
      default:
        return { icon: 'notifications', iconColor: '#64748B' };
    }
  }
}

export const notificationService = new NotificationService();
export default notificationService;