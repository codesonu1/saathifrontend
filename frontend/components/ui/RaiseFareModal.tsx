import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Dimensions,
  StatusBar,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

interface RaiseFareModalProps {
  visible: boolean;
  onClose: () => void;
  onSend: (proposedFare: number) => void;
  calculatedFare: number;
  passengerProposedFare?: number; // For driver counter-offer
  isDriver?: boolean;
  loading?: boolean;
}

const RaiseFareModal: React.FC<RaiseFareModalProps> = ({
  visible,
  onClose,
  onSend,
  calculatedFare,
  passengerProposedFare,
  isDriver = false,
  loading = false,
}) => {
  // Pre-fill with calculated fare for passenger, passenger's proposed for driver
  const initialFare = isDriver ? (passengerProposedFare || calculatedFare) : calculatedFare;
  const [proposedFare, setProposedFare] = useState(initialFare);
  const [validationMessage, setValidationMessage] = useState('');

  // Reset fare when modal opens
  useEffect(() => {
    if (visible) {
      const newInitialFare = isDriver ? (passengerProposedFare || calculatedFare) : calculatedFare;
      setProposedFare(newInitialFare);
      setValidationMessage('');
    }
  }, [visible, isDriver, calculatedFare, passengerProposedFare]);

  // Validation functions
  const validatePassengerRaiseFare = (calculated: number, proposed: number) => {
    const minRequired = calculated * 0.9; 
    if (proposed < minRequired) {
      return {
        isValid: false,
        message: `Fare must be at least रू ${minRequired.toFixed(0)} (Can be less than 10% of calculated fare)`
      };
    }
    return { isValid: true };
  };

  const validateDriverCounterOffer = (passengerProposed: number, driverCounter: number) => {
    const maxAllowed = passengerProposed * 1.1; // 10% more than passenger's proposed
    if (driverCounter > maxAllowed) {
      return {
        isValid: false,
        message: `Fare cannot exceed रू ${maxAllowed.toFixed(0)} (10% more than passenger's proposed fare)`
      };
    }
    return { isValid: true };
  };

  const validatePassengerCounterOffer = (driverOffer: number, passengerCounter: number) => {
    const minAllowed = driverOffer * 0.9; // 10% less than driver's offer
    const maxAllowed = driverOffer * 1.1; // 10% more than driver's offer
    
    if (passengerCounter < minAllowed) {
      return {
        isValid: false,
        message: `Fare must be at least रू ${minAllowed.toFixed(0)} (Can be less tahn 10% of driver's offer)`
      };
    }
    
    if (passengerCounter > maxAllowed) {
      return {
        isValid: false,
        message: `Fare cannot exceed रू ${maxAllowed.toFixed(0)} (Can be more than 10% of driver's offer)`
      };
    }
    
    return { isValid: true };
  };

  // Get validation based on context
  const getValidation = () => {
    if (isDriver) {
      // Driver counter-offer validation
      return validateDriverCounterOffer(passengerProposedFare || calculatedFare, proposedFare);
    } else {
      // Check if this is a passenger counter-offer (has passengerProposedFare) or initial raise
      if (passengerProposedFare && passengerProposedFare !== calculatedFare) {
        // Passenger counter-offer validation
        return validatePassengerCounterOffer(passengerProposedFare, proposedFare);
      } else {
        // Passenger initial raise fare validation
        return validatePassengerRaiseFare(calculatedFare, proposedFare);
      }
    }
  };

  const validation = getValidation();

  const handleIncrement = () => {
    const newFare = proposedFare + 1;
    setProposedFare(newFare);
    setValidationMessage('');
  };

  const handleDecrement = () => {
    const newFare = Math.max(0, proposedFare - 1);
    setProposedFare(newFare);
    setValidationMessage('');
  };

  const handleFareChange = (text: string) => {
    const value = parseInt(text) || 0;
    setProposedFare(value);
    setValidationMessage('');
  };

  const handleSend = () => {
    if (!validation.isValid) {
      setValidationMessage(validation.message || 'Invalid fare amount');
      return;
    }
    onSend(proposedFare);
  };

  const getModalTitle = () => {
    if (isDriver) {
      return 'Counter Offer';
    }
    
    // Check if this is a passenger counter-offer
    if (passengerProposedFare && passengerProposedFare !== calculatedFare) {
      return 'Counter Offer';
    }
    
    return 'Raise Fare';
  };

  const getFareInfo = () => {
    if (isDriver) {
      return {
        label: 'Passenger Proposed:',
        value: passengerProposedFare || calculatedFare,
        maxAllowed: (passengerProposedFare || calculatedFare) * 1.1
      };
    }
    
    // Check if this is a passenger counter-offer
    if (passengerProposedFare && passengerProposedFare !== calculatedFare) {
      return {
        label: 'Driver\'s Offer:',
        value: passengerProposedFare,
        minAllowed: passengerProposedFare * 0.9,
        maxAllowed: passengerProposedFare * 1.1
      };
    }
    
    return {
      label: 'Calculated Fare:',
      value: calculatedFare,
      minRequired: calculatedFare * 0.9
    };
  };

  const fareInfo = getFareInfo();

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent={true}
    >
      <StatusBar backgroundColor="rgba(0, 0, 0, 0.5)" barStyle="light-content" />
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>{getModalTitle()}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <MaterialIcons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            <View style={styles.fareInfoContainer}>
              <Text style={styles.fareInfoLabel}>{fareInfo.label}</Text>
              <Text style={styles.fareInfoValue}>रू {fareInfo.value.toFixed(0)}</Text>
              {isDriver ? (
                <Text style={styles.fareInfoSubtext}>
                  Maximum Allowed: रू {(fareInfo.maxAllowed || 0).toFixed(0)} (10%+)
                </Text>
              ) : passengerProposedFare && passengerProposedFare !== calculatedFare ? (
                <Text style={styles.fareInfoSubtext}>
                  Range: रू {(fareInfo.minAllowed || 0).toFixed(0)} - रू {(fareInfo.maxAllowed || 0).toFixed(0)} (90%-110%)
                </Text>
              ) : (
                <Text style={styles.fareInfoSubtext}>
                  Minimum Required: रू {(fareInfo.minRequired || 0).toFixed(0)} (10%-)
                </Text>
              )}
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Your Proposed Fare:</Text>
              <View style={styles.fareInputGroup}>
                <TouchableOpacity 
                  style={styles.adjustButton} 
                  onPress={handleDecrement}
                  disabled={loading}
                >
                  <MaterialIcons name="remove" size={24} color="#075B5E" />
                </TouchableOpacity>
                
                <TextInput
                  style={styles.fareInput}
                  value={Math.round(proposedFare).toString()}
                  onChangeText={handleFareChange}
                  keyboardType="numeric"
                  placeholder="0"
                  editable={!loading}
                />
                
                <TouchableOpacity 
                  style={styles.adjustButton} 
                  onPress={handleIncrement}
                  disabled={loading}
                >
                  <MaterialIcons name="add" size={24} color="#075B5E" />
                </TouchableOpacity>
              </View>
            </View>

            {validationMessage && (
              <View style={styles.errorContainer}>
                <MaterialIcons name="error" size={16} color="#EA2F14" />
                <Text style={styles.errorText}>{validationMessage}</Text>
              </View>
            )}
          </View>

          <View style={styles.footer}>
            <TouchableOpacity 
              style={styles.cancelButton} 
              onPress={onClose}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.sendButton,
                (!validation.isValid || loading) && styles.sendButtonDisabled
              ]}
              onPress={handleSend}
              disabled={!validation.isValid || loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.sendButtonText}>
                  {isDriver ? 'Send Offer' : (passengerProposedFare && passengerProposedFare !== calculatedFare ? 'Send Counter Offer' : 'Send to Drivers')}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: StatusBar.currentHeight || 0,
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: width * 0.9,
    maxWidth: 400,
    padding: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: 20,
  },
  fareInfoContainer: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
  },
  fareInfoLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  fareInfoValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#075B5E',
    marginBottom: 4,
  },
  fareInfoSubtext: {
    fontSize: 12,
    color: '#999',
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 12,
  },
  fareInputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    paddingHorizontal: 12,
  },
  adjustButton: {
    padding: 12,
    borderRadius: 6,
    backgroundColor: '#f8f9fa',
  },
  fareInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffebee',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    color: '#EA2F14',
    marginLeft: 8,
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#666',
  },
  sendButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#075B5E',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  sendButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

export default RaiseFareModal; 