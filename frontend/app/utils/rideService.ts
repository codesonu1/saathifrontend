import apiClient from './apiClient';
import webSocketService from './websocketService';

export interface RideRequest {
  vehicleType: string;
  pickUpLocation: string;
  pickUpLat: number;
  pickUpLng: number;
  pickUpTime?: Date;
  dropOffLocation: string;
  dropOffLat: number;
  dropOffLng: number;
  offerPrice: number;
  comments?: string;
}

export interface Ride {
  _id: string;
  passenger: {
    _id: string;
    firstName: string;
    lastName: string;
    mobile: string;
    photo?: string;
  };
  driver?: {
    _id: string;
    firstName: string;
    lastName: string;
    mobile: string;
    rating: number;
    photo?: string;
  };
  vehicleType: {
    _id: string;
    name: string;
    basePrice: number;
    pricePerKm: number;
  };
  pickUp?: {
    location: string;
    coords?: {
      type: string;
      coordinates: number[];
    };
  };
  dropOff?: {
    location: string;
    coords?: {
      type: string;
      coordinates: number[];
    };
  };
  pickUpLocation?: string;
  pickUpLat?: number;
  pickUpLng?: number;
  pickUpTime?: Date;
  dropOffLocation?: string;
  dropOffLat?: number;
  dropOffLng?: number;
  offerPrice: number;
  finalPrice?: number;
  status: 'pending' | 'accepted' | 'in-progress' | 'completed' | 'cancelled' | 'searching';
  comments?: string;
  createdAt: Date;
  updatedAt: Date;
  // Additional properties for ride details
  estDistance?: {
    distance: {
      text: string;
      value: number;
    };
    duration: {
      text: string;
      value: number;
    };
  };
  driverProfile?: {
    _id: string;
    rating: number;
    totalRides: number;
    vehicleColor: string;
    vehicleMake: string;
    vehicleModel: string;
    vehicleRegNum: string;
    vehicleYear?: number;
  };
}

export interface RideOffer {
  _id: string;
  ride: string;
  driver: {
    _id: string;
    firstName: string;
    lastName: string;
    mobile: string;
    rating: number;
    photo?: string;
    vehicleDetails: {
      vehicleModel: string;
      vehicleRegNum: string;
    };
  };
  offeredPrice: number;
  message?: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Date;
}

export interface VehicleType {
  _id: string;
  name: string;
  description?: string;
  basePrice: number;
  pricePerKm: number;
  isActive: boolean;
}

class RideService {
  // Helper function to calculate distance between two coordinates using Haversine formula
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // Simulated ride progress tracking
  private rideProgressSimulation: {
    [rideId: string]: {
      phase: 'pickup' | 'in-progress' | 'dropoff' | 'completed';
      progress: number;
      startTime: number;
      estimatedDuration: number;
      currentLocation: { lat: number; lng: number };
      pickupLocation: { lat: number; lng: number };
      dropoffLocation: { lat: number; lng: number };
      interval?: any;
    };
  } = {};

  // Use 'any' for compatibility with both Node and browser
  private rideSimulations: Record<string, any> = {};

  // Get available vehicle types
  async getVehicleTypes(): Promise<VehicleType[]> {
    try {
      const response = await apiClient.get('/vehicle-types');
      if (response.data.statusCode === 200) {
        return response.data.data;
      }
      return [];
    } catch (error) {
      console.error('Error getting vehicle types:', error);
      return [];
    }
  }

