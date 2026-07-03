import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import webSocketService from './websocketService';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const API_URL = Platform.OS === 'web'
  ? 'http://localhost:9000/api/v1'
  : (Constants.expoConfig?.extra?.API_URL || 'http://10.0.2.2:9000/api/v1');

const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json',
  },
});

let accessToken = '';

export const setAccessToken = async (token: string) => {
  accessToken = token;
  await AsyncStorage.setItem('accessToken', token);
  apiClient.defaults.headers.Authorization = `Bearer ${token}`;
  // Reconnect websockets with new token
  await webSocketService.reconnectAllWithNewToken();
};

export const getAccessToken = async () => {
  if (!accessToken) {
    accessToken = await AsyncStorage.getItem('accessToken') || '';
  }
  return accessToken;
};

export const initializeApiClient = async () => {
  try {
    const token = await AsyncStorage.getItem('accessToken');
    if (token) {
      accessToken = token;
      apiClient.defaults.headers.Authorization = `Bearer ${token}`;
      console.log('API client initialized with stored token');
    } else {
      console.log('No stored token found');
    }
  } catch (error) {
    console.error('Error initializing API client:', error);
  }
};

export const clearAccessToken = async () => {
  accessToken = '';
  await AsyncStorage.removeItem('accessToken');
  delete apiClient.defaults.headers.Authorization;
};

export const refreshAccessToken = async () => {
  try {
    const refreshToken = await AsyncStorage.getItem('refreshToken');
    if (refreshToken) {
      const response = await apiClient.post('/auth/refresh-token', { refreshToken });
      if (response.data.statusCode === 200) {
        await setAccessToken(response.data.data.accessToken);
        await AsyncStorage.setItem('refreshToken', response.data.data.refreshToken || '');
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error('Token refresh failed:', error);
    return false;
  }
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    // Do not attempt to retry if the request itself was to the refresh-token endpoint
    if (error.response?.status === 401 && !originalRequest._retry && !originalRequest.url?.includes('/auth/refresh-token')) {
      originalRequest._retry = true;
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        originalRequest.headers.Authorization = `Bearer ${await getAccessToken()}`;
        return apiClient(originalRequest);
      }
    }
    return Promise.reject(error);
  }
);

// Helper to get the current user's ID from /me endpoint
export async function getCurrentUserId(): Promise<string | null> {
  try {
    const response = await apiClient.get('me');
    const userData = response.data.data;
    return userData?._id || null;
  } catch (err) {
    console.error('Failed to fetch current user ID:', err);
    return null;
  }
}

export default apiClient;