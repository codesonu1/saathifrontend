"use client"

import React, { useState, useEffect } from "react"
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, TextInput, StatusBar, SafeAreaView, Animated, KeyboardAvoidingView, Platform, ScrollView } from "react-native"
import Icon from "react-native-vector-icons/MaterialIcons"
import { useRouter, useLocalSearchParams } from "expo-router"
import { rideService } from '../utils/rideService'
import webSocketService from '../utils/websocketService'

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
              router.push({ pathname: '/(driver)/driverSection', params: { fromRideComplete: 'true' } })
            } else {
              router.push('/(tabs)')
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
      
    return (
      <View style={styles.driverContent}>
        {/* Header */}
        <View style={styles.driverHeader}>
          <TouchableOpacity onPress={() => router.back()} style={styles.driverBackButton}>
            <Icon name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.driverHeaderTitle}>Trip Summary</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Hero Earnings Card */}
        <View style={styles.earningsHeroCard}>
          <View style={styles.earningsHeader}>
            <Icon name="monetization-on" size={24} color="#FFD700" />
            <Text style={styles.earningsTitle}>Trip Completed Successfully!</Text>
          </View>
          <Text style={styles.earningsAmount}>रू{parseFloat(actualFare).toFixed(0)}</Text>
          <Text style={styles.earningsSubtitle}>Total Earnings For This Trip</Text>
          <View style={styles.earningsBanner}>
            <Text style={styles.earningsBannerText}>Payment processed & added to your wallet balance</Text>
          </View>
        </View>

        {/* Passenger Profile Info */}
        <View style={styles.driverCard}>
          <Text style={styles.sectionLabel}>Your Passenger</Text>
          <View style={styles.driverPassengerInfo}>
            <View style={styles.driverPassengerAvatar}>
              <Icon name="person" size={28} color="#075B5E" />
            </View>
            <View style={styles.driverPassengerDetails}>
              <Text style={styles.driverPassengerName}>{pName}</Text>
              <Text style={styles.driverPassengerRole}>Saathi Passenger</Text>
            </View>
            <View style={styles.successBadge}>
              <Icon name="verified" size={16} color="#075B5E" />
              <Text style={styles.successBadgeText}>Verified</Text>
            </View>
          </View>
        </View>

        {/* Trip Timeline Info */}
        <View style={styles.driverCard}>
          <Text style={styles.sectionLabel}>Route Details</Text>
          <View style={styles.timelineContainer}>
            <View style={styles.timelineItem}>
              <View style={styles.dotPickup} />
              <View style={styles.timelineTextContainer}>
                <Text style={styles.timelineLabel}>PICKUP</Text>
                <Text style={styles.timelineValue} numberOfLines={1}>
                  {from || (tripDetails?.pickUp?.address || 'Pickup Location')}
                </Text>
              </View>
            </View>
            <View style={styles.timelineLine} />
            <View style={styles.timelineItem}>
              <View style={styles.dotDropoff} />
              <View style={styles.timelineTextContainer}>
                <Text style={styles.timelineLabel}>DROPOFF</Text>
                <Text style={styles.timelineValue} numberOfLines={1}>
                  {to || (tripDetails?.dropOff?.address || 'Dropoff Location')}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Rating Section */}
        <View style={styles.driverCard}>
          <Text style={styles.driverRatingTitle}>How was {pName.split(' ')[0]}?</Text>
          <Text style={styles.driverRatingSubtitle}>{getRatingText()}</Text>

          <View style={styles.starContainer}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity key={star} onPress={() => handleStarPress(star - 1)} style={styles.starButton}>
                <Icon 
                  name="star" 
                  size={46} 
                  color={rating >= star ? "#FFD700" : "#E0E0E0"} 
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
        </View>

        {/* Feedback Text Input */}
        <View style={styles.driverCard}>
          <Text style={styles.feedbackTitle}>Additional Comments (Optional)</Text>
          <TextInput
            style={styles.feedbackInput}
            placeholder="Tell us about the passenger behavior, punctuality or helper experience..."
            placeholderTextColor="#999"
            value={feedback}
            onChangeText={setFeedback}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* Submit / Skip Buttons */}
        <View style={styles.driverActions}>
          <TouchableOpacity
            style={[styles.driverSubmitButton, (rating === 0 || submitting) && styles.driverSubmitButtonDisabled]}
            onPress={handleSubmit}
            disabled={rating === 0 || submitting}
          >
            <Text style={styles.driverSubmitButtonText}>
              {submitting ? 'Submitting...' : 'Complete Trip Summary'}
            </Text>
            <Icon name="check" size={20} color="#fff" style={styles.submitIcon} />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.driverSkipButton} 
            onPress={() => {
              router.push({ pathname: '/(driver)/driverSection', params: { fromRideComplete: 'true' } });
            }}
          >
            <Text style={styles.driverSkipButtonText}>Skip Feedback</Text>
          </TouchableOpacity>
        </View>
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
                  <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Icon name="arrow-back" size={24} color="#075B5E" />
                  </TouchableOpacity>
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
                        <Text style={styles.tripValue}>₹{parseFloat(actualFare).toFixed(0)}</Text>
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
                      router.push("/(tabs)")
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
    backgroundColor: '#F3F4F6',
  },
  driverHeader: {
    backgroundColor: '#075B5E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 18,
    marginTop: 0,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  driverBackButton: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  driverHeaderTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  earningsHeroCard: {
    backgroundColor: '#075B5E',
    borderRadius: 20,
    padding: 24,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 16,
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  earningsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  earningsTitle: {
    fontSize: 15,
    color: '#E6F4EA',
    fontWeight: '600',
  },
  earningsAmount: {
    fontSize: 38,
    fontWeight: '800',
    color: '#FFF',
    marginBottom: 4,
  },
  earningsSubtitle: {
    fontSize: 13,
    color: '#A3D3D4',
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  earningsBanner: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: 16,
    width: '100%',
    alignItems: 'center',
  },
  earningsBannerText: {
    color: '#E6F4EA',
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
  },
  driverCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 14,
  },
  driverPassengerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  driverPassengerAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#E6F2F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  driverPassengerDetails: {
    flex: 1,
  },
  driverPassengerName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
  },
  driverPassengerRole: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  successBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E6F2F2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  successBadgeText: {
    fontSize: 11,
    color: '#075B5E',
    fontWeight: '700',
  },
  timelineContainer: {
    marginTop: 4,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dotPickup: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#075B5E',
    marginHorizontal: 4,
  },
  dotDropoff: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EA2F14',
    marginHorizontal: 4,
  },
  timelineLine: {
    width: 2,
    height: 16,
    backgroundColor: '#E5E7EB',
    marginLeft: 8,
    marginVertical: 2,
  },
  timelineTextContainer: {
    marginLeft: 14,
    flex: 1,
  },
  timelineLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 0.5,
  },
  timelineValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginTop: 1,
  },
  driverRatingTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#111',
    textAlign: 'center',
    marginBottom: 6,
  },
  driverRatingSubtitle: {
    fontSize: 15,
    color: '#075B5E',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 20,
  },
  tagsSection: {
    marginTop: 24,
    width: '100%',
  },
  tagsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 10,
  },
  tagsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagChip: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tagChipActive: {
    backgroundColor: '#075B5E',
    borderColor: '#075B5E',
  },
  tagText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
  },
  tagTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  driverActions: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    marginTop: 10,
  },
  driverSubmitButton: {
    backgroundColor: '#075B5E',
    borderRadius: 16,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  driverSubmitButtonDisabled: {
    backgroundColor: '#ccc',
    elevation: 0,
  },
  driverSubmitButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    marginRight: 8,
  },
  driverSkipButton: {
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  driverSkipButtonText: {
    color: '#6B7280',
    fontSize: 15,
    fontWeight: '600',
  },
})

export default RideRatingScreen