  // Create a new ride request
  async createRide(rideData: RideRequest): Promise<Ride | null> {
    try {
      // Validate that pickup and dropoff locations are not the same
      const pickupLat = Number(rideData.pickUpLat);
      const pickupLng = Number(rideData.pickUpLng);
      const dropOffLat = Number(rideData.dropOffLat);
      const dropOffLng = Number(rideData.dropOffLng);
      
      // Calculate distance between pickup and dropoff using Haversine formula
      const distance = this.calculateDistance(pickupLat, pickupLng, dropOffLat, dropOffLng);
      
      // If distance is very small (less than 0.1 km = 100 meters), consider them the same
      if (distance < 0.1) {
        throw new Error('You cannot have the same pickup and dropoff location');
      }
      
      // Also check if the location names are the same (case-insensitive)
      if (rideData.pickUpLocation.toLowerCase().trim() === rideData.dropOffLocation.toLowerCase().trim()) {
        throw new Error('You cannot have the same pickup and dropoff location');
      }
      
      // Ensure coordinates are numbers
      const requestData = {
        vehicleType: rideData.vehicleType,
        pickUpLocation: rideData.pickUpLocation,
        pickUpLat: pickupLat,
        pickUpLng: pickupLng,
        dropOffLocation: rideData.dropOffLocation,
        dropOffLat: dropOffLat,
        dropOffLng: dropOffLng,
        offerPrice: Number(rideData.offerPrice),
        comments: rideData.comments,
        pickUpTime: rideData.pickUpTime
      };

      console.log('Creating ride with data:', requestData);

      const response = await apiClient.post('/rides', requestData);
      console.log('RideService: Create ride response:', response.data);
      
      if (response.data.statusCode === 201) {
        // Transform the response to match our Ride interface
        const ride = response.data.data;
        console.log('RideService: Created ride data:', ride);
        console.log('RideService: Ride status:', ride.status);
        
        return {
          _id: ride._id,
          passenger: {
            _id: ride.passengerId || '',
            firstName: ride.passenger?.firstName || '',
            lastName: ride.passenger?.lastName || '',
            mobile: ride.passenger?.mobile || '',
          },
          vehicleType: {
            _id: ride.vehicleType,
            name: ride.vehicle?.name || '',
            basePrice: 0,
            pricePerKm: 0,
          },
          pickUpLocation: ride.pickUpLocation || ride.pickUp?.location || '',
          pickUpLat: ride.pickUpLat || ride.pickUp?.coords?.coordinates[1] || 0,
          pickUpLng: ride.pickUpLng || ride.pickUp?.coords?.coordinates[0] || 0,
          dropOffLocation: ride.dropOffLocation || ride.dropOff?.location || '',
          dropOffLat: ride.dropOffLat || ride.dropOff?.coords?.coordinates[1] || 0,
          dropOffLng: ride.dropOffLng || ride.dropOff?.coords?.coordinates[0] || 0,
          offerPrice: ride.offerPrice,
          status: ride.status?.toLowerCase() || 'pending',
          comments: ride.comments,
          createdAt: new Date(ride.createdAt),
          updatedAt: new Date(ride.updatedAt || ride.createdAt),
        };
      }
      console.log('RideService: Ride creation failed with status:', response.data.statusCode);
      return null;
    } catch (error) {
      console.error('Error creating ride:', error);
      throw error;
    }
  }

  // Get passenger rides
  async getPassengerRides(status?: string): Promise<Ride[]> {
    try {
      const params = status ? { status } : {};
      const response = await apiClient.get('/rides/passenger', { params });
      if (response.data.statusCode === 200) {
        // Transform the backend response to match our Ride interface
        return response.data.data.map((ride: any) => ({
          _id: ride._id,
          passenger: {
            _id: ride.passengerId,
            firstName: ride.passenger?.firstName || '',
            lastName: ride.passenger?.lastName || '',
            mobile: ride.passenger?.mobile || '',
          },
          vehicleType: {
            _id: ride.vehicleType,
            name: ride.vehicle?.name || '',
            basePrice: 0,
            pricePerKm: 0,
          },
          pickUpLocation: ride.pickUp.location,
          pickUpLat: ride.pickUp.coords.coordinates[1],
          pickUpLng: ride.pickUp.coords.coordinates[0],
          dropOffLocation: ride.dropOff.location,
          dropOffLat: ride.dropOff.coords.coordinates[1],
          dropOffLng: ride.dropOff.coords.coordinates[0],
          offerPrice: ride.offerPrice,
          status: ride.status.toLowerCase(),
          comments: ride.comments,
          createdAt: new Date(ride.createdAt),
          updatedAt: new Date(ride.updatedAt || ride.createdAt),
        }));
      }
      return [];
    } catch (error) {
      console.error('Error getting passenger rides:', error);
      return [];
    }
  }

