"use client"

import React, { useState, useEffect } from "react"
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, TextInput, StatusBar, SafeAreaView, Animated, KeyboardAvoidingView, Platform, ScrollView } from "react-native"
import Icon from "react-native-vector-icons/MaterialIcons"
import { useRouter, useLocalSearchParams } from "expo-router"
import { rideService } from '@/services/rideService'
import webSocketService from '@/services/websocketService'

const { width, height } = Dimensions.get("window")

// Error boundary component
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error?: Error }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[RideRating ErrorBoundary] Caught error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Text style={{ fontSize: 22, fontWeight: 'bold', marginBottom: 10 }}>Something went wrong</Text>
          <Text style={{ fontSize: 16, color: '#666', textAlign: 'center' }}>Please try refreshing the app.</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const RideRatingScreen = () => {
  const { driverName, from, to, fare, vehicle, rideId, userRole, passengerName } = useLocalSearchParams()
  const router = useRouter()
  const [rating, setRating] = useState(0)
  const [feedback, setFeedback] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [showConfetti, setShowConfetti] = useState(true)
  const [tripDetails, setTripDetails] = useState<any>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const confettiAnimation = new Animated.Value(0)
  
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  
  const positiveTags = ["Polite & Friendly", "Punctual", "Clean & Respectful", "Helpful", "Quiet & Peaceful"]
  const negativeTags = ["Late to pickup", "Impolite", "Difficult dropoff location", "Messy", "Safety concern"]

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  // Compute the actual fare from trip details or use initial fare
  const actualFare = tripDetails?.acceptedOffer?.offerAmount || 
                    (tripDetails as any)?.offerPrice || 
                    fare || 
                    '0';

  useEffect(() => {
    // Start confetti animation
    if (showConfetti) {
      Animated.sequence([
        Animated.timing(confettiAnimation, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(confettiAnimation, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setShowConfetti(false)
      })
    }
  }, [])

  // Fetch trip details if not provided as parameters
  useEffect(() => {
    const fetchTripDetails = async () => {
      if (!rideId || (driverName && from && to && fare && vehicle)) {
        return; // Already have all details or no rideId
      }

      setLoadingDetails(true);
      try {
        const details = await rideService.getRideDetails(rideId as string);
        if (details) {
          setTripDetails(details);
        }
      } catch (error) {
        console.error('[RideRating] Failed to fetch trip details:', error);
      } finally {
        setLoadingDetails(false);
      }
    };

    fetchTripDetails();
  }, [rideId, driverName, from, to, fare, vehicle]);

  const handleStarPress = (index: number) => {
    setRating(index + 1)
    setSelectedTags([])
  }

  const handleSubmit = async () => {
    if (!rideId || rating === 0) {
      alert('Please select a rating before submitting.');
      return;
    }
    
    setSubmitting(true)
    try {
      console.log('[RideRating] Submitting rating:', { rideId, rating, feedback, userRole });
      
      // Use REST API for rating (conditionally based on userRole)
      const success = userRole === 'driver'
        ? await rideService.ratePassenger(rideId as string, rating)
        : await rideService.rateDriver(rideId as string, rating);
      
      if (success) {
        console.log('[RideRating] Rating submitted successfully');
        // Show success animation
        setShowConfetti(true)
        Animated.sequence([
          Animated.timing(confettiAnimation, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(confettiAnimation, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
        ]).start(() => {
          setTimeout(() => {
            if (userRole === 'driver') {
              router.replace({ pathname: '/(driver)/driverSection', params: { fromRideComplete: 'true' } })
            } else {
              router.replace('/(tabs)')
            }
          }, 1000)
        })
      } else {
        console.error('[RideRating] Failed to submit rating');
        alert('Failed to submit rating. Please try again.')
      }
    } catch (err: any) {
      console.error('[RideRating] Error submitting rating:', err);
      
      // Provide more specific error messages
      let errorMessage = 'Error submitting rating. Please try again.';
      if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      alert(errorMessage);
    } finally {
      setSubmitting(false)
    }
  }

  const getRatingText = () => {
    switch (rating) {
      case 1:
        return "Poor"
      case 2:
        return "Fair"
      case 3:
        return "Good"
      case 4:
        return "Very Good"
      case 5:
        return "Excellent"
      default:
        return "Rate your experience"
    }
  }

  const renderDriverContent = () => {
    const pName = passengerName || (tripDetails?.passenger?.firstName && tripDetails?.passenger?.lastName 
      ? `${tripDetails.passenger.firstName} ${tripDetails.passenger.lastName}`
      : tripDetails?.passenger?.firstName || 'Passenger');
    const pickupAddress = from || (tripDetails?.pickUp?.address || 'N/A');
    const dropoffAddress = to || (tripDetails?.dropOff?.address || 'N/A');
    const distanceVal = tripDetails?.distance || (tripDetails?.routeDetails?.distance ? (tripDetails.routeDetails.distance / 1000).toFixed(1) : null);
    const durationVal = tripDetails?.duration || (tripDetails?.routeDetails?.duration ? Math.round(tripDetails.routeDetails.duration / 60) : null);

    return (
      <View style={styles.driverContent}>
        {/* Modern Top Header */}
        <View style={styles.driverHeader}>
          <TouchableOpacity 
            style={styles.driverBackButton} 
            onPress={() => router.replace({ pathname: '/(driver)/driverSection', params: { fromRideComplete: 'true' } })}
          >
            <Icon name="arrow-back" size={24} color="#BC001F" />
          </TouchableOpacity>
          <Text style={styles.driverHeaderTitle}>Saathi</Text>
          <TouchableOpacity style={styles.driverNotificationButton}>
            <Icon name="notifications" size={24} color="#BC001F" />
          </TouchableOpacity>
        </View>

        <ScrollView 
          contentContainerStyle={styles.driverScrollContainer} 
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Hero Earnings Card */}
          <View style={styles.earningsHeroCard}>
            <View style={styles.earningsHeaderRow}>
              <Icon name="payments" size={22} color="#FFFFFF" />
              <Text style={styles.earningsTitle}>Trip Completed Successfully!</Text>
            </View>
            
            <View style={styles.earningsAmountRow}>
              <Text style={styles.currencySymbol}>रू</Text>
              <Text style={styles.earningsAmountText}>
                {parseFloat(actualFare).toFixed(0)}
              </Text>
            </View>
            <Text style={styles.earningsLabelText}>TOTAL EARNINGS FOR THIS TRIP</Text>

            <View style={styles.earningsWalletBanner}>
              <Text style={styles.earningsWalletText}>Payment processed & added to your wallet</Text>
            </View>
          </View>

          {/* Passenger Information Card */}
          <View style={styles.driverSectionWrapper}>
            <Text style={styles.sectionHeaderLabel}>YOUR PASSENGER</Text>
            <View style={styles.driverPassengerCard}>
              <View style={styles.driverPassengerAvatarWrapper}>
                <Icon name="person" size={28} color="#BC001F" />
              </View>
              <View style={styles.driverPassengerDetailsCol}>
                <View style={styles.driverPassengerNameRow}>
                  <Text style={styles.driverPassengerName}>{pName}</Text>
                  <View style={styles.verifiedBadgeContainer}>
                    <Icon name="verified" size={13} color="#BC001F" />
                    <Text style={styles.verifiedBadgeText}>VERIFIED</Text>
                  </View>
                </View>
                <Text style={styles.driverPassengerSubtext}>Saathi Passenger</Text>
              </View>
              <TouchableOpacity style={styles.chatIconButton} onPress={() => {}}>
                <Icon name="chat-bubble-outline" size={22} color="#5F5E5E" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Route Details Card */}
          <View style={styles.driverSectionWrapper}>
            <Text style={styles.sectionHeaderLabel}>ROUTE DETAILS</Text>
            <View style={styles.routeCardContainer}>
              <View style={styles.timelineRowContainer}>
                <View style={styles.timelineIndicatorsCol}>
                  <View style={styles.pickupDotOuter}>
                    <View style={styles.pickupDotInner} />
                  </View>
                  <View style={styles.timelineConnectorLine} />
                  <View style={styles.dropoffSquareOuter}>
                    <View style={styles.dropoffSquareInner} />
                  </View>
                </View>
                <View style={styles.timelineAddressCol}>
                  <View style={styles.addressBlock}>
                    <Text style={styles.addressTypeLabel}>PICKUP</Text>
                    <Text style={styles.addressText} numberOfLines={1}>{pickupAddress}</Text>
                  </View>
                  <View style={styles.addressBlock}>
                    <Text style={styles.addressTypeLabel}>DROPOFF</Text>
                    <Text style={styles.addressText} numberOfLines={1}>{dropoffAddress}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.routeDivider} />

              <View style={styles.routeMetaRow}>
                <View style={styles.routeMetaItem}>
                  <Icon name="straighten" size={18} color="#5F5E5E" />
                  <Text style={styles.routeMetaText}>{distanceVal ? `${distanceVal} km` : 'N/A'}</Text>
                </View>
                <View style={styles.routeMetaItem}>
                  <Icon name="schedule" size={18} color="#5F5E5E" />
                  <Text style={styles.routeMetaText}>{durationVal ? `${durationVal} mins` : 'N/A'}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Passenger Rating Section */}
          <View style={styles.ratingSectionWrapper}>
            <Text style={styles.ratingSectionHeadline}>How was {pName.split(' ')[0]}?</Text>
            <Text style={styles.ratingSectionSubtext}>Rate your experience to help us improve.</Text>

            <View style={styles.starRowContainer}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity key={star} onPress={() => handleStarPress(star - 1)} activeOpacity={0.7} style={styles.starButton}>
                  <Icon 
                    name={rating >= star ? "star" : "star-border"} 
                    size={40} 
                    color={rating >= star ? "#BC001F" : "#E3E2E7"} 
                  />
                </TouchableOpacity>
              ))}
            </View>

            {/* Quick Feedback Tags */}
            {rating > 0 && (
              <View style={styles.tagsSection}>
                <Text style={styles.tagsTitle}>Select matching tags:</Text>
                <View style={styles.tagsList}>
                  {(rating >= 4 ? positiveTags : negativeTags).map((tag) => {
                    const isSelected = selectedTags.includes(tag);
                    return (
                      <TouchableOpacity
                        key={tag}
                        onPress={() => toggleTag(tag)}
                        style={[styles.tagChip, isSelected && styles.tagChipActive]}
                      >
                        <Text style={[styles.tagText, isSelected && styles.tagTextActive]}>
                          {tag}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Optional Feedback Input */}
            <View style={styles.commentsInputContainer}>
              <Text style={styles.commentsLabel}>Additional Comments (Optional)</Text>
              <TextInput
                style={styles.commentsTextInput}
                placeholder="Tell us more about the trip..."
                placeholderTextColor="#926E6C"
                value={feedback}
                onChangeText={setFeedback}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
          </View>

          {/* Action CTAs */}
          <View style={styles.actionButtonsContainer}>
            <TouchableOpacity
              style={[styles.primaryRedSubmitCTA, (submitting) && styles.driverSubmitButtonDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.9}
            >
              <Text style={styles.primaryRedSubmitCTAText}>
                {submitting ? 'Submitting...' : 'Submit & New Ride'}
              </Text>
              <Icon name="arrow-forward" size={20} color="#FFFFFF" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.secondaryDashboardCTA} 
              onPress={() => {
                router.replace({ pathname: '/(driver)/driverSection', params: { fromRideComplete: 'true' } });
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryDashboardCTAText}>Back to Dashboard</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  };

  const isDriver = userRole === 'driver';

  return (
    <ErrorBoundary>
    <SafeAreaView style={isDriver ? styles.driverContent : styles.container}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
        >
          <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
            {/* Confetti Animation */}
            {showConfetti && (
              <Animated.View style={[styles.confetti, { opacity: confettiAnimation }]}>
                {[...Array(20)].map((_, i) => (
                  <Animated.View
                    key={i}
                    style={[
                      styles.confettiPiece,
                      {
                        backgroundColor: ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'][i % 5],
                        left: Math.random() * width,
                        top: Math.random() * height,
                        transform: [{ rotate: `${Math.random() * 360}deg` }],
                      },
                    ]}
                  />
                ))}
              </Animated.View>
            )}

            {isDriver ? renderDriverContent() : (
              <>
                {/* Header */}
                <View style={styles.header}>
                  <View style={styles.placeholder} />
                  <Text style={styles.headerTitle}>Rate Your Ride</Text>
                  <View style={styles.placeholder} />
                </View>

                <View style={styles.content}>
                  {/* Trip Summary Card */}
                  <View style={styles.tripCard}>
                    <View style={styles.tripHeader}>
                      <View style={styles.successIconContainer}>
                        <Icon name="check-circle" size={28} color="#4CAF50" />
                      </View>
                      <Text style={styles.tripCompleteText}>Trip Completed!</Text>
                    </View>

                    {loadingDetails ? (
                      <View style={styles.loadingContainer}>
                        <Text style={styles.loadingText}>Loading trip details...</Text>
                      </View>
                    ) : (
                    <View style={styles.tripDetails}>
                      <View style={styles.tripRow}>
                        <View style={styles.iconContainer}>
                          <Icon name="person" size={18} color="#075B5E" />
                        </View>
                        <Text style={styles.tripLabel}>Driver:</Text>
                        <Text style={styles.tripValue}>
                          {driverName || (tripDetails?.driver?.firstName && tripDetails?.driver?.lastName 
                            ? `${tripDetails.driver.firstName} ${tripDetails.driver.lastName}`
                            : tripDetails?.driver?.firstName || 'Driver')}
                        </Text>
                      </View>
                      <View style={styles.tripRow}>
                        <View style={styles.iconContainer}>
                          <Icon name="directions-car" size={18} color="#075B5E" />
                        </View>
                        <Text style={styles.tripLabel}>Vehicle:</Text>
                        <Text style={styles.tripValue}>{vehicle || tripDetails?.vehicle || 'Vehicle'}</Text>
                      </View>
                      <View style={styles.tripRow}>
                        <View style={styles.iconContainer}>
                          <Icon name="payment" size={18} color="#075B5E" />
                        </View>
                        <Text style={styles.tripLabel}>Fare:</Text>
                        <Text style={styles.tripValue}>रू {parseFloat(actualFare).toFixed(0)}</Text>
                      </View>
                      <View style={styles.tripRow}>
                        <View style={styles.iconContainer}>
                          <Icon name="location-on" size={18} color="#075B5E" />
                        </View>
                        <Text style={styles.tripLabel}>From:</Text>
                        <Text style={styles.tripValue} numberOfLines={1}>
                          {from || (tripDetails?.pickUp?.address || 'Pickup Location')}
                        </Text>
                      </View>
                      <View style={styles.tripRow}>
                        <View style={styles.iconContainer}>
                          <Icon name="location-on" size={18} color="#EA2F14" />
                        </View>
                        <Text style={styles.tripLabel}>To:</Text>
                        <Text style={styles.tripValue} numberOfLines={1}>
                          {to || (tripDetails?.dropOff?.address || 'Dropoff Location')}
                        </Text>
                      </View>
                    </View>
                    )}
                  </View>

                  {/* Rating Section */}
                  <View style={styles.ratingCard}>
                    <Text style={styles.ratingTitle}>How was your ride?</Text>
                    <Text style={styles.ratingSubtitle}>{getRatingText()}</Text>

                    <View style={styles.starContainer}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <TouchableOpacity key={star} onPress={() => handleStarPress(star - 1)} style={styles.starButton}>
                          <Icon name="star" size={44} color={rating >= star ? "#FFD700" : "#E0E0E0"} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* Feedback Section */}
                  <View style={styles.feedbackCard}>
                    <Text style={styles.feedbackTitle}>Share your feedback (Optional)</Text>
                    <TextInput
                      style={styles.feedbackInput}
                      placeholder="Tell us about your ride experience..."
                      placeholderTextColor="#999"
                      value={feedback}
                      onChangeText={setFeedback}
                      multiline
                      numberOfLines={4}
                      textAlignVertical="top"
                    />
                  </View>

                  {/* Submit Button */}
                  <TouchableOpacity
                    style={[styles.submitButton, (rating === 0 || submitting) && styles.submitButtonDisabled]}
                    onPress={handleSubmit}
                    disabled={rating === 0 || submitting}
                  >
                    <Text style={styles.submitButtonText}>{submitting ? 'Submitting...' : 'Submit Rating'}</Text>
                    <Icon name="send" size={20} color="#fff" style={styles.submitIcon} />
                  </TouchableOpacity>

                  {/* Skip Button */}
                  <TouchableOpacity 
                    style={styles.skipButton} 
                    onPress={() => {
                      router.replace("/(tabs)")
                    }}
                  >
                    <Text style={styles.skipButtonText}>Skip</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
    </SafeAreaView>
    </ErrorBoundary>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  header: {
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    marginTop: 30,
  },
  backButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: "#f8f9fa",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#075B5E",
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  tripCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  tripHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  successIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#E8F5E8",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  tripCompleteText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#333",
  },
  tripDetails: {
    gap: 16,
  },
  tripRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f8f9fa",
    alignItems: "center",
    justifyContent: "center",
  },
  tripLabel: {
    fontSize: 15,
    color: "#666",
    minWidth: 60,
    fontWeight: "500",
  },
  tripValue: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
    flex: 1,
  },
  ratingCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    marginBottom: 24,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  ratingTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#333",
    marginBottom: 8,
  },
  ratingSubtitle: {
    fontSize: 16,
    color: "#075B5E",
    fontWeight: "600",
    marginBottom: 28,
  },
  starContainer: {
    flexDirection: "row",
    gap: 12,
  },
  starButton: {
    padding: 6,
  },
  feedbackCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    marginBottom: 28,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  feedbackTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
    marginBottom: 16,
  },
  feedbackInput: {
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 16,
    padding: 18,
    fontSize: 16,
    color: "#333",
    minHeight: 120,
    backgroundColor: "#f8f9fa",
    textAlignVertical: "top",
  },
  submitButton: {
    backgroundColor: "#075B5E",
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  submitButtonDisabled: {
    backgroundColor: "#ccc",
    elevation: 0,
  },
  submitButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    marginRight: 8,
  },
  submitIcon: {
    marginLeft: 4,
  },
  skipButton: {
    paddingVertical: 14,
    alignItems: "center",
  },
  skipButtonText: {
    color: "#666",
    fontSize: 16,
    fontWeight: "600",
  },
  confetti: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  confettiPiece: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  loadingContainer: {
    alignItems: "center",
    paddingVertical: 20,
  },
  loadingText: {
    fontSize: 16,
    color: "#666",
    fontStyle: "italic",
  },
  // --- DRIVER SECTION STYLES ---
  driverContent: {
    flex: 1,
    backgroundColor: '#FAF8FE',
  },
  driverHeader: {
    backgroundColor: '#FAF8FE',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    paddingTop: Platform.OS === 'ios' ? 52 : 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.04)',
  },
  driverBackButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#F4F3F8',
  },
  driverHeaderTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#BC001F',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium',
  },
  driverNotificationButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#F4F3F8',
  },
  driverScrollContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  earningsHeroCard: {
    backgroundColor: '#E6192E',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#BC001F',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 6,
  },
  earningsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  earningsTitle: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  earningsAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginVertical: 4,
  },
  currencySymbol: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    marginRight: 4,
    opacity: 0.9,
  },
  earningsAmountText: {
    fontSize: 56,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -1,
  },
  earningsLabelText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 2,
    marginBottom: 16,
  },
  earningsWalletBanner: {
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  earningsWalletText: {
    color: 'rgba(255, 255, 255, 0.95)',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  driverSectionWrapper: {
    marginBottom: 20,
  },
  sectionHeaderLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#5F5E5E',
    letterSpacing: 1,
    marginBottom: 8,
    paddingLeft: 4,
  },
  driverPassengerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#EFEDF3',
  },
  driverPassengerAvatarWrapper: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFDAD7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  driverPassengerDetailsCol: {
    flex: 1,
  },
  driverPassengerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  driverPassengerName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1B1F',
  },
  verifiedBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFDAD6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 3,
  },
  verifiedBadgeText: {
    fontSize: 10,
    color: '#BC001F',
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  driverPassengerSubtext: {
    fontSize: 13,
    color: '#5F5E5E',
    marginTop: 2,
  },
  chatIconButton: {
    padding: 8,
  },
  routeCardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#EFEDF3',
  },
  timelineRowContainer: {
    flexDirection: 'row',
  },
  timelineIndicatorsCol: {
    alignItems: 'center',
    width: 20,
    marginRight: 12,
    paddingTop: 4,
  },
  pickupDotOuter: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(188, 0, 31, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickupDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#BC001F',
  },
  timelineConnectorLine: {
    width: 1.5,
    height: 36,
    backgroundColor: '#E3E2E7',
    marginVertical: 3,
  },
  dropoffSquareOuter: {
    width: 14,
    height: 14,
    borderRadius: 3,
    backgroundColor: 'rgba(26, 27, 31, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropoffSquareInner: {
    width: 7,
    height: 7,
    borderRadius: 1.5,
    backgroundColor: '#1A1B1F',
  },
  timelineAddressCol: {
    flex: 1,
    gap: 16,
  },
  addressBlock: {},
  addressTypeLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#5F5E5E',
    letterSpacing: 1,
    marginBottom: 2,
  },
  addressText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1B1F',
  },
  routeDivider: {
    height: 1,
    backgroundColor: '#E3E2E7',
    marginVertical: 14,
  },
  routeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  routeMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  routeMetaText: {
    fontSize: 14,
    color: '#5F5E5E',
    fontWeight: '500',
  },
  ratingSectionWrapper: {
    alignItems: 'center',
    marginVertical: 12,
  },
  ratingSectionHeadline: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1B1F',
    marginBottom: 4,
  },
  ratingSectionSubtext: {
    fontSize: 14,
    color: '#5F5E5E',
    marginBottom: 16,
  },
  starRowContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 16,
  },
  starButton: {
    padding: 4,
  },
  tagsSection: {
    marginTop: 12,
    width: '100%',
  },
  tagsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#5F5E5E',
    marginBottom: 10,
  },
  tagsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagChip: {
    backgroundColor: '#F4F3F8',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E3E2E7',
  },
  tagChipActive: {
    backgroundColor: '#BC001F',
    borderColor: '#BC001F',
  },
  tagText: {
    fontSize: 13,
    color: '#1A1B1F',
    fontWeight: '500',
  },
  tagTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  commentsInputContainer: {
    width: '100%',
    marginTop: 16,
  },
  commentsLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#5F5E5E',
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  commentsTextInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7BCB9',
    borderRadius: 16,
    padding: 14,
    fontSize: 14,
    color: '#1A1B1F',
    minHeight: 80,
  },
  actionButtonsContainer: {
    marginTop: 20,
    gap: 10,
  },
  primaryRedSubmitCTA: {
    backgroundColor: '#BC001F',
    paddingVertical: 16,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#BC001F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryRedSubmitCTAText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  driverSubmitButtonDisabled: {
    backgroundColor: '#C8C6C5',
    elevation: 0,
    shadowOpacity: 0,
  },
  secondaryDashboardCTA: {
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  secondaryDashboardCTAText: {
    color: '#5F5E5E',
    fontSize: 15,
    fontWeight: '700',
  },
});

export default RideRatingScreen;
