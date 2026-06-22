import * as Location from 'expo-location';
import apiClient from './apiClient';
import Constants from 'expo-constants';

const GOOGLE_MAPS_API_KEY = Constants.expoConfig?.extra?.GOOGLE_MAPS_API_KEY || 'AIzaSyDbYiu_14LlULrCl6WXSNvTgEy3yBCKkQg';

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp?: number;
}

export interface RouteData {
  distance: number;
  duration: number;
  polyline: string;
  waypoints: Array<{lat: number, lng: number}>;
}

export interface GoogleMapsPlace {
  place_id?: string;
  description?: string;
  structured_formatting?: {
    main_text: string;
    secondary_text: string;
  };
  // Backend response format
  name: string;
  address: string;
  location: {
    lat: number;
    lng: number;
  };
  distance?: number;
}

export interface GoogleMapsDistance {
  distance: {
    text: string;
    value: number;
  };
  duration: {
    text: string;
    value: number;
  };
}

export interface BoundingBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

class LocationService {
  private currentLocation: LocationData | null = null;
  private locationSubscription: Location.LocationSubscription | null = null;
  private isTracking = false;
  private currentTrackingRole: 'driver' | 'passenger' | null = null;
  private currentTrackingCallback: ((location: LocationData) => void) | null = null;