  // Get driver rides
  async getDriverRides(status?: string): Promise<Ride[]> {
    try {
      const params = status ? { status } : {};
      const response = await apiClient.get('/rides/driver', { params });
      if (response.data.statusCode === 200) {
        // Transform the backend response to match our Ride interface
        return response.data.data.map((ride: any) => ({
          _id: ride._id,
          passenger: {
            _id: ride.passengerId,
            firstName: ride.passenger?.firstName || '',
            lastName: ride.passenger?.lastName || '',
            mobile: ride.passenger?.mobile || '',
          },
          driver: ride.driver ? {
            _id: ride.driver._id,
            firstName: ride.driver.firstName,
            lastName: ride.driver.lastName,
            mobile: ride.driver.mobile,
            rating: ride.driver.rating || ride.driverProfile?.rating || 0,
          } : undefined,
          vehicleType: {
            _id: ride.vehicleType,
            name: ride.vehicle?.name || '',
            basePrice: 0,
            pricePerKm: 0,
          },
          pickUpLocation: ride.pickUp.location,
          pickUpLat: ride.pickUp.coords.coordinates[1],
          pickUpLng: ride.pickUp.coords.coordinates[0],
          dropOffLocation: ride.dropOff.location,
          dropOffLat: ride.dropOff.coords.coordinates[1],
          dropOffLng: ride.dropOff.coords.coordinates[0],
          offerPrice: ride.offerPrice,
          status: ride.status.toLowerCase(),
          comments: ride.comments,
          createdAt: new Date(ride.createdAt),
          updatedAt: new Date(ride.updatedAt || ride.createdAt),
        }));
      }
      return [];
    } catch (error) {
      console.error('Error getting driver rides:', error);
      return [];
    }
  }

  // Get ride offers for a specific ride
  async getRideOffers(rideId: string): Promise<RideOffer[]> {
    try {
      const response = await apiClient.get(`/rides/${rideId}/offers`);
      if (response.data.statusCode === 200) {
        // Transform the backend response to match our RideOffer interface
        return response.data.data.map((offer: any) => ({
          _id: offer._id,
          ride: offer.rideId,
          driver: {
            _id: offer.driver._id,
            firstName: offer.driver.firstName,
            lastName: offer.driver.lastName,
            mobile: offer.driver.mobile,
            rating: offer.driverProfile?.rating || offer.driver.rating || 0,
            vehicleDetails: {
              vehicleModel: offer.driverProfile?.vehicleModel || '',
              vehicleRegNum: offer.driverProfile?.vehicleRegNum || '',
            },
          },
          offeredPrice: offer.offerAmount,
          message: '', // Not provided in new API
          status: offer.status.toLowerCase(),
          createdAt: new Date(offer.createdAt),
        }));
      }
      return [];
    } catch (error) {
      console.error('Error getting ride offers:', error);
      return [];
    }
  }

  // Get ride offers for passengers (alias for getRideOffers)
  async getRideOffersForPassenger(rideId: string): Promise<RideOffer[]> {
    return this.getRideOffers(rideId);
  }

  // Accept a ride offer (for passenger)
  async acceptRideOffer(rideId: string, offerId: string): Promise<boolean> {
    try {
      console.log('RideService: Accepting offer via WebSocket:', { rideId, offerId });
      
      // Connect to ride namespace if not already connected
      if (!webSocketService.isSocketConnected('ride')) {
        await webSocketService.connect(rideId, 'ride');
      }
      
      return await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          webSocketService.off('acceptRideOffer', handleAcceptRideOffer, 'ride');
          reject(new Error('Timeout accepting ride offer'));
        }, 10000);

        // Listen for accept ride offer response
        const handleAcceptRideOffer = (data: any) => {
          clearTimeout(timeout);
          webSocketService.off('acceptRideOffer', handleAcceptRideOffer, 'ride');
          console.log('WebSocket: Received accept ride offer event:', data);
          if (data && data.code === 201) {
            resolve(true);
          } else {
            resolve(false);
          }
        };

        webSocketService.on('acceptRideOffer', handleAcceptRideOffer, 'ride');
        
