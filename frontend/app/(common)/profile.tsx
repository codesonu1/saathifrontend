import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Dimensions, StatusBar, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { TextInput, Button } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import apiClient from '../utils/apiClient';
import * as ImagePicker from 'expo-image-picker';
import AppModal from '../../components/ui/AppModal';
import Constants from 'expo-constants';
import { useUserRole } from '../utils/userRoleManager';

const calculateDriverProfitLoss = async (): Promise<{
  profit: number;
  loss: number;
  breakdown: {
    grossEarnings: number;
    commission: number;
    rewards: number;
    netProfit: number;
  };
}> => {
  try {
    const ridesResponse = await apiClient.get('rides/driver?status=completed');
    const completedRides = ridesResponse.data.data || [];
    
    const walletResponse = await apiClient.get('wallet-transactions');
    const walletTransactions = walletResponse.data.data || [];

    const rewardResponse = await apiClient.get('reward-transactions');
    const rewardTransactions = rewardResponse.data.data || [];
    
    const grossEarnings = completedRides.reduce((total: number, ride: any) => {
      return total + (ride.acceptedOffer?.offerAmount || 0);
    }, 0);
    
    // Calculate Total Commission Paid
    const commission = walletTransactions.reduce((total: number, transaction: any) => {
      const desc = (transaction.desc || '').toLowerCase();
      const type = (transaction.type || '').toLowerCase();
      if (desc === 'ride commission' && type === 'debit') {
        return total + Math.abs(transaction.amount);
      }
      return total;
    }, 0);
    
    // Calculate Total Rewards Earned
    const rewards = rewardTransactions.reduce((total: number, transaction: any) => {
      if (transaction.type === 'EARNED') {
        return total + transaction.amount;
      }
      return total;
    }, 0);
    
    // Calculate Net Profit and Loss
    const netProfit = grossEarnings - commission + rewards;
    const loss = commission;
    
    return {
      profit: netProfit,
      loss: loss,
      breakdown: {
        grossEarnings,
        commission,
        rewards,
        netProfit
      }
    };
  } catch (error) {
    const err = error as any;
    console.error('Error calculating profit/loss:', err);
    // Return default values on error
    return {
      profit: 0,
      loss: 0,
      breakdown: {
        grossEarnings: 0,
        commission: 0,
        rewards: 0,
        netProfit: 0
      }
    };
  }
};

const { width } = Dimensions.get('window');
const ASSET_BASE_URL = Constants.expoConfig?.extra?.PUBLIC_ASSET_URL || 'http://192.168.1.71:9000';
const DEFAULT_BASE_URL = Constants.expoConfig?.extra?.DEFAULT_BASE_URL || 'http://localhost:3000';

