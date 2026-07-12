import { io, Socket } from 'socket.io-client';
import { getAccessToken, getCurrentUserId } from './apiClient';
import { userRoleManager } from './userRoleManager';
import Constants from 'expo-constants';
import { Platform, DeviceEventEmitter } from 'react-native';

export interface WebSocketResponse {
  code: number;
  message?: string;
  data?: any;
}

export interface RideOfferWebSocket {
  _id: string;
  rideId: string;
  driverId: string;
  offerAmount: number;
  status: string;
  driver: {
    _id: string;
    firstName: string;
    lastName: string;
    mobile: string;
  };
  driverProfile?: {
    vehicleModel: string;
    vehicleRegNum: string;
  };
}

class WebSocketService {
  private sockets: { [key: string]: Socket | null } = {};
  private isConnected: { [key: string]: boolean } = {};
  private connectionPromises: { [key: string]: Promise<void> | null } = {};
  private baseUrl: string = Platform.OS === 'web'
    ? 'http://localhost:9000'
    : (Constants.expoConfig?.extra?.WEBSOCKET_URL || 'http://10.0.2.2:9000');

  async connect(rideId?: string, namespace: 'driver' | 'passenger' | 'ride' = 'driver'): Promise<void> {
    try {
      // Check if already connected to this namespace
      if (this.sockets[namespace]?.connected) {
        console.log(`WebSocket: Already connected to ${namespace} namespace`);
        return;
      }

      // Get token from storage
      const token = await getAccessToken();
      console.log('WebSocket: Using token:', token);
      if (!token) {
        throw new Error('No authentication token found');
      }

      // Build namespace path
      let namespacePath: string;
      let queryParams: any = {};
      
      if (namespace === 'ride') {
        namespacePath = 'io/v1/ride';
        queryParams = { rideId };
      } else {
        namespacePath = `io/v1/${namespace}`;
      }

      const url = `${this.baseUrl}/${namespacePath}`;
      console.log(`WebSocket: Connecting to ${namespace} namespace for ride ${rideId || 'N/A'}`);
      console.log('WebSocket: Connecting to URL:', url);

      // Create socket connection
      this.sockets[namespace] = io(url, {
        auth: { token },
        query: queryParams,
        extraHeaders: {
          Authorization: `Bearer ${token}`
        },
        transports: ['websocket'],
        timeout: 20000,
        forceNew: true,
      });

      const socket = this.sockets[namespace];

      // Add global event logger for debugging (development only)
      if (process.env.NODE_ENV === 'development' && socket && typeof socket.onAny === 'function') {
        socket.onAny((event: string, ...args: any[]) => {
          console.log(`[WebSocket][onAny][${namespace}] Event:`, event, 'Args:', args);
        });
      }

      // Setup connection handlers
      socket.on('connect', () => {
        console.log(`WebSocket: Connected to ${namespace} namespace`);
        this.isConnected[namespace] = true;
        // Join the ride room after connecting to the 'ride' namespace
        if (namespace === 'ride' && rideId) {
          const room = `ride_${rideId}`;
          socket.emit('join', room);
          console.log(`WebSocket: Emitted join for room: ${room}`);
        }
      });

      socket.on('disconnect', (reason) => {
        console.log(`WebSocket: Disconnected from ${namespace} namespace:`, reason);
        this.isConnected[namespace] = false;
        this.connectionPromises[namespace] = null;
      });

      socket.on('connect_error', (error) => {
        // Suppress connection timeout errors from logs
        const errorMessage = error.message || '';
        if (errorMessage.includes('WebSocket connection timeout') || errorMessage.includes('timeout')) {
          console.log(`WebSocket: Connection timeout to ${namespace} namespace (suppressed from error logs)`);
        } else {
          console.error(`WebSocket: Connection error to ${namespace} namespace:`, error);
        }
        this.isConnected[namespace] = false;
        
        // Handle specific errors for ride namespace
        if (namespace === 'ride') {
          if (errorMessage.includes('Ride is no longer active') || errorMessage.includes('Ride is not in cancelable status')) {
            console.log(`WebSocket: Ride is cancelled, suppressing connection error`);
            // Don't throw this error, just log it
            return;
          }
        }
      });

      socket.on('error', (error) => {
        console.error(`WebSocket: Error in ${namespace} namespace:`, error);
      });

      // Setup event listeners for this namespace
      this.setupEventListeners(socket, namespace);

      // Wait for connection
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('WebSocket connection timeout'));
        }, 10000);

        socket.once('connect', () => {
          clearTimeout(timeout);
          resolve(true);
        });

        socket.once('connect_error', (error) => {
          clearTimeout(timeout);
          
          // Handle specific errors for ride namespace
          if (namespace === 'ride') {
            const errorMessage = error.message || '';
            if (errorMessage.includes('Ride is no longer active') || errorMessage.includes('Ride is not in cancelable status')) {
              console.log(`WebSocket: Ride is cancelled, rejecting with specific error`);
              reject(new Error('Ride is no longer active'));
              return;
            }
          }
          
          reject(error);
        });
      });

    } catch (error) {
      // Suppress connection timeout errors from logs
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('WebSocket connection timeout')) {
        console.log(`WebSocket: Connection timeout to ${namespace} namespace (suppressed from error logs)`);
      } else {
        console.error(`WebSocket: Connection failed to ${namespace} namespace:`, error);
      }
      this.isConnected[namespace] = false;
      throw error;
    }
  }

  private setupEventListeners(socket: Socket, namespace: string) {
    // Common events for all namespaces
    socket.on('connect', () => {
      console.log(`WebSocket: Connected to ${namespace} namespace`);
      this.isConnected[namespace] = true;
    });

    socket.on('disconnect', (reason) => {
      console.log(`WebSocket: Disconnected from ${namespace} namespace:`, reason);
      this.isConnected[namespace] = false;
    });

    socket.on('error', (error: any) => {
      // Suppress expected 400 errors for location updates and ride ID validation
      if (error && error.code === 400) {
        const errorMessage = error.message || '';
        
        // List of expected error messages that should be suppressed
        const expectedErrors = [
          'Failed to update location',
          'Ride ID is required',
          'Ride is not in accepted/ongoing status',
          'Only driver can update ride location',
          'Ride not found',
          'Invalid ride ID format',
          'Invalid coordinates provided',
          'Progress must be a number between 0 and 100',
          'User authentication required',
          'Message content is required',
          'Message ID is required',
          'Ride offer ID is required',
          'Can only reject submitted offers',
          'Ride is not in searching status',
          'Ride offer is not in submitted status',
          'Ride is not in cancelable status',
          'Ride is not in accepted status',
          'Only driver can start ride',
          'Ride is not in ongoing status',
          'Only driver can end ride',
          'Ride is no longer active'
        ];
        
        const isExpectedError = expectedErrors.some(expectedError => 
          errorMessage.includes(expectedError)
        );
        
        if (isExpectedError) {
          console.log(`WebSocket: Suppressed expected 400 error in ${namespace} namespace:`, errorMessage);
          return;
        }
      }
      
      // Log other errors normally
      console.error(`WebSocket: Error in ${namespace} namespace:`, error);
    });
    
    // Also handle connection errors
    socket.on('connect_error', (error) => {
      // Suppress connection timeout errors from logs
      const errorMessage = error.message || '';
      if (errorMessage.includes('WebSocket connection timeout') || errorMessage.includes('timeout')) {
        console.log(`WebSocket: Connection timeout in ${namespace} namespace (suppressed from error logs)`);
      } else {
        console.error(`WebSocket: Connection error in ${namespace} namespace:`, error);
      }
      
      // Handle specific errors for ride namespace
      if (namespace === 'ride') {
        if (errorMessage.includes('Ride is no longer active') || errorMessage.includes('Ride is not in cancelable status')) {
          console.log(`WebSocket: Ride is cancelled, suppressing connection error in ${namespace} namespace`);
          return;
        }
      }
    });

    // Namespace-specific events
    if (namespace === 'driver') {
      this.setupDriverEvents(socket);
    } else if (namespace === 'passenger') {
      this.setupPassengerEvents(socket);
    } else if (namespace === 'ride') {
      this.setupRideEvents(socket);
    }
  }

  private setupDriverEvents(socket: Socket) {
    // Driver-specific events
    socket.on('newRideRequest', (data) => {
      console.log('WebSocket: New ride request event received:', data);
      this.emit('newRideRequest', data, 'driver');
      
      // Trigger Interactive Banner
      DeviceEventEmitter.emit('showInteractiveNotification', {
        title: 'New Ride Request 🚗',
        message: `Pickup: ${data.pickUpLocation || 'Near you'} • Offer: रू ${data.offerPrice || data.price || 'Market Rate'}`,
        type: 'ride_request',
        actionLabel: 'View Requests',
        actionRoute: '/(driver)/driverSection',
      });
    });

    socket.on('offerAccepted', (data) => {
      console.log('WebSocket: Offer accepted event received:', data);
      this.emit('offerAccepted', data, 'driver');

      // Trigger Interactive Banner
      DeviceEventEmitter.emit('showInteractiveNotification', {
        title: 'Offer Accepted! 🎉',
        message: `Passenger accepted your offer. Tap to track and navigate.`,
        type: 'ride_accepted',
        actionLabel: 'Go to Map',
        actionRoute: '/(common)/rideTracker',
        actionParams: { rideId: data.rideId, userRole: 'driver' },
      });
    });
  }

  private setupPassengerEvents(socket: Socket) {
    // Passenger-specific events
    socket.on('newOffer', (data) => {
      console.log('WebSocket: New offer event received:', data);
      this.emit('newOffer', data, 'passenger');

      // Trigger Interactive Banner
      DeviceEventEmitter.emit('showInteractiveNotification', {
        title: 'New Bid Received 💰',
        message: `${data.driver?.firstName || 'Driver'} offered रू ${data.offerAmount}`,
        type: 'ride_request',
        actionLabel: 'View Bids',
        actionRoute: '/(tabs)/rideOffers',
        actionParams: { rideId: data.rideId },
      });
    });

    socket.on('rideAccepted', (data) => {
      console.log('WebSocket: Ride accepted event received:', data);
      this.emit('rideAccepted', data, 'passenger');

      // Trigger Interactive Banner
      DeviceEventEmitter.emit('showInteractiveNotification', {
        title: 'Ride Confirmed! 🚗',
        message: `Driver ${data.driver?.firstName || ''} accepted your ride request.`,
        type: 'ride_accepted',
        actionLabel: 'Track Ride',
        actionRoute: '/(common)/rideTracker',
        actionParams: { rideId: data.rideId, userRole: 'passenger' },
      });
    });

    socket.on('driverOffline', (data) => {
      console.log('WebSocket: Driver offline event received:', data);
      this.emit('driverOffline', data, 'passenger');
    });
  }

  private setupRideEvents(socket: Socket) {
    // Ride-specific events
    socket.on('rideDetails', (data) => {
      console.log('WebSocket: Ride details event received:', data);
      this.emit('rideDetails', data, 'ride');
    });

    socket.on('rideStarted', (data) => {
      console.log('WebSocket: Ride started event received:', data);
      this.emit('rideStarted', data, 'ride');

      // Trigger Interactive Banner
      DeviceEventEmitter.emit('showInteractiveNotification', {
        title: 'Trip Started 🚀',
        message: 'Your yatra has started. Drive safe!',
        type: 'info',
        actionLabel: 'View Map',
        actionRoute: '/(common)/rideTracker',
        actionParams: { rideId: data._id || data.id, userRole: data.driverId ? 'driver' : 'passenger' },
      });
    });

    socket.on('rideCompleted', (data) => {
      console.log('WebSocket: Ride completed event received:', data);
      this.emit('rideCompleted', data, 'ride');

      // Trigger Interactive Banner
      DeviceEventEmitter.emit('showInteractiveNotification', {
        title: 'Trip Completed! 🏁',
        message: 'Thank you for choosing Saathi. Tap to rate.',
        type: 'ride_completed',
        actionLabel: 'Rate Trip',
        actionRoute: '/rideRate',
        actionParams: { rideId: data._id || data.id },
      });
    });

    socket.on('rideCancelled', (data) => {
      console.log('WebSocket: Ride cancelled event received:', data);
      this.emit('rideCancelled', data, 'ride');

      // Trigger Interactive Banner
      DeviceEventEmitter.emit('showInteractiveNotification', {
        title: 'Trip Cancelled 🛑',
        message: 'This ride has been cancelled by the user.',
        type: 'info',
      });
    });

    socket.on('driverArrived', (data) => {
      console.log('WebSocket: driverArrived event received:', data);
      this.emit('driverArrived', data, 'ride');

      // Trigger Interactive Banner for Passenger
      DeviceEventEmitter.emit('showInteractiveNotification', {
        title: 'Driver Arrived! 📍',
        message: 'Your driver has arrived at the pickup point.',
        type: 'ride_accepted',
        actionLabel: 'Track Ride',
        actionRoute: '/(common)/rideTracker',
        actionParams: { rideId: data.rideId || data.id, userRole: 'passenger' },
      });
    });

    socket.on('passengerComing', (data) => {
      console.log('WebSocket: passengerComing event received:', data);
      this.emit('passengerComing', data, 'ride');

      // Trigger Interactive Banner for Driver
      DeviceEventEmitter.emit('showInteractiveNotification', {
        title: "Passenger is coming! 🏃‍♂️",
        message: "Passenger is on their way to the vehicle.",
        type: 'ride_accepted',
        actionLabel: 'Track Ride',
        actionRoute: '/(common)/rideTracker',
        actionParams: { rideId: data.rideId || data.id, userRole: 'driver' },
      });
    });

    socket.on('messageCreated', async (msg: any) => {
      const messageData = msg?.data || msg;
      console.log('WebSocket: messageCreated event received:', messageData);
      
      try {
        const currentUserId = await getCurrentUserId();
        const currentUserRole = await userRoleManager.getRole();
        
        // Skip notification if the message was sent by the logged-in user or matching role
        if (
          messageData.senderId === currentUserId || 
          messageData.sender === currentUserId ||
          messageData.senderRole === currentUserRole
        ) {
          return;
        }
      } catch (err) {
        console.error('WebSocket: error filtering messageCreated sender:', err);
      }
      
      // Trigger Interactive Banner for messaging
      DeviceEventEmitter.emit('showInteractiveNotification', {
        title: `Message from ${messageData.senderRole === 'driver' ? 'Driver' : 'Passenger'} 💬`,
        message: messageData.content,
        type: 'message',
        actionLabel: 'Reply',
        actionRoute: '/(common)/messaging',
        actionParams: { 
          rideId: messageData.rideId,
          userRole: messageData.senderRole === 'driver' ? 'passenger' : 'driver'
        },
      });
    });

    socket.on('rideStatusUpdate', (data) => {
      console.log('WebSocket: Ride status update received:', data);
      this.emit('rideStatusUpdate', data, 'ride');
    });

    socket.on('rideProgressUpdate', (data) => {
      console.log('WebSocket: Ride progress update received:', data);
      this.emit('rideProgressUpdate', data, 'ride');
    });

    socket.on('rideLocationUpdated', (data) => {
      console.log('WebSocket: Ride location update received:', data);
      // Only emit if data is valid
      if (data && typeof data === 'object') {
        this.emit('rideLocationUpdated', data, 'ride');
      } else {
        console.warn('WebSocket: Received invalid rideLocationUpdated data:', data);
      }
    });



    // Handle errors with suppression for expected cases
    socket.on('error', (error: any) => {
      // Suppress expected 400 errors for location updates and ride ID validation
      if (error && error.code === 400) {
        const errorMessage = error.message || '';
        
        // List of expected error messages that should be suppressed
        const expectedErrors = [
          'Failed to update location',
          'Ride ID is required',
          'Ride is not in accepted/ongoing status',
          'Only driver can update ride location',
          'Ride not found',
          'Invalid ride ID format',
          'Invalid coordinates provided',
          'Progress must be a number between 0 and 100',
          'User authentication required',
          'Message content is required',
          'Message ID is required',
          'Ride offer ID is required',
          'Can only reject submitted offers',
          'Ride offer is not in submitted status',
          'Ride is not in cancelable status',
          'Ride is not in accepted status',
          'Only driver can start ride',
          'Ride is not in ongoing status',
          'Only driver can end ride'
        ];
        
        const isExpectedError = expectedErrors.some(expectedError => 
          errorMessage.includes(expectedError)
        );
        
        if (isExpectedError) {
          console.log('WebSocket: Suppressed expected 400 error in ride namespace:', errorMessage);
          return;
        }
        
        // Special handling for "Ride is not in searching status" - don't suppress this
        if (errorMessage.includes('Ride is not in searching status')) {
          console.log('WebSocket: Received ride status error, not suppressing:', errorMessage);
          // Emit the error so it can be handled by the callback
          this.emit('error', error, 'ride');
          return;
        }
      }
      
      // Log other errors normally
      console.error('WebSocket: Error in ride namespace:', error);
    });
  }

  // Check connection status for specific namespace
  isSocketConnected(namespace: 'driver' | 'passenger' | 'ride' = 'driver'): boolean {
    return this.isConnected[namespace] && this.sockets[namespace]?.connected || false;
  }

  // Get socket instance for specific namespace
  getSocket(namespace: 'driver' | 'passenger' | 'ride' = 'driver'): Socket | null {
    return this.sockets[namespace] || null;
  }

  // Emit event to specific namespace
  emit(event: string, data?: any, namespace: 'driver' | 'passenger' | 'ride' = 'driver') {
    const socket = this.sockets[namespace];
    if (socket && socket.connected) {
      socket.emit(event, data);
    } else {
      console.error(`WebSocket: Cannot emit event to ${namespace} namespace, socket not connected`);
    }
  }

  // Listen for events on specific namespace
  on(event: string, callback: (data: any) => void, namespace: 'driver' | 'passenger' | 'ride' = 'driver') {
    const socket = this.sockets[namespace];
    if (socket) {
      socket.on(event, callback);
    }
  }

  // Remove event listener from specific namespace
  off(event: string, callback?: (data: any) => void, namespace: 'driver' | 'passenger' | 'ride' = 'driver') {
    const socket = this.sockets[namespace];
    if (socket) {
      if (callback) {
        socket.off(event, callback);
      } else {
        socket.off(event);
      }
    }
  }

  // Emit event with callback (for request-response pattern)
  emitEvent(event: string, data?: any, callback?: (response: any) => void, namespace: 'driver' | 'passenger' | 'ride' = 'driver'): void {
    const socket = this.sockets[namespace];
    if (socket && socket.connected) {
      // Validate data for critical events
      if (event === 'updateRideLocation') {
        console.log(`[websocketService] Emitting updateRideLocation to ${namespace} namespace:`, data);
        // Ensure data has required fields
        if (!data || typeof data.latitude !== 'number' || typeof data.longitude !== 'number') {
          console.error(`[websocketService] Invalid updateRideLocation data:`, data);
          if (callback) {
            callback({ code: 400, message: 'Invalid location data' });
          }
          return;
        }
      } else if (event === 'pingStatus') {
        console.log(`[websocketService] Emitting pingStatus to ${namespace} namespace:`, data);
      } else if (event === 'rideProgressUpdate') {
        console.log(`[websocketService] Emitting rideProgressUpdate:`, data);
      }
      
      if (callback) {
        socket.emit(event, data, callback);
      } else {
        socket.emit(event, data);
      }
    } else {
      console.error(`WebSocket: Cannot emit event to ${namespace} namespace, socket not connected`);
      // Call callback with error if provided, so the calling code can handle the disconnection
      if (callback) {
        callback({ code: 500, message: `Cannot emit event to ${namespace} namespace, socket not connected` });
      }
    }
  }

  // Disconnect from specific namespace
  disconnect(namespace?: 'driver' | 'passenger' | 'ride') {
    if (namespace) {
      if (this.sockets[namespace]) {
        console.log(`WebSocket: Disconnecting from ${namespace} namespace...`);
        this.sockets[namespace].disconnect();
        this.sockets[namespace] = null;
        this.isConnected[namespace] = false;
        this.connectionPromises[namespace] = null;
      }
    } else {
      // Disconnect from all namespaces
      Object.keys(this.sockets).forEach(ns => {
        if (this.sockets[ns]) {
          console.log(`WebSocket: Disconnecting from ${ns} namespace...`);
          this.sockets[ns].disconnect();
        }
      });
      this.sockets = {};
      this.isConnected = {};
      this.connectionPromises = {};
    }
  }

  async sendRideRequest(rideId: string, offerPrice: number) {
    console.log('Connecting to ride WS with rideId:', rideId);
    await this.connect(rideId, 'passenger');
    console.log('Emitting sendRideRequest for rideId:', rideId, 'with offerPrice:', offerPrice);
    this.emit('sendRideRequest', { offerPrice });
  }

  // Reconnect all sockets with new token (after token refresh)
  async reconnectAllWithNewToken() {
    const namespaces: Array<'driver' | 'passenger' | 'ride'> = ['driver', 'passenger', 'ride'];
    for (const ns of namespaces) {
      if (this.sockets[ns]) {
        try {
          this.disconnect(ns);
          // For 'ride', we need to pass rideId if available
          let rideId;
          if (ns === 'ride' && this.sockets[ns]?.io?.opts?.query?.rideId) {
            rideId = this.sockets[ns].io.opts.query.rideId;
          }
          await this.connect(rideId, ns);
        } catch (err) {
          console.error(`WebSocket: Failed to reconnect ${ns} namespace after token refresh:`, err);
        }
      }
    }
  }
}

// Create a singleton instance
const webSocketService = new WebSocketService();
export default webSocketService;
export { WebSocketService };