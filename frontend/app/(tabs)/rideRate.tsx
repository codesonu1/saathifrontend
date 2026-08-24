"use client"

import React, { useState, useEffect } from "react"
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, TextInput, StatusBar, SafeAreaView, Animated, KeyboardAvoidingView, Platform, ScrollView } from "react-native"
import Icon from "react-native-vector-icons/MaterialIcons"
import { useRouter, useLocalSearchParams } from "expo-router"
import { useSafeAreaInsets } from 'react-native-safe-area-context'
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
  const insets = useSafeAreaInsets();
  const rawTop = insets.top > 0 ? insets.top : (Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 44);
  const safeTopPadding = Math.max(rawTop + 6, 34);

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
                    <Text style={styles.driverVerifiedBadgeText}>VERIFIED</Text>
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
                <TouchableOpacity key={star} onPress={() => handleStarPress(star - 1)} activeOpacity={0.7} style={styles.driverStarButton}>
                  <Icon 
                    name={rating >= star ? "star" : "star-border"} 
                    size={32} 
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
          {isDriver ? renderDriverContent() : (
            <ScrollView contentContainerStyle={styles.passengerScrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Confetti / Party Bumper Explosion Animation inside top section */}
              {showConfetti && (
                <Animated.View style={[styles.confettiOverlayContainer, { opacity: confettiAnimation }]}>
                  {[...Array(24)].map((_, i) => {
                    const angle = (i / 24) * 360;
                    const radius = 60 + (i % 5) * 20;
                    const translateX = radius * Math.cos((angle * Math.PI) / 180);
                    const translateY = radius * Math.sin((angle * Math.PI) / 180);
                    const isYellow = i % 2 === 0;

                    return (
                      <Animated.View
                        key={i}
                        style={[
                          styles.partyBumperPiece,
                          {
                            backgroundColor: isYellow ? '#FFD700' : '#FFFFFF',
                            width: i % 3 === 0 ? 10 : 6,
                            height: i % 3 === 0 ? 6 : 10,
                            borderRadius: i % 4 === 0 ? 5 : 2,
                            transform: [
                              { translateX },
                              { translateY },
                              { rotate: `${i * 25}deg` },
                            ],
                          },
                        ]}
                      />
                    );
                  })}
                </Animated.View>
              )}

              <View style={[styles.passengerMainContainer, { paddingTop: safeTopPadding }]}>
                {/* Header Bar */}
                <View style={styles.headerBar}>
                  <TouchableOpacity style={styles.headerIconButton} onPress={() => router.replace("/(tabs)")}>
                    <Icon name="arrow-back" size={20} color="#BC001F" />
                  </TouchableOpacity>
                  <Text style={styles.headerLogoTitle}>Saathi</Text>
                  <TouchableOpacity style={styles.headerIconButton}>
                    <Icon name="notifications" size={20} color="#BC001F" />
                  </TouchableOpacity>
                </View>

                {/* 1. Red Hero Fare Card */}
                <View style={styles.redHeroCardCentered}>
                  {/* Background Arc Accent */}
                  <View style={styles.heroArcAccent} />

                  {/* Centered Check Circle */}
                  <View style={styles.heroCenterCheckCircle}>
                    <Icon name="check" size={20} color="#BC001F" />
                  </View>

                  <Text style={styles.heroCenteredTitle}>Trip Completed!</Text>
                  <Text style={styles.heroCenteredSubtext}>Thanks for riding with Saathi</Text>

                  {/* Total Fare White Pill */}
                  <View style={styles.whiteFarePill}>
                    <Text style={styles.whiteFarePillText}>Total Fare</Text>
                  </View>

                  {/* Large Centered Fare */}
                  <Text style={styles.heroCenteredFareText}>
                    <Text style={styles.heroCurrencySymbol}>रू </Text>
                    {parseFloat(actualFare).toFixed(0)}
                  </Text>

                  {/* Bottom Payment Success Banner */}
                  <View style={styles.whitePaymentSuccessBanner}>
                    <Icon name="check-circle" size={16} color="#2E7D32" style={{ marginRight: 6 }} />
                    <Text style={styles.whitePaymentSuccessText}>Payment completed successfully</Text>
                  </View>
                </View>

                {/* 2. Ride Details Card */}
                <View style={styles.rideDetailsCard}>
                  <View style={styles.cardSectionHeaderRow}>
                    <View style={styles.redHeaderBadge}>
                      <Icon name="directions-car" size={14} color="#BC001F" />
                    </View>
                    <Text style={styles.sectionHeaderTitle}>Ride Details</Text>
                  </View>

                  {/* Driver Sub-row */}
                  <View style={styles.driverSubRowContainer}>
                    <View style={styles.driverAvatarContainer}>
                      <Icon name="person" size={24} color="#BC001F" />
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.driverNameText}>
                          {driverName || (tripDetails?.driver?.firstName && tripDetails?.driver?.lastName 
                            ? `${tripDetails.driver.firstName} ${tripDetails.driver.lastName}`
                            : tripDetails?.driver?.firstName || 'Vardan Shah')}
                        </Text>
                        <View style={styles.verifiedBadge}>
                          <Icon name="check" size={10} color="#BC001F" />
                          <Text style={styles.verifiedBadgeText}>VERIFIED</Text>
                        </View>
                      </View>
                      <Text style={styles.driverRoleSubtext}>Driver</Text>
                    </View>
                  </View>

                  <View style={styles.cardRowDivider} />

                  {/* Clean Full-width Detail Rows */}
                  <View style={styles.fullWidthDetailRow}>
                    <View style={styles.detailRowLeft}>
                      <Icon name="directions-car" size={16} color="#BC001F" />
                      <Text style={styles.detailRowLabel}>Vehicle</Text>
                    </View>
                    <Text style={styles.detailRowValue}>{vehicle || tripDetails?.vehicle || 'Taxi'}</Text>
                  </View>

                  <View style={styles.cardRowDivider} />

                  <View style={styles.fullWidthDetailRow}>
                    <View style={styles.detailRowLeft}>
                      <Icon name="payment" size={16} color="#BC001F" />
                      <Text style={styles.detailRowLabel}>Fare</Text>
                    </View>
                    <Text style={styles.detailRowValue}>रू {parseFloat(actualFare).toFixed(0)}</Text>
                  </View>

                  <View style={styles.cardRowDivider} />

                  <View style={styles.fullWidthDetailRow}>
                    <View style={styles.detailRowLeft}>
                      <Icon name="location-on" size={16} color="#BC001F" />
                      <Text style={styles.detailRowLabel}>From</Text>
                    </View>
                    <Text style={styles.detailRowValue} numberOfLines={1}>
                      {from || (tripDetails?.pickUp?.address || 'P84M+MR7, Kathmandu')}
                    </Text>
                  </View>

                  <View style={styles.cardRowDivider} />

                  <View style={styles.fullWidthDetailRow}>
                    <View style={styles.detailRowLeft}>
                      <Icon name="location-on" size={16} color="#BC001F" />
                      <Text style={styles.detailRowLabel}>To</Text>
                    </View>
                    <Text style={styles.detailRowValue} numberOfLines={1}>
                      {to || (tripDetails?.dropOff?.address || 'Patan Hospital')}
                    </Text>
                  </View>
                </View>

                {/* 3. Rating & Feedback Card */}
                <View style={styles.ratingFeedbackCard}>
                  <View style={styles.cardSectionHeaderRow}>
                    <View style={styles.goldStarBadge}>
                      <Icon name="star" size={14} color="#FF9800" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.ratingTitleText}>How was your ride?</Text>
                      <Text style={styles.ratingSubtext}>
                        Rate your experience with {(driverName as string)?.split(' ')[0] || 'Vardan'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.starsRow}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <TouchableOpacity key={star} onPress={() => handleStarPress(star - 1)} style={styles.starTouch}>
                        <Icon name={rating >= star ? "star" : "star-border"} size={36} color={rating >= star ? "#FFB800" : "#C0C0C0"} />
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.feedbackInputLabel}>Share your feedback (Optional)</Text>
                  <TextInput
                    style={styles.feedbackTextInput}
                    placeholder="Tell us about your ride experience..."
                    placeholderTextColor="#9E9E9E"
                    value={feedback}
                    onChangeText={setFeedback}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />

                  <TouchableOpacity
                    style={[styles.primaryRedSubmitBtn, (submitting) && styles.driverSubmitButtonDisabled]}
                    onPress={handleSubmit}
                    disabled={submitting}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.primaryRedSubmitBtnText}>
                      {submitting ? 'Submitting...' : 'Submit Rating'}
                    </Text>
                    <Icon name="chevron-right" size={20} color="#FFFFFF" />
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.skipBtn} onPress={() => router.replace("/(tabs)")}>
                    <Text style={styles.skipBtnText}>Skip</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
            )}
        </KeyboardAvoidingView>
    </SafeAreaView>
    </ErrorBoundary>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },
  passengerScrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  passengerMainContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 4 : 12,
    gap: 14,
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  headerIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFF0F2",
    alignItems: "center",
    justifyContent: "center",
  },
  headerLogoTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#BC001F",
  },
  confettiOverlayContainer: {
    position: "absolute",
    top: 90,
    left: width / 2,
    zIndex: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  partyBumperPiece: {
    position: "absolute",
  },
  notificationDotBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#BC001F",
    borderWidth: 1.5,
    borderColor: "#FFF0F2",
  },

  /* 1. Red Hero Fare Card */
  redHeroCardCentered: {
    backgroundColor: "#BC001F",
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    shadowColor: "#BC001F",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
    overflow: "hidden",
    position: "relative",
  },
  heroArcAccent: {
    position: "absolute",
    top: -50,
    width: 300,
    height: 180,
    borderRadius: 150,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  heroCenterCheckCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  heroCenteredTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 2,
  },
  heroCenteredSubtext: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.9)",
    fontWeight: "500",
    marginBottom: 12,
  },
  whiteFarePill: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
  },
  whiteFarePillText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#BC001F",
  },
  heroCenteredFareText: {
    fontSize: 38,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 14,
  },
  heroCurrencySymbol: {
    fontSize: 24,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  whitePaymentSuccessBanner: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  whitePaymentSuccessText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1A1B1F",
  },

  /* 2. Ride Details Card */
  rideDetailsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardSectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  redHeaderBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#FFF0F2",
    alignItems: "center",
    justifyContent: "center",
  },
  goldStarBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#FFF8E7",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionHeaderTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#191C1D",
  },
  driverSubRowContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  driverAvatarContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFF0F2",
    alignItems: "center",
    justifyContent: "center",
  },
  driverNameText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#191C1D",
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF0F2",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 3,
  },
  verifiedBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#BC001F",
  },
  driverRoleSubtext: {
    fontSize: 12,
    color: "#757575",
    marginTop: 2,
  },
  cardRowDivider: {
    height: 1,
    backgroundColor: "#F5F5F5",
    marginVertical: 10,
  },
  fullWidthDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  detailRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  detailRowLabel: {
    fontSize: 13,
    color: "#757575",
    fontWeight: "500",
  },
  detailRowValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#191C1D",
  },
  ratingTitleText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#191C1D",
  },
  ratingSubtext: {
    fontSize: 12,
    color: "#757575",
    marginTop: 1,
  },

  /* 3. Rating & Feedback Card */
  ratingFeedbackCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  starsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    marginVertical: 14,
  },
  starTouch: {
    padding: 2,
  },
  feedbackInputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#191C1D",
    alignSelf: "flex-start",
    marginBottom: 6,
  },
  feedbackTextInput: {
    width: "100%",
    backgroundColor: "#F8F9FA",
    borderWidth: 1,
    borderColor: "#EAEAEA",
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    color: "#191C1D",
    minHeight: 64,
    marginBottom: 16,
    textAlignVertical: "top",
  },
  primaryRedSubmitBtn: {
    width: "100%",
    backgroundColor: "#BC001F",
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    shadowColor: "#BC001F",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  primaryRedSubmitBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
    marginRight: 4,
  },
  skipBtn: {
    paddingVertical: 4,
    alignItems: "center",
  },
  skipBtnText: {
    fontSize: 13,
    color: "#757575",
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
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 24,
  },
  earningsHeroCard: {
    backgroundColor: '#E6192E',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    marginBottom: 14,
    shadowColor: '#BC001F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  earningsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  earningsTitle: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  earningsAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginVertical: 2,
  },
  currencySymbol: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    marginRight: 3,
    opacity: 0.9,
  },
  earningsAmountText: {
    fontSize: 38,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  earningsLabelText: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: '700',
    letterSpacing: 1.2,
    marginTop: 1,
    marginBottom: 10,
  },
  earningsWalletBanner: {
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  earningsWalletText: {
    color: 'rgba(255, 255, 255, 0.95)',
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
  },
  driverSectionWrapper: {
    marginBottom: 12,
  },
  sectionHeaderLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#5F5E5E',
    letterSpacing: 0.8,
    marginBottom: 4,
    paddingLeft: 2,
  },
  driverPassengerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#EFEDF3',
  },
  driverPassengerAvatarWrapper: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFDAD7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  driverPassengerDetailsCol: {
    flex: 1,
  },
  driverPassengerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  driverPassengerName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A1B1F',
  },
  verifiedBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFDAD6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 2,
  },
  driverVerifiedBadgeText: {
    fontSize: 9,
    color: '#BC001F',
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  driverPassengerSubtext: {
    fontSize: 11,
    color: '#5F5E5E',
    marginTop: 1,
  },
  chatIconButton: {
    padding: 6,
  },
  routeCardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#EFEDF3',
  },
  timelineRowContainer: {
    flexDirection: 'row',
  },
  timelineIndicatorsCol: {
    alignItems: 'center',
    width: 16,
    marginRight: 10,
    paddingTop: 2,
  },
  pickupDotOuter: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(188, 0, 31, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickupDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#BC001F',
  },
  timelineConnectorLine: {
    width: 1.5,
    height: 24,
    backgroundColor: '#E3E2E7',
    marginVertical: 2,
  },
  dropoffSquareOuter: {
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: 'rgba(26, 27, 31, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropoffSquareInner: {
    width: 6,
    height: 6,
    borderRadius: 1,
    backgroundColor: '#1A1B1F',
  },
  timelineAddressCol: {
    flex: 1,
    gap: 10,
  },
  addressBlock: {},
  addressTypeLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#5F5E5E',
    letterSpacing: 0.8,
    marginBottom: 1,
  },
  addressText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1A1B1F',
  },
  routeDivider: {
    height: 1,
    backgroundColor: '#E3E2E7',
    marginVertical: 10,
  },
  routeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  routeMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  routeMetaText: {
    fontSize: 12,
    color: '#5F5E5E',
    fontWeight: '500',
  },
  ratingSectionWrapper: {
    alignItems: 'center',
    marginVertical: 8,
  },
  ratingSectionHeadline: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1A1B1F',
    marginBottom: 2,
  },
  ratingSectionSubtext: {
    fontSize: 12,
    color: '#5F5E5E',
    marginBottom: 10,
  },
  starRowContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
  },
  driverStarButton: {
    padding: 2,
  },
  tagsSection: {
    marginTop: 8,
    width: '100%',
  },
  tagsTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5F5E5E',
    marginBottom: 6,
  },
  tagsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagChip: {
    backgroundColor: '#F4F3F8',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E3E2E7',
  },
  tagChipActive: {
    backgroundColor: '#BC001F',
    borderColor: '#BC001F',
  },
  tagText: {
    fontSize: 11,
    color: '#1A1B1F',
    fontWeight: '500',
  },
  tagTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  commentsInputContainer: {
    width: '100%',
    marginTop: 10,
  },
  commentsLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#5F5E5E',
    letterSpacing: 0.8,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  commentsTextInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7BCB9',
    borderRadius: 12,
    padding: 10,
    fontSize: 12,
    color: '#1A1B1F',
    minHeight: 56,
  },
  actionButtonsContainer: {
    marginTop: 12,
    gap: 6,
  },
  primaryRedSubmitCTA: {
    backgroundColor: '#BC001F',
    paddingVertical: 11,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#BC001F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  primaryRedSubmitCTAText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  driverSubmitButtonDisabled: {
    backgroundColor: '#C8C6C5',
    elevation: 0,
    shadowOpacity: 0,
  },
  secondaryDashboardCTA: {
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  secondaryDashboardCTAText: {
    color: '#5F5E5E',
    fontSize: 13,
    fontWeight: '600',
  },
});

export default RideRatingScreen;