const ProfileSettingsScreen = () => {
  const router = useRouter();
  const activeRole = useUserRole();
  const [name, setName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [loading, setLoading] = useState(true);
  const [imageUri, setImageUri] = useState('https://www.shutterstock.com/image-vector/default-avatar-photo-placeholder-grey-600nw-2007531536.jpg'); // Default image
  const [uploading, setUploading] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [totalRides, setTotalRides] = useState<number>(0);

  const [vehicleDetails, setVehicleDetails] = useState({ type: 'Not specified', licensePlate: 'Not specified', model: 'Not specified' });
  const [passengerRatings, setPassengerRatings] = useState({ averageRating: 0, totalReviews: 0 });
  const [profitLossData, setProfitLossData] = useState({
    profit: 0,
    loss: 0,
    breakdown: {
      grossEarnings: 0,
      commission: 0,
      rewards: 0,
      netProfit: 0
    }
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
  const hideModal = () => setModal((prev) => ({ ...prev, visible: false }));

  // Helper function to get full image URL
  const getFullImageUrl = (imageUrl: string | null | undefined) => {
    if (!imageUrl) return 'https://www.shutterstock.com/image-vector/default-avatar-photo-placeholder-grey-600nw-2007531536.jpg';
    if (imageUrl.startsWith('http')) return imageUrl;
    return `${ASSET_BASE_URL}${imageUrl}`;
  };

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const response = await apiClient.get('me');
        const userData = response.data.data;
        
        setName(userData.firstName || '');
        setLastName(userData.lastName || '');
        setEmail(userData.email || '');
        setMobile(userData.mobile || '');
        
        const photoUrl = getFullImageUrl(userData.photo);
        setImageUri(photoUrl);

        // Fetch rating depending on active role
        if (activeRole === 'driver') {
          try {
            const driverResponse = await apiClient.get('driver-profile');
            const driverData = driverResponse.data.data;
            if (driverData) {
              setRating(driverData.rating || 5);
              setTotalRides(driverData.totalRides || 0);

              setVehicleDetails({
                type: driverData.vehicleMake || 'Not specified',
                licensePlate: driverData.vehicleRegNum || driverData.licensePlate || 'Not specified',
                model: driverData.vehicleModel || driverData.model || 'Not specified',
              });

              setPassengerRatings({
                averageRating: driverData.rating || 0,
                totalReviews: driverData.totalRides || 0,
              });

              // Fetch profit/loss data for registered drivers
              const profitData = await calculateDriverProfitLoss();
              setProfitLossData(profitData);
            }
          } catch (driverErr) {
            console.error('Failed to fetch driver profile for rating:', driverErr);
            // Fallback to user rating
            setRating(userData.rating || 5);
          }
        } else {
          setRating(userData.rating || 5);
        }
      } catch (err) {
        console.error('Failed to fetch user data:', err);
        showModal('error', 'Error', 'Failed to load profile data. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchUserData();
  }, [activeRole]);

  const handleSave = async () => {
    setLoading(true);
    try {
      const updateUserDto = { firstName: name, lastName, email };
      const response = await apiClient.patch('me', updateUserDto);
      if (response.data.statusCode === 200) {
        showModal('success', 'Success', 'Profile updated successfully');
        setTimeout(() => {
          hideModal();
          router.back();
        }, 1200);
      }
    } catch (err) {
      console.error('Failed to update profile:', err);
      showModal('error', 'Error', 'Failed to update profile. Please try again.');
    } finally {
      setLoading(false);
    }
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
        
        // Create form data for file upload
        const formData = new FormData();
        formData.append('file', {
          uri: uri,
          type: 'image/jpeg',
          name: 'profile.jpg',
        } as any);

        
        // First, upload the file to uploads endpoint
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
          
          // Then update the profile with the image URL
          const profileUpdateData = { photo: fixedImageUrl };

          
          const profileResponse = await apiClient.patch('me', profileUpdateData);
   
          if (profileResponse.data.statusCode === 200) {
            const newUrl = getFullImageUrl(profileResponse.data.data.photo);
            
            setImageUri(newUrl);
            showModal('success', 'Success', 'Profile image updated successfully');
          } else {
            console.error('Profile update failed:', profileResponse.data);
            showModal('error', 'Error', 'Failed to update profile with new image.');
          }
        } else {
          console.error('Image upload failed:', uploadResponse.data);
          showModal('error', 'Error', 'Failed to upload image.');
        }
      } catch (err: any) {
        console.error('Failed to upload image:', err);
        console.error('Error details:', {
          message: err.message,
          response: err.response?.data,
          status: err.response?.status,
          config: err.config
        });
        
        if (err.code === 'NETWORK_ERROR') {
          showModal('error', 'Network Error', 'Please check your internet connection and try again.');
        } else if (err.response?.status === 413) {
          showModal('error', 'Error', 'Image file is too large. Please select a smaller image.');
        } else if (err.response?.status === 400) {
          showModal('error', 'Error', 'Invalid image format. Please select a valid image file.');
        } else {
          showModal('error', 'Error', `Failed to upload image: ${err.message || 'Unknown error'}`);
        }
      } finally {
        setUploading(false);
      }
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#00809D" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{
          backgroundColor: '#075B5E',
          borderRadius: 20,
          width: 40,
          height: 40,
          justifyContent: 'center',
          alignItems: 'center',
          elevation: 3,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
        }}>
          <Icon name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile Settings</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={styles.profileContainer}>
          <View style={styles.profileImageContainer}>
            <Image
              style={styles.profileImage}
              source={{ uri: imageUri }}
            />
            <TouchableOpacity style={styles.addImageButton} onPress={handleImageUpload} disabled={uploading}>
              {uploading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Icon name="add" size={24} color="#fff" />
              )}
            </TouchableOpacity>
          </View>

          {/* Rating Display */}
          <View style={styles.ratingContainer}>
            <View style={styles.ratingBadge}>
              <Icon name="star" size={18} color="#FFD700" style={{ marginRight: 4 }} />
              <Text style={styles.ratingText}>
                {rating !== null ? rating.toFixed(1) : '5.0'}
              </Text>
            </View>
            <Text style={styles.ratingLabel}>
              {activeRole === 'driver' 
                ? `Driver Rating (${totalRides} ${totalRides === 1 ? 'ride' : 'rides'})` 
                : 'Passenger Rating'}
            </Text>
          </View>
        </View>

        <View style={styles.inputContainer}>
          <TextInput
            mode="flat"
            placeholder="Enter your first name"
            placeholderTextColor="#ccc"
            value={name}
            onChangeText={setName}
            style={styles.input}
            underlineColor="transparent"
            activeUnderlineColor="transparent"
            cursorColor="#075B5E"
          />
          <TextInput
            mode="flat"
            placeholder="Enter your last name"
            placeholderTextColor="#ccc"
            value={lastName}
            onChangeText={setLastName}
            style={styles.input}
            underlineColor="transparent"
            activeUnderlineColor="transparent"
            cursorColor="#075B5E"
          />
          <TextInput
            mode="flat"
            value={email}
            onChangeText={setEmail}
            placeholder="Enter your email"
            placeholderTextColor="#ccc"
            keyboardType="email-address"
            autoCapitalize="none"
            style={styles.input}
            underlineColor="transparent"
            activeUnderlineColor="transparent"
            cursorColor="#075B5E"
          />
          <TextInput
            mode="flat"
            value={mobile}
            style={styles.input}
            underlineColor="transparent"
            placeholder="Your phone number"
            placeholderTextColor="#ccc"
            activeUnderlineColor="transparent"
            editable={false}
          />
          <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={loading}>
            <Text style={styles.saveButtonText}>{loading ? 'Saving...' : 'Save'}</Text>
          </TouchableOpacity>
        </View>

        {/* Driver Stats & Info section */}
        {activeRole === 'driver' && (
          <View style={styles.statsContainer}>
            {/* Vehicle Details Card */}
            <View style={styles.statsCard}>
              <View style={styles.cardHeader}>
                <Icon name="directions-car" size={20} color="#075B5E" style={{ marginRight: 8 }} />
                <Text style={styles.cardTitle}>Vehicle Details</Text>
              </View>
              <View style={styles.cardBody}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Type:</Text>
                  <Text style={styles.infoValue}>{vehicleDetails.type}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>License Plate:</Text>
                  <Text style={styles.infoValue}>{vehicleDetails.licensePlate}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Model:</Text>
                  <Text style={styles.infoValue}>{vehicleDetails.model}</Text>
                </View>
              </View>
            </View>

            {/* Passenger Ratings Card */}
            <View style={styles.statsCard}>
              <View style={styles.cardHeader}>
                <Icon name="star" size={20} color="#075B5E" style={{ marginRight: 8 }} />
                <Text style={styles.cardTitle}>Passenger Ratings</Text>
              </View>
              <View style={styles.cardBody}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Average Rating:</Text>
                  <Text style={styles.infoValue}>{passengerRatings.averageRating.toFixed(1)} / 5</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Total Reviews:</Text>
                  <Text style={styles.infoValue}>{passengerRatings.totalReviews}</Text>
                </View>
              </View>
            </View>

            {/* Earnings & Expenses Card */}
            <View style={styles.statsCard}>
              <View style={styles.cardHeader}>
                <Icon name="account-balance-wallet" size={20} color="#075B5E" style={{ marginRight: 8 }} />
                <Text style={styles.cardTitle}>Earnings & Expenses</Text>
              </View>
              <View style={styles.cardBody}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Net Profit:</Text>
                  <Text style={[styles.infoValue, { color: '#4CAF50', fontWeight: 'bold' }]}>
                    रू {profitLossData.profit}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Total Loss (Commission):</Text>
                  <Text style={[styles.infoValue, { color: '#F44336', fontWeight: 'bold' }]}>
                    रू {profitLossData.loss}
                  </Text>
                </View>
              </View>
            </View>
          </View>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    marginTop: 25,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginLeft: 16,
  },
  profileContainer: {
    alignItems: 'center',
    marginVertical: 20,
  },
  profileImageContainer: {
    position: 'relative',
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#f0f0f0',
    marginBottom: 20,
  },
  addImageButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  inputContainer: {
    paddingHorizontal: 16,
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginBottom: 16,
    paddingHorizontal: 12,
    height: 50,
  },
  saveButton: {
    backgroundColor: '#075B5E',
    borderRadius: 12,
    paddingVertical: 16,
    marginHorizontal: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  ratingContainer: {
    alignItems: 'center',
    marginTop: -10,
    marginBottom: 5,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FFE0B2',
  },
  ratingText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FF9800',
  },
  ratingLabel: {
    fontSize: 14,
    color: '#666',
    marginTop: 6,
    fontWeight: '500',
  },
  statsContainer: {
    paddingHorizontal: 16,
    marginTop: 24,
  },
  welcomeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e6f2f2',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#b2d8d9',
  },
  welcomeTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#075B5E',
    marginBottom: 4,
  },
  welcomeSub: {
    fontSize: 14,
    color: '#053e40',
  },
  statsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingBottom: 10,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  cardBody: {
    gap: 10,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
    flex: 1,
  },
  infoValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
    textAlign: 'right',
  },
});

export default ProfileSettingsScreen;