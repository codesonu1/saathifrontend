import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { locationService, GoogleMapsPlace } from '../app/utils/locationService';
import Toast from './ui/Toast';

interface LocationSearchProps {
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  onLocationSelect: (place: GoogleMapsPlace) => void;
  iconColor?: string;
  showSavedAddresses?: boolean;
  disabled?: boolean;
  boundingBox?: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
}

const LocationSearch: React.FC<LocationSearchProps> = ({
  placeholder,
  value,
  onChangeText,
  onLocationSelect,
  iconColor = '#075B5E',
  showSavedAddresses = true,
  disabled = false,
  boundingBox,
}) => {
  const [searchResults, setSearchResults] = useState<GoogleMapsPlace[]>([]);
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: 'success' | 'error' | 'info';
  }>({
    visible: false,
    message: '',
    type: 'info',
  });

  const searchTimeoutRef = useRef<number | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ visible: true, message, type });
  };

  const hideToast = () => {
    setToast(prev => ({ ...prev, visible: false }));
  };

  useEffect(() => {
    if (showSavedAddresses) {
      loadSavedAddresses();
    }
    
    // Test Google Maps API connectivity
    locationService.testGoogleMapsAPI().then(isWorking => {
      console.log('Google Maps API working:', isWorking);
    });
  }, [showSavedAddresses]);

  const loadSavedAddresses = async () => {
    try {
      const addresses = await locationService.getSavedAddresses();
      setSavedAddresses(addresses);
    } catch (error) {
      console.error('Error loading saved addresses:', error);
    }
  };

  const handleSearch = async (query: string) => {
    onChangeText(query);

    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Don't search if query is too short
    if (query.length < 3) {
      setSearchResults([]);
      return;
    }

    // Debounce search
    searchTimeoutRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        console.log('LocationSearch: Searching for:', query);
        const results = await locationService.searchPlaces(query, boundingBox);
        console.log('LocationSearch: Received results:', results);
        setSearchResults(results);
        
        // Only show "no places found" if we have no results and it's not due to fallback
        if (results.length === 0) {
          showToast('No places found. Try a different search term.', 'info');
        }
      } catch (error: any) {
        console.error('LocationSearch: Search error:', error);
        let errorMessage = 'Error searching locations';
        
        if (error.response?.status === 401) {
          errorMessage = 'Authentication required. Please login again.';
        } else if (error.response?.status === 500) {
          errorMessage = 'Server error. Please try again later.';
        } else if (error.message) {
          errorMessage = `Search failed: ${error.message}`;
        }
        
        showToast(errorMessage, 'error');
        setSearchResults([]);
      } finally {
        setLoading(false);
      }
    }, 500);
  };

  const handlePlaceSelect = async (place: GoogleMapsPlace) => {
    console.log('Selected place:', place);
    
    // If place has no coordinates (from Autocomplete API), get details
    if (!place.location || (place.location.lat === 0 && place.location.lng === 0)) {
      if (place.place_id) {
        console.log('Getting place details for coordinates...');
        const placeDetails = await locationService.getPlaceDetails(place.place_id, boundingBox);
        if (placeDetails) {
          place = placeDetails;
          console.log('Updated place with coordinates:', place);
        } else {
          showToast('Selected place is outside the allowed area.', 'error');
          return;
        }
      }
    }
    
    // Extract coordinates from the place object
    const coordinates = place.location;
    
    if (coordinates && coordinates.lat && coordinates.lng) {
      console.log('Selected location:', place);
      onLocationSelect(place);
      onChangeText(place.name);
      setShowModal(false);
      setSearchResults([]);
    } else {
      console.error('Invalid place coordinates:', place);
      showToast('Invalid location data', 'error');
    }
  };

  const handleSavedAddressSelect = (address: any) => {
    const place: GoogleMapsPlace = {
      place_id: address._id,
      name: address.name,
      address: address.address,
      location: {
        lat: address.latitude || 0,
        lng: address.longitude || 0
      },
      description: address.address,
      structured_formatting: {
        main_text: address.name,
        secondary_text: address.address,
      },
    };
    handlePlaceSelect(place);
  };

  const renderSearchResult = ({ item }: { item: GoogleMapsPlace }) => (
    <TouchableOpacity
      style={styles.searchResult}
      onPress={() => handlePlaceSelect(item)}
    >
      <MaterialIcons name="location-on" size={20} color="#666" />
      <View style={styles.searchResultText}>
        <Text style={styles.searchResultMain}>
          {item.structured_formatting?.main_text || item.name}
        </Text>
        <Text style={styles.searchResultSecondary}>
          {item.structured_formatting?.secondary_text || item.address}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderSavedAddress = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.savedAddress}
      onPress={() => handleSavedAddressSelect(item)}
    >
      <MaterialIcons name="bookmark" size={20} color="#075B5E" />
      <View style={styles.savedAddressText}>
        <Text style={styles.savedAddressName}>{item.name}</Text>
        <Text style={styles.savedAddressAddress}>{item.address}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.inputContainer, disabled && styles.inputContainerDisabled]}
        onPress={() => !disabled && setShowModal(true)}
        disabled={disabled}
      >
        <MaterialIcons name="search" size={20} color={disabled ? "#ccc" : iconColor} style={styles.searchIcon} />
        <Text style={[styles.inputText, disabled && styles.inputTextDisabled]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <MaterialIcons name="keyboard-arrow-down" size={20} color={disabled ? "#ccc" : "#666"} />
      </TouchableOpacity>

      <Modal
        visible={showModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <MaterialIcons name="close" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Select Location</Text>
            <View style={styles.placeholder} />
          </View>

          <View style={styles.searchContainer}>
            <View style={styles.searchInputContainer}>
              <MaterialIcons name="search" size={20} color="#666" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search for a place"
                value={value}
                onChangeText={handleSearch}
                autoFocus
              />
              {loading && <ActivityIndicator size="small" color="#075B5E" />}
            </View>
          </View>

          <FlatList
            data={searchResults}
            renderItem={renderSearchResult}
            keyExtractor={(item, index) => item.place_id || `place_${index}`}
            style={styles.resultsList}
            ListEmptyComponent={
              !loading && value.length >= 3 ? (
                <View style={styles.emptyState}>
                  <MaterialIcons name="search-off" size={48} color="#ccc" />
                  <Text style={styles.emptyStateText}>No places found</Text>
                </View>
              ) : null
            }
            ListHeaderComponent={
              showSavedAddresses && savedAddresses.length > 0 ? (
                <View style={styles.savedAddressesSection}>
                  <Text style={styles.sectionTitle}>Saved Addresses</Text>
                  {savedAddresses.map((address) => (
                    <TouchableOpacity
                      key={address._id || address.name}
                      style={styles.savedAddress}
                      onPress={() => handleSavedAddressSelect(address)}
                    >
                      <MaterialIcons name="bookmark" size={20} color="#075B5E" />
                      <View style={styles.savedAddressText}>
                        <Text style={styles.savedAddressName}>{address.name}</Text>
                        <Text style={styles.savedAddressAddress}>{address.address}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                  <View style={styles.divider} />
                </View>
              ) : null
            }
          />
        </View>

        <Toast
          visible={toast.visible}
          message={toast.message}
          type={toast.type}
          onHide={hideToast}
          duration={3000}
        />
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  searchIcon: {
    marginRight: 12,
  },
  inputText: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  inputTextDisabled: {
    color: '#ccc',
  },
  inputContainerDisabled: {
    backgroundColor: '#f5f5f5',
    borderColor: '#e0e0e0',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  placeholder: {
    width: 24,
  },
  searchContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    marginLeft: 12,
  },
  resultsList: {
    flex: 1,
  },
  savedAddressesSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  savedAddress: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  savedAddressText: {
    marginLeft: 12,
    flex: 1,
  },
  savedAddressName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  savedAddressAddress: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  searchResult: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  searchResultText: {
    marginLeft: 12,
    flex: 1,
  },
  searchResultMain: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  searchResultSecondary: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#e9ecef',
    marginVertical: 16,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666',
    marginTop: 12,
  },
});

export default LocationSearch; 