import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  StatusBar,
  ActivityIndicator,
  ScrollView,
  Platform,
  TextInput,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import apiClient, { initializeApiClient } from '@/services/apiClient';
import SidePanel from '../(common)/sidepanel';
import DriverBottomNav from '@/components/DriverBottomNav';
import AppModal from '@/components/ui/AppModal';

import { logoutAndResetNavigation } from '../(auth)/login';
import { userRoleManager } from '@/services/userRoleManager';
import webSocketService from '@/services/websocketService';

const { width } = Dimensions.get('window');
const ASSET_BASE_URL = process.env.EXPO_PUBLIC_ASSET_URL || Constants.expoConfig?.extra?.PUBLIC_ASSET_URL || 'https://ride-share-api-umog.onrender.com';
const DEFAULT_BASE_URL = Constants.expoConfig?.extra?.DEFAULT_BASE_URL || 'https://ride-share-api-umog.onrender.com';

const DriverProfileScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPadding = insets.top > 0 ? insets.top : (Platform.OS === 'ios' ? 44 : 24);
  const bottomPadding = 90 + (insets.bottom > 0 ? insets.bottom : 10);

  const [sidePanelVisible, setSidePanelVisible] = useState(false);
  const [name, setName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [reviewCount, setReviewCount] = useState<number>(0);
  const [imageUri, setImageUri] = useState<string>(
    'https://www.shutterstock.com/image-vector/default-avatar-photo-placeholder-grey-600nw-2007531536.jpg'
  );
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [switchingPassenger, setSwitchingPassenger] = useState(false);

  // Vehicle details state
  const [vehicleInfo, setVehicleInfo] = useState({
    name: 'Suzuki Cultus',
    subtitle: 'Hatchback • Silver Metallic',
    licensePlate: 'BA-1-PA-1234',
  });

  const initialDataRef = useRef({
    name: '',
    lastName: '',
    email: '',
    imageUri: '',
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

  const handleSwitchToPassenger = async () => {
    try {
      setSwitchingPassenger(true);
      await userRoleManager.setRole('passenger');
      webSocketService.disconnect('driver');
      webSocketService.disconnect('passenger');
      webSocketService.disconnect('ride');
      router.replace('/(tabs)' as any);
    } catch (err: any) {
      console.error('[DriverProfile] Error switching to passenger mode:', err);
      showModal('error', 'Error', 'Failed to switch to passenger mode');
    } finally {
      setSwitchingPassenger(false);
    }
  };

  const handleLogout = async () => {
    await logoutAndResetNavigation(router);
  };

  const getFullImageUrl = (imageUrl: string | null | undefined) => {
    if (!imageUrl)
      return 'https://www.shutterstock.com/image-vector/default-avatar-photo-placeholder-grey-600nw-2007531536.jpg';
    if (imageUrl.startsWith('http')) return imageUrl;
    return `${ASSET_BASE_URL}${imageUrl}`;
  };

  useEffect(() => {
    const fetchDriverData = async () => {
      try {
        setLoading(true);
        await initializeApiClient();

        // 1. Fetch user data from /me
        const meResponse = await apiClient.get('me');
        const userData = meResponse.data.data;

        if (userData) {
          const fetchedName = userData.firstName || '';
          const fetchedLastName = userData.lastName || '';
          const fetchedEmail = userData.email || '';
          const fetchedMobile = userData.mobile || '';
          const photoUrl = getFullImageUrl(userData.photo);

          setName(fetchedName);
          setLastName(fetchedLastName);
          setEmail(fetchedEmail);
          setMobile(fetchedMobile);
          setImageUri(photoUrl);

          if (userData.rating !== undefined && userData.rating !== null) {
            setRating(userData.rating);
          }
          if (userData.reviewCount !== undefined) {
            setReviewCount(userData.reviewCount);
          } else if (userData.totalReviews !== undefined) {
            setReviewCount(userData.totalReviews);
          }

          initialDataRef.current = {
            name: fetchedName,
            lastName: fetchedLastName,
            email: fetchedEmail,
            imageUri: photoUrl,
          };
        }

        // 2. Fetch driver profile data from /driver-profile
        try {
          const driverResponse = await apiClient.get('driver-profile');
          const driverData = driverResponse.data?.data;
          if (driverData) {
            if (driverData.rating !== undefined && driverData.rating !== null) {
              setRating(driverData.rating);
            }
            if (driverData.reviewCount !== undefined) {
              setReviewCount(driverData.reviewCount);
            } else if (driverData.totalReviews !== undefined) {
              setReviewCount(driverData.totalReviews);
            }

            const vehicle = driverData.vehicle || (userData?.vehicles && userData.vehicles[0]);
            if (vehicle) {
              const makeModel = `${vehicle.make || vehicle.brand || 'Suzuki'} ${vehicle.model || 'Cultus'}`.trim();
              const typeColor = `${vehicle.type || 'Hatchback'} • ${vehicle.color || 'Silver Metallic'}`;
              const plate = vehicle.plateNumber || vehicle.licensePlate || vehicle.vehicleRegNum || 'BA-1-PA-1234';

              setVehicleInfo({
                name: makeModel,
                subtitle: typeColor,
                licensePlate: plate,
              });
            }
          }
        } catch (err) {
          console.log('[DriverProfile] /driver-profile check error (using fallback vehicle defaults):', err);
        }
      } catch (err) {
        console.error('[DriverProfile] Failed to fetch driver data:', err);
        showModal('error', 'Error', 'Failed to load driver profile data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchDriverData();
  }, []);

  const isDirty =
    name !== initialDataRef.current.name ||
    lastName !== initialDataRef.current.lastName ||
    email !== initialDataRef.current.email ||
    imageUri !== initialDataRef.current.imageUri;

  const handleSave = async () => {
    if (!name.trim()) {
      showModal('error', 'Validation Error', 'First name is required');
      return;
    }

    setSaving(true);
    try {
      const updateData = {
        firstName: name,
        lastName: lastName,
        email: email,
      };

      const response = await apiClient.patch('me', updateData);
      if (response.data.statusCode === 200) {
        initialDataRef.current = {
          name,
          lastName,
          email,
          imageUri,
        };
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
        showModal('success', 'Success', 'Driver profile updated successfully');
      } else {
        showModal('error', 'Error', 'Failed to update profile details.');
      }
    } catch (err: any) {
      console.error('Failed to update driver profile:', err);
      showModal('error', 'Error', `Failed to save profile: ${err.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      showModal('error', 'Permission Required', 'Permission to access media library is required!');
      return;
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!pickerResult.canceled) {
      setUploading(true);
      try {
        const uri = pickerResult.assets[0].uri;
        const formData = new FormData();
        formData.append('file', {
          uri: uri,
          type: 'image/jpeg',
          name: 'profile.jpg',
        } as any);

        const uploadResponse = await apiClient.post('uploads/public', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        if (uploadResponse.data.statusCode === 201) {
          const imageUrl = uploadResponse.data.data.url;
          let fixedImageUrl = imageUrl;
          if (imageUrl.includes('localhost:3000')) {
            fixedImageUrl = imageUrl.replace(DEFAULT_BASE_URL, ASSET_BASE_URL);
          }

          const profileUpdateData = { photo: fixedImageUrl };
          const profileResponse = await apiClient.patch('me', profileUpdateData);

          if (profileResponse.data.statusCode === 200) {
            const newUrl = getFullImageUrl(profileResponse.data.data.photo);
            setImageUri(newUrl);
            initialDataRef.current.imageUri = newUrl;
            showModal('success', 'Success', 'Profile photo updated successfully');
          }
        }
      } catch (err: any) {
        console.error('Failed to upload image:', err);
        showModal('error', 'Error', `Failed to upload image: ${err.message || 'Unknown error'}`);
      } finally {
        setUploading(false);
      }
    }
  };

  const handleManageVehicles = () => {
    router.push('/(driver)/registerVehicle' as any);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAF8FE' }}>
        <ActivityIndicator size="large" color="#BC001F" />
      </View>
    );
  }

  const fullNameDisplay = `${name} ${lastName}`.trim() || 'Vardan Shah';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAF8FE" translucent={false} />

      {/* Fixed Top Header */}
      <View style={[styles.header, { paddingTop: topPadding, height: 56 + topPadding }]}>
        <View style={{ width: 24 }} />
        <Text style={styles.headerTitle}>Profile</Text>
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
      >
        {/* Profile Avatar & Header Section */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarWrapper}>
            <Image style={styles.avatarImage} source={{ uri: imageUri }} />
            <TouchableOpacity
              style={styles.editBadge}
              onPress={handleImageUpload}
              disabled={uploading}
              activeOpacity={0.85}
            >
              {uploading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <MaterialIcons name="edit" size={16} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.driverName}>{fullNameDisplay}</Text>
          <View style={styles.ratingRow}>
            <MaterialIcons name="star" size={16} color="#EAB308" style={{ marginRight: 4 }} />
            <Text style={styles.ratingText}>
              {rating !== null && rating > 0
                ? `${rating.toFixed(1)} (${reviewCount} ${reviewCount === 1 ? 'review' : 'reviews'})`
                : 'New (No reviews yet)'} • Driver Partner
            </Text>
          </View>
        </View>

        {/* Form Fields Section */}
        <View style={styles.formSection}>
          {/* Full Name Input */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>FULL NAME</Text>
            <View style={styles.inputCard}>
              <MaterialIcons name="person" size={20} color="#5D3F3D" style={styles.fieldIcon} />
              <TextInput
                value={`${name} ${lastName}`.trim()}
                onChangeText={(val) => {
                  const parts = val.split(' ');
                  setName(parts[0] || '');
                  setLastName(parts.slice(1).join(' ') || '');
                }}
                placeholder="Enter full name"
                placeholderTextColor="#926E6C"
                style={styles.textInput}
              />
            </View>
          </View>

          {/* Email Address Input */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>EMAIL ADDRESS</Text>
            <View style={styles.inputCard}>
              <MaterialIcons name="mail" size={20} color="#5D3F3D" style={styles.fieldIcon} />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Enter email"
                placeholderTextColor="#926E6C"
                keyboardType="email-address"
                autoCapitalize="none"
                style={styles.textInput}
              />
            </View>
          </View>

          {/* Phone Number Input (Read-only) */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>PHONE NUMBER</Text>
            <View style={[styles.inputCard, styles.readOnlyInput]}>
              <MaterialIcons name="call" size={20} color="#5D3F3D" style={styles.fieldIcon} />
              <TextInput
                value={mobile || '+92 300 1234567'}
                editable={false}
                placeholder="Enter phone"
                placeholderTextColor="#926E6C"
                style={[styles.textInput, { color: '#5D3F3D' }]}
              />
            </View>
          </View>
        </View>

        {/* Vehicle Details Card */}
        <View style={styles.vehicleSection}>
          <Text style={styles.fieldLabel}>VEHICLE DETAILS</Text>
          <View style={styles.vehicleCard}>
            {/* Left Vibrant Red Accent Line */}
            <View style={styles.vehicleAccentBar} />

            <View style={styles.vehicleCardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.vehicleTitle}>{vehicleInfo.name}</Text>
                <Text style={styles.vehicleSubtitle}>{vehicleInfo.subtitle}</Text>
                <View style={styles.platePill}>
                  <Text style={styles.plateText}>{vehicleInfo.licensePlate}</Text>
                </View>
              </View>

              {/* Vehicle Watermark Icon */}
              <View style={styles.vehicleIconContainer}>
                <MaterialIcons name="directions-car" size={64} color="#1A1B1F" style={{ opacity: 0.15 }} />
              </View>
            </View>
          </View>
        </View>

        {/* Account Options & Quick Actions Card */}
        <View style={styles.accountOptionsSection}>
          <Text style={styles.fieldLabel}>ACCOUNT OPTIONS</Text>
          <View style={styles.optionsCard}>
            {/* Switch to Passenger Mode */}
            <TouchableOpacity
              style={styles.actionRow}
              onPress={handleSwitchToPassenger}
              disabled={switchingPassenger}
              activeOpacity={0.7}
            >
              <View style={[styles.actionIconCircle, { backgroundColor: '#F4F3F8' }]}>
                {switchingPassenger ? (
                  <ActivityIndicator size="small" color="#BC001F" />
                ) : (
                  <MaterialIcons name="swap-horiz" size={20} color="#BC001F" />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionTitle}>Switch to Passenger Mode</Text>
                <Text style={styles.actionSubtitle}>Return to passenger home & booking</Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color="#5D3F3D" />
            </TouchableOpacity>

            {/* Support & Help */}
            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => router.push('/(common)/support' as any)}
              activeOpacity={0.7}
            >
              <View style={[styles.actionIconCircle, { backgroundColor: '#F4F3F8' }]}>
                <MaterialIcons name="help-outline" size={20} color="#286182" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionTitle}>Support & Help</Text>
                <Text style={styles.actionSubtitle}>Contact us or view FAQs</Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color="#5D3F3D" />
            </TouchableOpacity>

            {/* Logout Account */}
            <TouchableOpacity
              style={[styles.actionRow, { borderBottomWidth: 0 }]}
              onPress={handleLogout}
              activeOpacity={0.7}
            >
              <View style={[styles.actionIconCircle, { backgroundColor: '#FFDAD6' }]}>
                <MaterialIcons name="logout" size={20} color="#BA1A1A" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.actionTitle, { color: '#BA1A1A' }]}>Logout Account</Text>
                <Text style={[styles.actionSubtitle, { color: '#BA1A1A', opacity: 0.8 }]}>Sign out of your account</Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color="#BA1A1A" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Save Changes Button */}
        <View style={styles.saveButtonWrapper}>
          <TouchableOpacity
            style={[
              styles.saveButton,
              saveSuccess && styles.saveButtonSuccess,
              saving && { opacity: 0.8 },
            ]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.88}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : saveSuccess ? (
              <View style={styles.buttonInnerRow}>
                <MaterialIcons name="check-circle" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.saveButtonText}>Saved!</Text>
              </View>
            ) : (
              <Text style={styles.saveButtonText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Fixed Driver Bottom Navigation */}
      <DriverBottomNav activeTab="account" />



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

export default DriverProfileScreen;

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
  avatarSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarWrapper: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 4,
    borderColor: '#F4F3F8',
    position: 'relative',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 56,
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#BC001F',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    elevation: 5,
  },
  driverName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1B1F',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  ratingText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#5D3F3D',
  },
  formSection: {
    gap: 16,
    marginBottom: 24,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5D3F3D',
    letterSpacing: 0.8,
    marginLeft: 4,
    marginBottom: 4,
  },
  inputCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 3,
  },
  readOnlyInput: {
    backgroundColor: '#F4F3F8',
  },
  fieldIcon: {
    marginRight: 12,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '400',
    color: '#1A1B1F',
  },
  vehicleSection: {
    marginBottom: 24,
  },
  vehicleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 3,
  },
  vehicleAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: '#BC001F',
  },
  vehicleCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  vehicleTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1B1F',
  },
  vehicleSubtitle: {
    fontSize: 14,
    fontWeight: '400',
    color: '#5D3F3D',
    marginTop: 2,
  },
  platePill: {
    backgroundColor: '#EFEDF3',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 14,
  },
  plateText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: '#5D3F3D',
  },
  vehicleIconContainer: {
    width: 70,
    height: 70,
    justifyContent: 'center',
    alignItems: 'center',
  },
  accountOptionsSection: {
    marginBottom: 24,
  },
  optionsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 3,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EFEDF3',
  },
  actionIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1B1F',
  },
  actionSubtitle: {
    fontSize: 12,
    color: '#5D3F3D',
    marginTop: 2,
  },
  saveButtonWrapper: {
    marginTop: 8,
  },
  saveButton: {
    backgroundColor: '#BC001F',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#BC001F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  saveButtonSuccess: {
    backgroundColor: '#16A34A',
  },
  buttonInnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
