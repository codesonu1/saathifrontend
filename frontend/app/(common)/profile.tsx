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
import apiClient, { initializeApiClient, getAccessToken } from '@/services/apiClient';
import * as ImagePicker from 'expo-image-picker';
import AppModal from '../../components/ui/AppModal';
import Constants from 'expo-constants';
import { useUserRole, userRoleManager } from '@/services/userRoleManager';
import webSocketService from '@/services/websocketService';
import { logoutAndResetNavigation } from '../(auth)/login';

const { width } = Dimensions.get('window');
const ASSET_BASE_URL = process.env.EXPO_PUBLIC_ASSET_URL || Constants.expoConfig?.extra?.PUBLIC_ASSET_URL || 'https://ride-share-api-umog.onrender.com';
const DEFAULT_BASE_URL = Constants.expoConfig?.extra?.DEFAULT_BASE_URL || 'https://ride-share-api-umog.onrender.com';

const ProfileSettingsScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPadding = insets.top > 0 ? insets.top : (Platform.OS === 'ios' ? 44 : 24);
  const bottomPadding = 40 + (insets.bottom > 0 ? insets.bottom : 10);

  const activeRole = useUserRole();
  const [name, setName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [imageUri, setImageUri] = useState(
    'https://www.shutterstock.com/image-vector/default-avatar-photo-placeholder-grey-600nw-2007531536.jpg'
  );
  const [uploading, setUploading] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [totalReviews, setTotalReviews] = useState<number | null>(null);
  const [isVerified, setIsVerified] = useState<boolean>(false);

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

  const getFullImageUrl = (imageUrl: string | null | undefined) => {
    if (!imageUrl)
      return 'https://www.shutterstock.com/image-vector/default-avatar-photo-placeholder-grey-600nw-2007531536.jpg';
    if (imageUrl.startsWith('http')) return imageUrl;
    return `${ASSET_BASE_URL}${imageUrl}`;
  };

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const response = await apiClient.get('me');
        const userData = response.data.data;

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

        // Bind Real Rating
        if (typeof userData.rating === 'number' && userData.rating > 0) {
          setRating(userData.rating);
        } else {
          setRating(null);
        }

        // Bind Real Review Count
        const count = userData.totalReviews ?? userData.reviewsCount ?? userData.passengerRatingCount ?? userData.totalRides ?? null;
        if (typeof count === 'number' && count >= 0) {
          setTotalReviews(count);
        } else {
          setTotalReviews(null);
        }

        // Bind Real Verification Status
        const verified = !!(
          userData.isVerified ||
          userData.verificationStatus === 'VERIFIED' ||
          userData.verificationStatus === 'APPROVED' ||
          userData.isPhoneVerified
        );
        setIsVerified(verified);

        initialDataRef.current = {
          name: fetchedName,
          lastName: fetchedLastName,
          email: fetchedEmail,
          imageUri: photoUrl,
        };
      } catch (err) {
        console.error('Failed to fetch user data:', err);
        showModal('error', 'Error', 'Failed to load profile data. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchUserData();
  }, [activeRole]);

  const isDirty =
    name !== initialDataRef.current.name ||
    lastName !== initialDataRef.current.lastName ||
    email !== initialDataRef.current.email ||
    imageUri !== initialDataRef.current.imageUri;

  const handleSave = async () => {
    setSaving(true);
    try {
      const updateUserDto = { firstName: name, lastName, email };
      const response = await apiClient.patch('me', updateUserDto);
      if (response.data.statusCode === 200) {
        initialDataRef.current = {
          name,
          lastName,
          email,
          imageUri,
        };
        showModal('success', 'Success', 'Profile updated successfully');
        setTimeout(() => {
          hideModal();
        }, 1200);
      }
    } catch (err) {
      console.error('Failed to update profile:', err);
      showModal('error', 'Error', 'Failed to update profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const [switchingDriver, setSwitchingDriver] = useState(false);

  const handleSwitchToDriver = async () => {
    console.log('[Profile] Switch Driver button clicked');
    setSwitchingDriver(true);
    try {
      // 1. Ensure API client headers are initialized with token
      await initializeApiClient();
      const token = await getAccessToken();
      console.log('[Profile] Token present for driver status check:', !!token);

      let hasDriverProfile = false;

      // 2. Source 1: Check /me endpoint for driverProfile / vehicles / isDriver / role
      try {
        console.log('[Profile] Querying /me endpoint for driver indicators...');
        const meRes = await apiClient.get('me');
        const userData = meRes.data?.data;
        console.log('[Profile] /me response user role:', userData?.role, 'isDriver:', userData?.isDriver, 'hasDriverProfile:', !!userData?.driverProfile, 'vehicles:', userData?.vehicles?.length || 0);

        if (
          userData?.driverProfile ||
          userData?.isDriver ||
          userData?.role === 'driver' ||
          (userData?.vehicles && userData.vehicles.length > 0)
        ) {
          hasDriverProfile = true;
          console.log('[Profile] Driver status CONFIRMED via /me user data!');
        }
      } catch (meErr: any) {
        console.log('[Profile] /me check error:', meErr?.response?.status || meErr?.message);
      }

      // 3. Source 2: Check /driver-profile endpoint if not confirmed yet
      if (!hasDriverProfile) {
        try {
          console.log('[Profile] Querying /driver-profile endpoint...');
          const driverRes = await apiClient.get('driver-profile');
          console.log('[Profile] /driver-profile response status:', driverRes.status, 'data:', driverRes.data);
          if (driverRes.data?.data || driverRes.data?.id || driverRes.data?._id) {
            hasDriverProfile = true;
            console.log('[Profile] Driver status CONFIRMED via /driver-profile endpoint!');
          }
        } catch (driverErr: any) {
          console.log(
            '[Profile] /driver-profile check status:',
            driverErr?.response?.status || 'No HTTP response',
            'message:',
            driverErr?.message || driverErr
          );
        }
      }

      // 4. Perform role switch & WebSocket reset
      await userRoleManager.setRole('driver');
      webSocketService.disconnect('driver');
      webSocketService.disconnect('passenger');
      webSocketService.disconnect('ride');

      // 5. Navigate to appropriate screen based on confirmed driver status
      if (hasDriverProfile) {
        console.log('[Profile] Registered driver profile confirmed! Navigating to Driver Dashboard: /(driver)/driverSection');
        router.push('/(driver)/driverSection' as any);
      } else {
        console.log('[Profile] User is NOT registered as a driver. Navigating to Driver Registration flow: /(driver)');
        router.push('/(driver)' as any);
      }
    } catch (err: any) {
      console.error('[Profile] Fatal error during driver switch check:', err?.message || err);
      await userRoleManager.setRole('driver');
      webSocketService.disconnect('driver');
      webSocketService.disconnect('passenger');
      webSocketService.disconnect('ride');
      router.push('/(driver)' as any);
    } finally {
      setSwitchingDriver(false);
    }
  };

  const handleLogout = async () => {
    await logoutAndResetNavigation(router);
  };

  const handleImageUpload = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permissionResult.granted === false) {
      showModal('info', 'Permission required', 'You need to allow access to your photos to upload an image.');
      return;
    }
    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: false,
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
          headers: {
            'Content-Type': 'multipart/form-data',
          },
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
            showModal('success', 'Success', 'Profile image updated successfully');
          } else {
            showModal('error', 'Error', 'Failed to update profile with new image.');
          }
        } else {
          showModal('error', 'Error', 'Failed to upload image.');
        }
      } catch (err: any) {
        console.error('Failed to upload image:', err);
        showModal('error', 'Error', `Failed to upload image: ${err.message || 'Unknown error'}`);
      } finally {
        setUploading(false);
      }
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8F9FA' }}>
        <ActivityIndicator size="large" color="#B7102A" />
      </View>
    );
  }

  const fullNameDisplay = `${name} ${lastName}`.trim() || 'Passenger Name';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" translucent={false} />

      <View style={[styles.header, { paddingTop: topPadding, height: 56 + topPadding }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={0.8}
        >
          <MaterialIcons name="arrow-back" size={22} color="#191C1D" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPadding }]} showsVerticalScrollIndicator={false}>
        <View style={styles.heroSection}>
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

          <Text style={styles.heroName}>{fullNameDisplay}</Text>
          {/* Rating & Verified Badges Row */}
          <View style={styles.badgeRow}>
            <View style={styles.ratingBadge}>
              <MaterialIcons name="star" size={16} color="#FFB800" style={{ marginRight: 4 }} />
              <Text style={styles.ratingText}>
                {rating !== null ? rating.toFixed(1) : 'New'}
              </Text>
              <Text style={styles.ratingSubtext}>
                {totalReviews !== null && totalReviews > 0
                  ? ` (${totalReviews} ${totalReviews === 1 ? 'review' : 'reviews'})`
                  : ' (No reviews yet)'}
              </Text>
            </View>

            {isVerified && (
              <View style={styles.verifiedBadge}>
                <MaterialIcons name="check-circle" size={15} color="#445A7F" style={{ marginRight: 4 }} />
                <Text style={styles.verifiedText}>Verified Member</Text>
              </View>
            )}
          </View>
        </View>

        {/* Card 1: Account Details Form */}
        <View style={styles.cardContainer}>
          <View style={styles.cardHeaderRow}>
            <MaterialIcons name="person-outline" size={22} color="#B7102A" style={{ marginRight: 10 }} />
            <Text style={styles.cardHeaderTitle}>Account Details</Text>
          </View>

          {/* First Name Input */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>First Name</Text>
            <View style={styles.inputContainer}>
              <MaterialIcons name="person" size={20} color="#5B403F" style={styles.inputIcon} />
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="First Name"
                placeholderTextColor="#8F6F6E"
                style={styles.textInput}
              />
            </View>
          </View>

          {/* Last Name Input */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Last Name</Text>
            <View style={styles.inputContainer}>
              <MaterialIcons name="person-outline" size={20} color="#5B403F" style={styles.inputIcon} />
              <TextInput
                value={lastName}
                onChangeText={setLastName}
                placeholder="Last Name"
                placeholderTextColor="#8F6F6E"
                style={styles.textInput}
              />
            </View>
          </View>

          {/* Phone Number Field (Read-only) */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Phone Number</Text>
            <View style={[styles.inputContainer, styles.readOnlyInput]}>
              <MaterialIcons name="phone" size={20} color="#5B403F" style={styles.inputIcon} />
              <TextInput
                value={mobile}
                editable={false}
                placeholder="Phone Number"
                placeholderTextColor="#8F6F6E"
                style={[styles.textInput, { color: '#5B403F' }]}
              />
            </View>
          </View>

          {/* Email Address Input */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Email Address</Text>
            <View style={styles.inputContainer}>
              <MaterialIcons name="email" size={20} color="#5B403F" style={styles.inputIcon} />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Email Address"
                placeholderTextColor="#8F6F6E"
                keyboardType="email-address"
                autoCapitalize="none"
                style={styles.textInput}
              />
            </View>
          </View>
        </View>

        {/* Card 2: Account Options & Quick Actions */}
        <View style={styles.cardContainer}>
          <View style={styles.cardHeaderRow}>
            <MaterialIcons name="settings" size={22} color="#B7102A" style={{ marginRight: 10 }} />
            <Text style={styles.cardHeaderTitle}>Account Options</Text>
          </View>

          {/* Switch to Driver Mode */}
          <TouchableOpacity
            style={styles.actionRow}
            onPress={handleSwitchToDriver}
            disabled={switchingDriver}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIconCircle, { backgroundColor: '#F3F4F5' }]}>
              {switchingDriver ? (
                <ActivityIndicator size="small" color="#B7102A" />
              ) : (
                <MaterialIcons name="swap-horiz" size={20} color="#B7102A" />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionTitle}>Switch to Driver Mode</Text>
              <Text style={styles.actionSubtitle}>Drive and earn money</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color="#8F6F6E" />
          </TouchableOpacity>

          {/* Support Option */}
          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => router.push('/(common)/support' as any)}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIconCircle, { backgroundColor: '#F3F4F5' }]}>
              <MaterialIcons name="help-outline" size={20} color="#286182" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionTitle}>Support & Help</Text>
              <Text style={styles.actionSubtitle}>Contact us or view FAQs</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color="#8F6F6E" />
          </TouchableOpacity>

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

        {isDirty && (
          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.saveButtonText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>

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

export default ProfileSettingsScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 8 : 16,
    paddingBottom: 16,
    backgroundColor: '#F8F9FA',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    fontSize: 20,
    fontWeight: '700',
    color: '#191C1D',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  heroSection: {
    alignItems: 'center',
    marginVertical: 16,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 12,
  },
  avatarImage: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: '#E7E8E9',
  },
  editBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#B7102A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  heroName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#191C1D',
    marginBottom: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  ratingText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#191C1D',
  },
  ratingSubtext: {
    fontSize: 12,
    fontWeight: '400',
    color: '#5B403F',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#BBD3FD',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  verifiedText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#445A7F',
  },
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: '#EDEEEF',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#191C1D',
  },
  fieldGroup: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#5B403F',
    marginBottom: 6,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F5',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
  },
  readOnlyInput: {
    backgroundColor: '#E7E8E9',
  },
  inputIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '400',
    color: '#191C1D',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EDEEEF',
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
    fontWeight: '600',
    color: '#191C1D',
  },
  actionSubtitle: {
    fontSize: 12,
    color: '#5B403F',
    marginTop: 2,
  },
  saveButton: {
    backgroundColor: '#B7102A',
    borderRadius: 12,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    elevation: 3,
    shadowColor: '#B7102A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});