  // Request location permissions
  async requestPermissions(): Promise<boolean> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('Error requesting location permissions:', error);
      return false;
    }
  }

  // Get current location
  async getCurrentLocation(): Promise<LocationData> {
    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        throw new Error('Location permission not granted');
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        timeInterval: 5000,
        distanceInterval: 10,
      });

      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy || undefined,
        timestamp: location.timestamp,
      };
    } catch (error) {
      console.error('Error getting current location:', error);
      throw error;
    }
  }

  // Test Google Maps API connectivity
  async testGoogleMapsAPI(): Promise<boolean> {
    try {
      console.log('Testing Google Maps API connectivity...');
      const response = await apiClient.get('/google-maps/search', {
        params: { query: 'test' }
      });
      console.log('Google Maps API test response:', response.data);
      return response.data.statusCode === 200;
    } catch (error: any) {
      console.error('Google Maps API test failed:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      return false;
    }
  }

  // Search places using Google Maps API
  async searchPlaces(query: string, boundingBox?: BoundingBox): Promise<GoogleMapsPlace[]> {
    try {
      console.log('Searching places for query:', query);
      
      const response = await apiClient.get('/google-maps/search', {
        params: { query }
      });

      console.log('Search response:', response.data);

      if (response.data.statusCode === 200) {
        let results = response.data.data;
        // Filter by bounding box if provided
        if (boundingBox) {
          results = results.filter((place: any) =>
            place.location &&
            place.location.lat >= boundingBox.south && place.location.lat <= boundingBox.north &&
            place.location.lng >= boundingBox.west && place.location.lng <= boundingBox.east
          );
        }
        console.log('Found places:', results);
        
        // Backend already returns the correct format, just add place_id for frontend compatibility
        if (results && results.length > 0) {
          const placesWithIds = results.map((place: any, index: number) => ({
            ...place,
            place_id: place.place_id || `place_${index}`,
            description: place.address, // For frontend compatibility
            structured_formatting: {
              main_text: place.name,
              secondary_text: place.address
            }
          }));
          console.log('Places with IDs:', placesWithIds);
          return placesWithIds;
        }
        
        // If backend returns empty results, try Autocomplete API as fallback
        console.log('Backend returned empty results, trying Autocomplete API...');
        const autocompleteResults = await this.searchPlacesWithAutocomplete(query, boundingBox);
        if (autocompleteResults.length > 0) {
          console.log('Autocomplete API returned results:', autocompleteResults);
          return autocompleteResults;
        }
        
        return [];
      }
      
      console.log('Search failed with status:', response.data.statusCode);
      
      // Try Autocomplete API as fallback
      console.log('Trying Autocomplete API as fallback...');
      const autocompleteResults = await this.searchPlacesWithAutocomplete(query, boundingBox);
      if (autocompleteResults.length > 0) {
        console.log('Autocomplete API returned results:', autocompleteResults);
        return autocompleteResults;
      }
      
      return [];
    } catch (error: any) {
      console.error('Error searching places:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      
      // Try Autocomplete API as fallback
      console.log('Trying Autocomplete API as fallback due to error...');
      try {
        const autocompleteResults = await this.searchPlacesWithAutocomplete(query, boundingBox);
        if (autocompleteResults.length > 0) {
          console.log('Autocomplete API returned results:', autocompleteResults);
          return autocompleteResults;
        }
      } catch (autocompleteError) {
        console.error('Autocomplete API also failed:', autocompleteError);
      }
      
      return [];
    }
  }

  // Fallback mock search results for testing
  private getMockSearchResults(query: string): GoogleMapsPlace[] {
    const mockPlaces: GoogleMapsPlace[] = [
      {
        place_id: '1',
        name: 'Kathmandu',
        address: 'Kathmandu, Nepal',
        location: { lat: 27.7172, lng: 85.3240 },
        description: 'Kathmandu, Nepal',
        structured_formatting: { main_text: 'Kathmandu', secondary_text: 'Nepal' }
      },
      {
        place_id: '2',
        name: 'Lalitpur',
        address: 'Lalitpur, Nepal',
        location: { lat: 27.6869, lng: 85.3000 },
        description: 'Lalitpur, Nepal',
        structured_formatting: { main_text: 'Lalitpur', secondary_text: 'Nepal' }
      }
    ];

    // Filter mock places based on query (case-insensitive)
    const queryLower = query.toLowerCase().trim();
    const filteredPlaces = mockPlaces.filter(place => 
      place.address.toLowerCase().includes(queryLower) ||
      place.name.toLowerCase().includes(queryLower) ||
      (place.description && place.description.toLowerCase().includes(queryLower)) ||
      (place.structured_formatting && place.structured_formatting.main_text.toLowerCase().includes(queryLower)) ||
      (place.structured_formatting && place.structured_formatting.secondary_text.toLowerCase().includes(queryLower))
    );

    console.log(`Mock search: Found ${filteredPlaces.length} places for query "${query}"`);
    return filteredPlaces;
  }

  // Calculate distance using Haversine formula (fallback when API fails)
  private calculateDistanceHaversine(
    lat1: number, 
    lon1: number, 
    lat2: number, 
    lon2: number
  ): number {
    const R = 6371; // Radius of the Earth in kilometers
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c; // Distance in kilometers
    return distance;
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI/180);
  }

  // Calculate distance between two points
  async calculateDistance(
    origin: string, 
    destination: string,
    originCoords?: { lat: number; lng: number },
    destinationCoords?: { lat: number; lng: number }
  ): Promise<GoogleMapsDistance | null> {
    try {
      console.log('Calculating distance with params:', {
        origin,
        destination,
        originCoords,
        destinationCoords
      });

      // If we have coordinates, use them directly
      if (originCoords && destinationCoords) {
        const params = { 
          originLat: originCoords.lat, // Send as number since backend expects numbers
          originLng: originCoords.lng,
          destinationLat: destinationCoords.lat,
          destinationLng: destinationCoords.lng
        };
        
        console.log('Using coordinates for distance calculation:', params);
        
        const response = await apiClient.get('/google-maps/distance', { params });
        
        console.log('Distance calculation response:', response.data);

        if (response.data.statusCode === 200) {
          return response.data.data;
        }
      }
      
      // Fallback to using location names (if coordinates not available)
      console.log('Using location names for distance calculation:', { origin, destination });
      
      const response = await apiClient.get('/google-maps/distance', {
        params: { origin, destination }
      });

      console.log('Distance calculation response (names):', response.data);

      if (response.data.statusCode === 200) {
        return response.data.data;
      }
      
      // If API fails, use Haversine formula as fallback
      if (originCoords && destinationCoords) {
        console.log('API failed, using Haversine formula as fallback');
        const distanceKm = this.calculateDistanceHaversine(
          originCoords.lat,
          originCoords.lng,
          destinationCoords.lat,
          destinationCoords.lng
        );
        
        console.log('Haversine calculation result:', {
          distanceKm,
          originCoords,
          destinationCoords
        });
        
        const result = {
          distance: {
            text: `${distanceKm.toFixed(1)} km`,
            value: distanceKm * 1000 // Convert to meters
          },
          duration: {
            text: `${Math.round(distanceKm * 3)} mins`, // Rough estimate: 3 mins per km
            value: Math.round(distanceKm * 3 * 60) // Convert to seconds
          }
        };
        
        console.log('Haversine fallback result:', result);
        return result;
      }
      
      return null;
    } catch (error: any) {
      console.error('Error calculating distance:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
        params: {
          origin,
          destination,
          originCoords,
          destinationCoords
        }
      });
      
      // If API fails, use Haversine formula as fallback
      if (originCoords && destinationCoords) {
        console.log('API failed, using Haversine formula as fallback');
        const distanceKm = this.calculateDistanceHaversine(
          originCoords.lat,
          originCoords.lng,
          destinationCoords.lat,
          destinationCoords.lng
        );
        
        console.log('Haversine calculation result:', {
          distanceKm,
          originCoords,
          destinationCoords
        });
        
        const result = {
          distance: {
            text: `${distanceKm.toFixed(1)} km`,
            value: distanceKm * 1000 // Convert to meters
          },
          duration: {
            text: `${Math.round(distanceKm * 3)} mins`, // Rough estimate: 3 mins per km
            value: Math.round(distanceKm * 3 * 60) // Convert to seconds
          }
        };
        
        console.log('Haversine fallback result:', result);
        return result;
      }
      
      return null;
    }
  }

  // Get current cached location
  getCachedLocation(): LocationData | null {
    return this.currentLocation;
  }

  // Update user location on backend
  async updateUserLocation(lat: number, lng: number): Promise<boolean> {
    try {
      // Use the correct field names as expected by the backend validation
      const requestData = {
        latitude: lat,
        longitude: lng
      };

      const response = await apiClient.patch('/me/location', requestData);
      return response.data.statusCode === 200;
    } catch (error: any) {
      // Log the specific error details for debugging
      if (error.response) {
        console.error('Error updating user location:', {
          status: error.response.status,
          data: error.response.data,
          message: error.response.data?.message || 'Unknown error'
        });
      } else {
        console.error('Error updating user location:', error.message);
      }
      
      // Return false but don't throw - this prevents the app from crashing
      return false;
    }
  }

  // Get saved addresses
  async getSavedAddresses(): Promise<any[]> {
    try {
      const response = await apiClient.get('/saved-addresses');
      if (response.data.statusCode === 200) {
        return response.data.data;
      }
      return [];
    } catch (error) {
      console.error('Error getting saved addresses:', error);
      return [];
    }
  }

  // Save new address
  async saveAddress(addressData: {
    name: string;
    type: string;
    address: string;
    lat: number;
    lng: number;
  }): Promise<boolean> {
    try {
      const response = await apiClient.post('/saved-addresses', addressData);
      return response.data.statusCode === 201;
    } catch (error) {
      console.error('Error saving address:', error);
      return false;
    }
  }

  async startLocationTracking(
    onLocationUpdate: (location: LocationData) => void,
    options: {
      accuracy?: Location.Accuracy;
      timeInterval?: number;
      distanceInterval?: number;
      role?: 'driver' | 'passenger';
    } = {}
  ): Promise<void> {
    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        throw new Error('Location permission not granted');
      }

      const role = options.role || 'driver';
      
      // If already tracking, stop the current session first
      if (this.isTracking) {
        console.log(`Stopping existing location tracking for role: ${this.currentTrackingRole}`);
        this.stopLocationTracking();
      }

      // For passengers, we don't need continuous location tracking during rides
      // They only need one-time location updates for status pings
      if (role === 'passenger') {
        console.log('Passenger location tracking disabled - using one-time location updates only');
        return;
      }

      this.isTracking = true;
      this.currentTrackingRole = role;
      this.currentTrackingCallback = onLocationUpdate;

      this.locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: options.accuracy || Location.Accuracy.High,
          timeInterval: options.timeInterval || 5000,
          distanceInterval: options.distanceInterval || 10,
        },
        (location) => {
          const locationData: LocationData = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy: location.coords.accuracy || undefined,
            timestamp: location.timestamp,
          };
          this.currentLocation = locationData;
          onLocationUpdate(locationData);
        }
      );

      console.log(`Location tracking started for role: ${role}`);
    } catch (error) {
      console.error('Error starting location tracking:', error);
      this.isTracking = false;
      this.currentTrackingRole = null;
      this.currentTrackingCallback = null;
      throw error;
    }
  }

  stopLocationTracking(): void {
    if (this.locationSubscription) {
      this.locationSubscription.remove();
      this.locationSubscription = null;
      this.isTracking = false;
      const stoppedRole = this.currentTrackingRole;
      this.currentTrackingRole = null;
      this.currentTrackingCallback = null;
      console.log(`Location tracking stopped for role: ${stoppedRole}`);
    }
  }

  // New method for passengers to get one-time location updates
  async getPassengerLocationForPing(): Promise<LocationData> {
    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        throw new Error('Location permission not granted');
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 10000,
        distanceInterval: 50,
      });

      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy || undefined,
        timestamp: location.timestamp,
      };
    } catch (error) {
      console.error('Error getting passenger location for ping:', error);
      throw error;
    }
  }

  // Check if currently tracking for a specific role
  isCurrentlyTrackingForRole(role: 'driver' | 'passenger'): boolean {
    return this.isTracking && this.currentTrackingRole === role;
  }

  // Get current tracking status
  getTrackingStatus(): { isTracking: boolean; role: 'driver' | 'passenger' | null } {
    return {
      isTracking: this.isTracking,
      role: this.currentTrackingRole
    };
  }

  async getRouteBetweenPoints(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
    waypoints?: Array<{ lat: number; lng: number }>
  ): Promise<RouteData> {
    try {
      let url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}&key=${GOOGLE_MAPS_API_KEY}`;
      
      if (waypoints && waypoints.length > 0) {
        const waypointsStr = waypoints.map(wp => `${wp.lat},${wp.lng}`).join('|');
        url += `&waypoints=${waypointsStr}`;
      }

      const response = await fetch(url);
      const data = await response.json();

      if (data.status !== 'OK') {
        throw new Error(`Google Maps API error: ${data.status}`);
      }

      const route = data.routes[0];
      const leg = route.legs[0];

      return {
        distance: leg.distance.value, // in meters
        duration: leg.duration.value, // in seconds
        polyline: route.overview_polyline.points,
        waypoints: route.legs.map((leg: any) => ({
          lat: leg.start_location.lat,
          lng: leg.start_location.lng,
        })),
      };
    } catch (error) {
      console.error('Error getting route:', error);
      throw error;
    }
  }

  async getAddressFromCoordinates(latitude: number, longitude: number): Promise<string> {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (data.status !== 'OK' || !data.results[0]) {
        throw new Error(`Geocoding API error: ${data.status}`);
      }

      return data.results[0].formatted_address;
    } catch (error) {
      console.error('Error getting address:', error);
      throw error;
    }
  }

  async getCoordinatesFromAddress(address: string): Promise<{ lat: number; lng: number }> {
    try {
      const encodedAddress = encodeURIComponent(address);
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${GOOGLE_MAPS_API_KEY}`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (data.status !== 'OK' || !data.results[0]) {
        throw new Error(`Geocoding API error: ${data.status}`);
      }

      const location = data.results[0].geometry.location;
      return {
        lat: location.lat,
        lng: location.lng,
      };
    } catch (error) {
      console.error('Error getting coordinates:', error);
      throw error;
    }
  }

  async getNearbyPlaces(
    location: { lat: number; lng: number },
    radius: number = 1000,
    type?: string
  ): Promise<Array<{
    name: string;
    address: string;
    location: { lat: number; lng: number };
    rating?: number;
    types: string[];
  }>> {
    try {
      let url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${location.lat},${location.lng}&radius=${radius}&key=${GOOGLE_MAPS_API_KEY}`;
      
      if (type) {
        url += `&type=${type}`;
      }

      const response = await fetch(url);
      const data = await response.json();

      if (data.status !== 'OK') {
        throw new Error(`Places API error: ${data.status}`);
      }

      return data.results.map((place: any) => ({
        name: place.name,
        address: place.vicinity,
        location: {
          lat: place.geometry.location.lat,
          lng: place.geometry.location.lng,
        },
        rating: place.rating,
        types: place.types,
      }));
    } catch (error) {
      console.error('Error getting nearby places:', error);
      throw error;
    }
  }

  calculateDistanceBetweenPoints(
    point1: { lat: number; lng: number },
    point2: { lat: number; lng: number }
  ): number {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (point1.lat * Math.PI) / 180;
    const φ2 = (point2.lat * Math.PI) / 180;
    const Δφ = ((point2.lat - point1.lat) * Math.PI) / 180;
    const Δλ = ((point2.lng - point1.lng) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  }

  isLocationWithinRadius(
    center: { lat: number; lng: number },
    point: { lat: number; lng: number },
    radius: number
  ): boolean {
    const distance = this.calculateDistanceBetweenPoints(center, point);
    return distance <= radius;
  }

  // Search places using Google Places Autocomplete API (fallback)
  async searchPlacesWithAutocomplete(query: string, boundingBox?: BoundingBox): Promise<GoogleMapsPlace[]> {
    try {
      console.log('Searching places with Autocomplete API for query:', query);
      
      // Try the new Places API first
      // TODO: Replace with your new API key from Google Cloud Console
      const apiKey = Constants.expoConfig?.extra?.GOOGLE_MAPS_API_KEY || 'AIzaSyDbYiu_14LlULrCl6WXSNvTgEy3yBCKkQg'; // Your frontend API key
      const url = `https://places.googleapis.com/v1/places:autocomplete?key=${apiKey}`;
      
      const requestBody = {
        input: query,
        types: ['geocode'],
        components: ['country:np'],
        languageCode: 'en'
      };
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.displayName,places.id,places.formattedAddress'
        },
        body: JSON.stringify(requestBody)
      });
      
      const data = await response.json();
      console.log('New Places API response:', data);
      
      let places = data.places || [];
      // After getting places, filter by boundingBox if provided
      if (boundingBox && places.length > 0) {
        // Only keep places with coordinates in box (if available)
        places = places.filter((place: any) =>
          place.location &&
          place.location.lat >= boundingBox.south && place.location.lat <= boundingBox.north &&
          place.location.lng >= boundingBox.west && place.location.lng <= boundingBox.east
        );
      }
      
      if (places && places.length > 0) {
        // Convert places to our format
        const placesWithIds = places.map((place: any, index: number) => ({
          place_id: place.id,
          name: place.displayName?.text || place.formattedAddress,
          address: place.formattedAddress,
          location: {
            lat: 0, // We'll need to get details for coordinates
            lng: 0
          },
          description: place.formattedAddress,
          structured_formatting: {
            main_text: place.displayName?.text || place.formattedAddress,
            secondary_text: place.formattedAddress
          }
        }));
        
        console.log('Converted places from new API:', placesWithIds);
        return placesWithIds;
      }
      
      // If new API fails, try legacy API as fallback
      console.log('New Places API failed, trying legacy API...');
      return await this.searchPlacesWithLegacyAPI(query, boundingBox);
      
    } catch (error: any) {
      console.error('Error with new Places API:', error);
      
      // Try legacy API as fallback
      console.log('Trying legacy API as fallback...');
      return await this.searchPlacesWithLegacyAPI(query, boundingBox);
    }
  }

  // Fallback to legacy Places API
  private async searchPlacesWithLegacyAPI(query: string, boundingBox?: BoundingBox): Promise<GoogleMapsPlace[]> {
    try {
      const apiKey = Constants.expoConfig?.extra?.GOOGLE_MAPS_API_KEY || 'AIzaSyDbYiu_14LlULrCl6WXSNvTgEy3yBCKkQg';
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&key=${apiKey}&types=geocode&components=country:np`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      console.log('Legacy API response:', data);
      
      let places = data.predictions || [];
      // After getting places, filter by boundingBox if provided
      if (boundingBox && places.length > 0) {
        places = places.filter((prediction: any) => {
          const inBox = !boundingBox || (
            prediction.location &&
            prediction.location.lat >= boundingBox.south && prediction.location.lat <= boundingBox.north &&
            prediction.location.lng >= boundingBox.west && prediction.location.lng <= boundingBox.east
          );
          return inBox;
        });
      }
      
      if (places && places.length > 0) {
        // Convert predictions to our format
        const placesWithIds = places.map((prediction: any, index: number) => ({
          place_id: prediction.place_id,
          name: prediction.structured_formatting?.main_text || prediction.description,
          address: prediction.description,
          location: {
            lat: 0, // We'll need to get details for coordinates
            lng: 0
          },
          description: prediction.description,
          structured_formatting: prediction.structured_formatting
        }));
        
        console.log('Converted places from legacy API:', placesWithIds);
        return placesWithIds;
      }
      
      console.log('Legacy API also returned no results, using mock data');
      return this.getMockSearchResults(query);
    } catch (error: any) {
      console.error('Error with legacy API:', error);
      console.log('Using mock data as final fallback');
      return this.getMockSearchResults(query);
    }
  }

  // Get place details with coordinates
  async getPlaceDetails(placeId: string, boundingBox?: BoundingBox): Promise<GoogleMapsPlace | null> {
    try {
      const apiKey = Constants.expoConfig?.extra?.GOOGLE_MAPS_API_KEY || 'AIzaSyDbYiu_14LlULrCl6WXSNvTgEy3yBCKkQg';
      
      // Try new Places API first
      const url = `https://places.googleapis.com/v1/places/${placeId}?key=${apiKey}`;
      
      const response = await fetch(url, {
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'displayName,formattedAddress,location'
        }
      });
      
      const data = await response.json();
      console.log('New Places API details response:', data);
      
      if (data.displayName && data.location) {
        const inBox = !boundingBox || (
          data.location.latitude >= boundingBox.south && data.location.latitude <= boundingBox.north &&
          data.location.longitude >= boundingBox.west && data.location.longitude <= boundingBox.east
        );
        if (!inBox) return null;
        return {
          place_id: placeId,
          name: data.displayName.text,
          address: data.formattedAddress,
          location: {
            lat: data.location.latitude,
            lng: data.location.longitude
          },
          description: data.formattedAddress,
          structured_formatting: {
            main_text: data.displayName.text,
            secondary_text: data.formattedAddress
          }
        };
      }
      
      // If new API fails, try legacy API
      console.log('New Places API details failed, trying legacy API...');
      return await this.getPlaceDetailsLegacy(placeId, boundingBox);
      
    } catch (error) {
      console.error('Error with new Places API details:', error);
      
      // Try legacy API as fallback
      console.log('Trying legacy API details as fallback...');
      return await this.getPlaceDetailsLegacy(placeId, boundingBox);
    }
  }

  // Fallback to legacy Places API for details
  private async getPlaceDetailsLegacy(placeId: string, boundingBox?: BoundingBox): Promise<GoogleMapsPlace | null> {
    try {
      const apiKey = Constants.expoConfig?.extra?.GOOGLE_MAPS_API_KEY || 'AIzaSyDbYiu_14LlULrCl6WXSNvTgEy3yBCKkQg';
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry,name,formatted_address&key=${apiKey}`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      console.log('Legacy API details response:', data);
      
      if (data.status === 'OK' && data.result) {
        const inBox = !boundingBox || (
          data.result.geometry.location.lat >= boundingBox.south && data.result.geometry.location.lat <= boundingBox.north &&
          data.result.geometry.location.lng >= boundingBox.west && data.result.geometry.location.lng <= boundingBox.east
        );
        if (!inBox) return null;
        return {
          place_id: placeId,
          name: data.result.name,
          address: data.result.formatted_address,
          location: {
            lat: data.result.geometry.location.lat,
            lng: data.result.geometry.location.lng
          },
          description: data.result.formatted_address,
          structured_formatting: {
            main_text: data.result.name,
            secondary_text: data.result.formatted_address
          }
        };
      }
      
      return null;
    } catch (error) {
      console.error('Error with legacy API details:', error);
      return null;
    }
  }
}

export const locationService = new LocationService(); 