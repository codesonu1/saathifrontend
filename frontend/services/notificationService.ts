import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';

export type NotificationType = 
  | 'wallet_low' 
  | 'wallet_zero'
  | 'ride_completed' 
  | 'ride_cancelled'
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
  private static STORAGE_KEY = '@saathi_notifications_v2';
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
      // Passenger ONLY sees: Trip Completed, Trip Cancelled
      return this.notifications.filter(
        (n) => n.role === 'passenger' && (n.type === 'ride_completed' || n.type === 'ride_cancelled')
      );
    }

    if (role === 'driver') {
      // Driver ONLY sees: Trip Completed, Trip Cancelled, and Low/Zero Wallet Balance
      return this.notifications.filter(
        (n) =>
          n.role === 'driver' &&
          (n.type === 'ride_completed' ||
           n.type === 'ride_cancelled' ||
           n.type === 'wallet_low' ||
           n.type === 'wallet_zero')
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
  }): Promise<NotificationItem | null> {
    await this.init();

    // Auto-infer target role
    const targetRole: 'driver' | 'passenger' =
      params.role ||
      (params.type.startsWith('wallet_') ? 'driver' : 'passenger');

    // Strict allowed check:
    // Driver: Trip Completed, Trip Cancelled, Low Balance, Zero Balance
    // Passenger: Trip Completed, Trip Cancelled, Chat Messages
    const isDriverAllowed =
      targetRole === 'driver' &&
      (params.type === 'ride_completed' ||
       params.type === 'ride_cancelled' ||
       params.type === 'wallet_low' ||
       params.type === 'wallet_zero');

    const isPassengerAllowed =
      targetRole === 'passenger' &&
      (params.type === 'ride_completed' ||
       params.type === 'ride_cancelled' ||
       params.type === 'message');

    if (!isDriverAllowed && !isPassengerAllowed) {
      return null;
    }

    // Strip any emojis from title and message
    const cleanTitle = (params.title || '')
      .replace(/[\u{1F300}-\u{1FAFF}\u{1F600}-\u{1F64F}\u{2600}-\u{27BF}]/gu, '')
      .trim();
    const cleanMessage = (params.message || '')
      .replace(/[\u{1F300}-\u{1FAFF}\u{1F600}-\u{1F64F}\u{2600}-\u{27BF}]/gu, '')
      .trim();

    const isAllowedForStorage =
      (targetRole === 'passenger' && (params.type === 'ride_completed' || params.type === 'ride_cancelled')) ||
      (targetRole === 'driver' &&
        (params.type === 'ride_completed' ||
         params.type === 'ride_cancelled' ||
         params.type === 'wallet_low' ||
         params.type === 'wallet_zero'));

    const { icon, iconColor } = this.getDefaultVisuals(params.type, params.icon, params.iconColor);

    const newNotif: NotificationItem = {
      id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      type: params.type,
      title: cleanTitle,
      message: cleanMessage,
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
        actionRoute: params.actionRoute,
        actionParams: params.actionParams,
        duration: params.duration || 4500,
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

  private lastBalanceAlertTime = 0;

  /**
   * Checks driver balance and sends a one-time notification:
   * - Once when balance is low (< Rs. 50)
   * - Once when balance reaches 0 (Rs. 0)
   * Resets when driver balance is topped up >= 50.
   */
  async checkAndNotifyDriverBalance(balance: number): Promise<void> {
    try {
      const numBal = Number(balance) || 0;

      if (numBal >= 50) {
        await AsyncStorage.multiRemove([
          NotificationService.LOW_NOTIF_KEY,
          NotificationService.ZERO_NOTIF_KEY,
        ]);
        return;
      }

      // Enforce a 30-minute in-memory cooldown to prevent looping
      const now = Date.now();
      if (now - this.lastBalanceAlertTime < 30 * 60 * 1000) {
        return;
      }

      if (numBal <= 0) {
        const alreadyNotifiedZero = await AsyncStorage.getItem(NotificationService.ZERO_NOTIF_KEY);
        if (!alreadyNotifiedZero) {
          this.lastBalanceAlertTime = now;
          await this.addNotification({
            type: 'wallet_zero',
            title: 'Zero Wallet Balance Alert',
            message: 'Your deposit balance is Rs. 0. Recharge wallet to accept passenger rides.',
            role: 'driver',
            actionRoute: '/(driver)/earnings',
            showBanner: true,
            duration: 5000,
          });
          await AsyncStorage.setItem(NotificationService.ZERO_NOTIF_KEY, 'true');
        }
        return;
      }

      if (numBal > 0 && numBal < 50) {
        const alreadyNotifiedLow = await AsyncStorage.getItem(NotificationService.LOW_NOTIF_KEY);
        if (!alreadyNotifiedLow) {
          this.lastBalanceAlertTime = now;
          await this.addNotification({
            type: 'wallet_low',
            title: 'Low Wallet Balance',
            message: `Your balance is Rs. ${numBal.toFixed(0)}. Minimum Rs. 50 required to accept rides.`,
            role: 'driver',
            actionRoute: '/(driver)/earnings',
            showBanner: true,
            duration: 5000,
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
      case 'wallet_low':
        return { icon: 'warning', iconColor: '#D97706' };
      case 'wallet_zero':
        return { icon: 'error', iconColor: '#DC2626' };
      case 'ride_completed':
        return { icon: 'done-all', iconColor: '#16A34A' };
      case 'ride_cancelled':
        return { icon: 'cancel', iconColor: '#DC2626' };
      case 'message':
        return { icon: 'chat', iconColor: '#6366F1' };
      default:
        return { icon: 'notifications', iconColor: '#64748B' };
    }
  }
}

export const notificationService = new NotificationService();
export default notificationService;