        // Accept ride offer via WebSocket
        console.log('WebSocket: Accepting ride offer for offerId:', offerId);
        webSocketService.emitEvent('acceptRideOffer', { rideOfferId: offerId }, (response: any) => {
          clearTimeout(timeout);
          webSocketService.off('acceptRideOffer', handleAcceptRideOffer, 'ride');
          console.log('WebSocket: acceptRideOffer callback response:', response);
          if (response && response.code === 201) {
            resolve(true);
          } else {
            resolve(false);
          }
        }, 'ride');
      });
    } catch (error: any) {
      console.error('RideService: Error accepting ride offer:', error);
      return false;
    }
  }

  // Reject a ride offer (for passenger)
  async rejectRideOffer(rideId: string, offerId: string): Promise<boolean> {
    try {
      console.log('RideService: Rejecting offer:', { rideId, offerId });
      
      // Try different endpoint patterns
      let response;
      
      // Pattern 1: PATCH with status update
      try {
        response = await apiClient.patch(`/rides/${rideId}/offers/${offerId}`, {
          status: 'rejected'
        });
        console.log('RideService: Reject offer response (pattern 1):', response.data);
        return response.data.statusCode === 200;
      } catch (error: any) {
        console.log('RideService: Pattern 1 failed:', error.response?.status);
      }
      
      // Pattern 2: POST to reject endpoint
      try {
        response = await apiClient.post(`/rides/${rideId}/offers/${offerId}/reject`);
        console.log('RideService: Reject offer response (pattern 2):', response.data);
        return response.data.statusCode === 200;
      } catch (error: any) {
        console.log('RideService: Pattern 2 failed:', error.response?.status);
      }
      
      // Pattern 3: PATCH to reject endpoint
      try {
        response = await apiClient.patch(`/rides/${rideId}/offers/${offerId}/reject`);
        console.log('RideService: Reject offer response (pattern 3):', response.data);
        return response.data.statusCode === 200;
      } catch (error: any) {
        console.log('RideService: Pattern 3 failed:', error.response?.status);
      }
      
      // Pattern 4: Reject through ride endpoint
      try {
        response = await apiClient.patch(`/rides/${rideId}/reject-offer`, {
          offerId: offerId
        });
        console.log('RideService: Reject offer response (pattern 4):', response.data);
        return response.data.statusCode === 200;
      } catch (error: any) {
        console.log('RideService: Pattern 4 failed:', error.response?.status);
      }
      
      console.error('RideService: All reject offer patterns failed');
      return false;
    } catch (error: any) {
      console.error('RideService: Error rejecting ride offer:', error);
      return false;
    }
  }

  // Rate passenger (for driver) - Documented in API
  async ratePassenger(rideId: string, rating: number): Promise<boolean> {
    try {
      const response = await apiClient.patch(`/rides/${rideId}/rate-passenger`, { rating });
      return response.data.statusCode === 200;
    } catch (error) {
      console.error('Error rating passenger:', error);
      return false;
    }
  }

  // Rate driver (for passenger) - Documented in API
  async rateDriver(rideId: string, rating: number): Promise<boolean> {
    try {
      const response = await apiClient.patch(`/rides/${rideId}/rate-driver`, { rating });
      return response.data.statusCode === 200;
    } catch (error) {
      console.error('Error rating driver:', error);
      return false;
    }
  }

  // Get ride details - Use WebSocket instead of REST API
  async getRideDetails(rideId: string): Promise<Ride | null> {
    try {
      // For completed rides, use REST API instead of WebSocket
      console.log('RideService: Getting ride details via REST API for rideId:', rideId);
      
      const response = await apiClient.get(`/rides/${rideId}`);
      console.log('RideService: REST API response:', response.data);
      
      if (response.data.statusCode === 200 && response.data.data) {
        const ride = response.data.data;
        console.log('RideService: Retrieved ride data:', ride);
        
        // Transform the response to match our Ride interface
        return {
          _id: ride._id,
          passenger: {
            _id: ride.passenger?._id || ride.passengerId || '',
            firstName: ride.passenger?.firstName || '',
            lastName: ride.passenger?.lastName || '',
            mobile: ride.passenger?.mobile || '',
          },
          driver: ride.driver ? {
            _id: ride.driver._id || '',
            firstName: ride.driver.firstName || '',
            lastName: ride.driver.lastName || '',
            mobile: ride.driver.mobile || '',
            rating: ride.driverProfile?.rating || ride.driver.rating || 0,
          } : undefined,
          vehicleType: {
            _id: ride.vehicleType?._id || ride.vehicleType || '',
            name: ride.vehicleType?.name || ride.vehicle?.name || '',
            basePrice: ride.vehicleType?.basePrice || 0,
            pricePerKm: ride.vehicleType?.pricePerKm || 0,
          },
          pickUpLocation: ride.pickUpLocation || ride.pickUp?.location || '',
          pickUpLat: ride.pickUpLat || ride.pickUp?.coords?.coordinates?.[1] || 0,
          pickUpLng: ride.pickUpLng || ride.pickUp?.coords?.coordinates?.[0] || 0,
          dropOffLocation: ride.dropOffLocation || ride.dropOff?.location || '',
          dropOffLat: ride.dropOffLat || ride.dropOff?.coords?.coordinates?.[1] || 0,
          dropOffLng: ride.dropOffLng || ride.dropOff?.coords?.coordinates?.[0] || 0,
          offerPrice: ride.offerPrice || 0,
          status: ride.status?.toLowerCase() || 'completed',
          comments: ride.comments,
          createdAt: new Date(ride.createdAt),
          updatedAt: new Date(ride.updatedAt || ride.createdAt),
          // Include additional data for the ride details screen
          estDistance: ride.estDistance,
          driverProfile: ride.driverProfile,
        };
      }
      
      console.log('RideService: No ride data found or invalid response');
      return null;
    } catch (error) {
      console.error('Error getting ride details:', error);
      return null;
    }
  }

  // Get ride details with driver information
  async getRideWithDriverInfo(rideId: string): Promise<Ride | null> {
    try {
      const response = await apiClient.get(`/rides/${rideId}/driver-info`);
      if (response.data.statusCode === 200) {
        return response.data.data;
      }
      return null;
    } catch (error) {
      console.error('Error getting ride with driver info:', error);
      return null;
    }
  }

  // Get driver information for a specific ride
  async getRideDriverInfo(rideId: string): Promise<any> {
    try {
      const response = await apiClient.get(`/rides/${rideId}/driver-info`);
      if (response.data.statusCode === 200) {
        return response.data.data;
      }
      return null;
    } catch (error) {
      console.error('Error getting ride driver info:', error);
      return null;
    }
  }

  // Calculate estimated fare
  calculateEstimatedFare(
    distance: number,
    vehicleType: VehicleType,
    basePrice?: number
  ): number {
    console.log('Calculating fare with:', {
      distance,
      vehicleType,
      basePrice
    });
    
    // Validate vehicle type has required properties
    if (!vehicleType || typeof vehicleType.basePrice !== 'number' || typeof vehicleType.pricePerKm !== 'number') {
      console.warn('Invalid vehicle type, using default values:', vehicleType);
      // Use default values if vehicle type is invalid
      const defaultBasePrice = basePrice || 50; // Default base price
      const defaultPricePerKm = 15; // Default price per km
      const estimatedFare = defaultBasePrice + (distance * defaultPricePerKm);
      return Math.round(estimatedFare * 100) / 100;
    }
    
    const estimatedFare = vehicleType.basePrice + (distance * vehicleType.pricePerKm);
    console.log('Fare calculation:', {
      basePrice: vehicleType.basePrice,
      pricePerKm: vehicleType.pricePerKm,
      distance,
      estimatedFare
    });
    return Math.round(estimatedFare * 100) / 100; // Round to 2 decimal places
  }

  // Make a ride offer (for drivers)
  async makeRideOffer(rideId: string, offeredPrice: number, message?: string): Promise<RideOffer | null> {
    try {
      const response = await apiClient.post(`/rides/${rideId}/offers`, {
        offerAmount: offeredPrice
      });
      if (response.data.statusCode === 201) {
        // Transform the backend response to match our RideOffer interface
        const offer = response.data.data;
        return {
          _id: offer._id,
          ride: offer.rideId,
          driver: {
            _id: offer.driver._id,
            firstName: offer.driver.firstName,
            lastName: offer.driver.lastName,
            mobile: offer.driver.mobile,
            rating: 0, // Not provided in new API
            vehicleDetails: {
              vehicleModel: '', // Not provided in new API
              vehicleRegNum: '', // Not provided in new API
            },
          },
          offeredPrice: offer.offerAmount,
          message: message || '',
          status: offer.status.toLowerCase(),
          createdAt: new Date(offer.createdAt),
        };
      }
      return null;
    } catch (error) {
      console.error('Error making ride offer:', error);
      throw error;
    }
  }

  // Start ride (for driver) - Use WebSocket instead of REST API
  async startRide(rideId: string): Promise<boolean> {
    try {
      // Connect to RIDE namespace for ride-specific events
      if (!webSocketService.isSocketConnected('ride')) {
        await webSocketService.connect(rideId, 'ride');
      }
      
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          webSocketService.off('rideStarted', handleRideStarted, 'ride');
          console.error('WebSocket: Timeout starting ride for rideId:', rideId);
          reject(new Error('Timeout starting ride'));
        }, 10000);

        // Listen for ride started response
        const handleRideStarted = (data: any) => {
          clearTimeout(timeout);
          webSocketService.off('rideStarted', handleRideStarted, 'ride');
          console.log('WebSocket: Received ride started event:', data);
          if (data && data.code === 201) {
            resolve(true);
          } else {
            console.error('WebSocket: Failed to start ride - invalid response:', data);
            resolve(false);
          }
        };

        webSocketService.on('rideStarted', handleRideStarted, 'ride');
        
        // Start ride via WebSocket
        console.log('WebSocket: Starting ride for rideId:', rideId);
        webSocketService.emitEvent('startRide', {}, (response: any) => {
          clearTimeout(timeout);
          webSocketService.off('rideStarted', handleRideStarted, 'ride');
          console.log('WebSocket: startRide callback response:', response);
          if (response && response.code === 201) {
            resolve(true);
          } else {
            console.error('WebSocket: Failed to start ride - callback error:', response);
            resolve(false);
          }
        }, 'ride');
      });
    } catch (error) {
      console.error('Error starting ride:', error);
      return false;
    }
  }

  // Complete ride (for driver) - Use WebSocket instead of REST API
  async completeRide(rideId: string): Promise<boolean> {
    try {
      // Connect to RIDE namespace for ride-specific events
      if (!webSocketService.isSocketConnected('ride')) {
        await webSocketService.connect(rideId, 'ride');
      }
      
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          webSocketService.off('rideCompleted', handleRideCompleted, 'ride');
          reject(new Error('Timeout completing ride'));
        }, 10000);

        // Listen for ride completed response
        const handleRideCompleted = (data: any) => {
          clearTimeout(timeout);
          webSocketService.off('rideCompleted', handleRideCompleted, 'ride');
          console.log('WebSocket: Received ride completed event:', data);
          if (data && data.code === 201) {
            resolve(true);
          } else {
            resolve(false);
          }
        };

        webSocketService.on('rideCompleted', handleRideCompleted, 'ride');
        
        // Complete ride via WebSocket
        console.log('WebSocket: Completing ride for rideId:', rideId);
        webSocketService.emitEvent('endRide', {}, (response: any) => {
          clearTimeout(timeout);
          webSocketService.off('rideCompleted', handleRideCompleted, 'ride');
          console.log('WebSocket: endRide callback response:', response);
          if (response && response.code === 201) {
            resolve(true);
          } else {
            resolve(false);
          }
        }, 'ride');
      });
    } catch (error) {
      console.error('Error completing ride:', error);
      return false;
    }
  }

  // Cancel ride - Use WebSocket instead of REST API
  async cancelRide(rideId: string, cancellationReason?: string): Promise<boolean> {
    try {
      // Connect to WebSocket if not already connected
      if (!webSocketService.isSocketConnected('ride')) {
        await webSocketService.connect(rideId, 'ride');
      }
      
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout cancelling ride'));
        }, 10000);

        // Listen for ride cancelled response
        const handleRideCancelled = (data: any) => {
          clearTimeout(timeout);
          if (data && data.code === 201) {
            resolve(true);
          } else {
            resolve(false);
          }
        };

        webSocketService.on('rideCancelled', handleRideCancelled, 'ride');
        
        // Cancel ride via WebSocket
        const payload = {
          rideId,
          cancellationReason: cancellationReason || 'Cancelled by user'
        };
        webSocketService.emitEvent('cancelRide', payload, (response: any) => {
          clearTimeout(timeout);
          webSocketService.off('rideCancelled', handleRideCancelled, 'ride');
          if (response && response.code === 201) {
            resolve(true);
          } else {
            resolve(false);
          }
        }, 'ride');
      });
    } catch (error) {
      console.error('Error cancelling ride:', error);
      return false;
    }
  }

  // Start simulated ride progress
  startRideProgressSimulation(rideId: string, locations: Array<{ lat: number; lng: number }>, durationSeconds: number) {
    if (this.rideSimulations[rideId]) {
      console.warn(`[rideService] Simulation already running for rideId ${rideId}`);
      return;
    }
    if (!locations || locations.length < 3) {
      console.error('[rideService] Need at least 3 locations (current, pickup, dropoff)');
      return;
    }
    const [start, pickup, dropoff] = locations;
    const startTime = Date.now();
    const endTime = startTime + durationSeconds * 1000;
    let lastProgress = 0;
    let completed = false;

    function interpolate(a: { lat: number; lng: number }, b: { lat: number; lng: number }, t: number) {
      return {
        lat: a.lat + (b.lat - a.lat) * t,
        lng: a.lng + (b.lng - a.lng) * t,
      };
    }

    this.rideSimulations[rideId] = setInterval(async () => {
      if (completed) return;
      const now = Date.now();
      let progress = Math.min(100, ((now - startTime) / (endTime - startTime)) * 100);
      let currentLocation;
      if (progress < 25) {
        // From start to pickup
        const t = progress / 25;
        currentLocation = interpolate(start, pickup, t);
      } else if (progress < 90) {
        // From pickup to dropoff
        const t = (progress - 25) / (90 - 25);
        currentLocation = interpolate(pickup, dropoff, t);
      } else {
        // Final approach to dropoff
        const t = (progress - 90) / (100 - 90);
        currentLocation = interpolate(pickup, dropoff, 1 * t + (1 - t));
      }
      lastProgress = progress;
      const event = {
        rideId,
        progress,
        currentLocation,
        timestamp: now,
      };
      try {
        // Emit to ride namespace
        const ws = require('./websocketService').default;
        ws.emitEvent('rideProgressUpdate', event, undefined, 'ride');
        console.log(`[rideService] Emitted rideProgressUpdate for rideId ${rideId}:`, event);
      } catch (err) {
        console.error('[rideService] Error emitting rideProgressUpdate:', err);
      }
      if (progress >= 100) {
        completed = true;
        this.stopRideProgressSimulation(rideId);
        // Optionally, emit endRide event
        try {
          const ws = require('./websocketService').default;
          ws.emitEvent('endRide', { rideId }, undefined, 'ride');
          console.log(`[rideService] Emitted endRide for rideId ${rideId}`);
        } catch (err) {
          console.error('[rideService] Error emitting endRide:', err);
        }
      }
    }, 2000);
  }

  // Stop ride progress simulation
  stopRideProgressSimulation(rideId: string) {
    if (this.rideSimulations[rideId]) {
      clearInterval(this.rideSimulations[rideId]);
      delete this.rideSimulations[rideId];
      console.log(`[rideService] Stopped simulation for rideId ${rideId}`);
    }
  }

  // Get current ride progress
  getRideProgress(rideId: string) {
    return this.rideProgressSimulation[rideId] || null;
  }

  // Interpolate location between two points
  private interpolateLocation(
    start: { lat: number; lng: number },
    end: { lat: number; lng: number },
    factor: number
  ): { lat: number; lng: number } {
    return {
      lat: start.lat + (end.lat - start.lat) * factor,
      lng: start.lng + (end.lng - start.lng) * factor,
    };
  }

  async deleteRide(rideId: string): Promise<void> {
    try {
      const response = await apiClient.delete(`/rides/${rideId}`);
      if (response.data.statusCode !== 200) {
        throw new Error(response.data.message || 'Failed to delete ride');
      }
    } catch (error) {
      console.error('Error deleting ride:', error);
      throw error;
    }
  }
}

export const rideService = new RideService(); 