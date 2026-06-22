"use client"

import React, { useState } from "react"
import {
  View,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
} from "react-native"
import { useRouter } from "expo-router"
import { useSearchParams } from "expo-router/build/hooks"
import Icon from "react-native-vector-icons/MaterialIcons"
import apiClient from "../utils/apiClient"
import ConfirmationModal from "../../components/ui/ConfirmationModal"
import AsyncStorage from "@react-native-async-storage/async-storage"

const SetupScreen = () => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const source = searchParams.get("source")
  const verified = searchParams.get("verified") === "true"

  const [name, setName] = useState(source === "google" ? "John Doe" : "")
  const [email, setEmail] = useState(source === "google" ? "john.doe@gmail.com" : "")
  const [phone, setPhone] = useState(source === "phone" ? "+977 9876543210" : "+977 ")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showBackConfirmation, setShowBackConfirmation] = useState(false)

  const [nameFocused, setNameFocused] = useState(false)
  const [emailFocused, setEmailFocused] = useState(false)
  const [phoneFocused, setPhoneFocused] = useState(false)

  const handleNext = async () => {
    setLoading(true)
    setError(null)
    try {
      if (source === "phone") {
        const response = await apiClient.post('/auth/register', { name, email, phone });
        if (response.data.statusCode === 201) {
          await AsyncStorage.setItem('userRole', 'passenger');
          router.replace("/(tabs)")
        }
      } else if (source === "google" && !verified) {
        const response = await apiClient.post('/auth/register', { name, email, phone });
        if (response.data.statusCode === 201) {
          await AsyncStorage.setItem('userRole', 'passenger');
          router.push({
            pathname: "/(auth)/verify",
            params: { phone, name, email, source: "google" },
          })
        }
      } else if (source === "google" && verified) {
        const response = await apiClient.patch('/me', { name, email, phone });
        if (response.data.statusCode === 200) {
          await AsyncStorage.setItem('userRole', 'passenger');
          router.replace("/(tabs)")
        }
      }
    } catch (err) {
      setError('Failed to save profile. Please try again.');
      console.error(err);
    } finally {
      setLoading(false)
    }
  }

  const handleBackPress = () => {
    if (loading) {
      setShowBackConfirmation(true);
    } else {
      router.back();
    }
  };

  const handleConfirmBack = () => {
    setShowBackConfirmation(false);
    router.back();
  };

  const handleCancelBack = () => {
    setShowBackConfirmation(false);
  };

  const getTitle = () => {
    if (source === "google" && verified) return "Welcome to Saathi!"
    else if (source === "google") return "Complete your profile"
    else return "Set up your account"
  }

  const getButtonText = () => {
    if (source === "google" && verified) return "Get Started"
    else if (source === "google") return "Verify Phone"
    else return "Next"
  }

  const getHelpText = () => {
    if (source === "google" && verified) return "Your account is ready! Tap 'Get Started' to begin using Saathi."
    else if (source === "google") return "We'll send you a verification code to confirm your phone number"
    else return "We'll verify your information in the next step"
  }

  const isFormValid = () => {
    if (source === "phone") return name.trim() && email.trim() && phone.trim()
    else if (source === "google" && !verified) return phone.trim() && phone.length > 5
    else if (source === "google" && verified) return true
    return false
  }

  if (source === "google" && verified) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
        <View style={styles.successContainer}>
          <View style={styles.successIcon}>
            <Icon name="check-circle" size={80} color="#4CAF50" />
          </View>
          <Text style={styles.successTitle}>Account Setup Complete!</Text>
          <Text style={styles.successSubtitle}>Welcome to Saathi, you're all set to start riding.</Text>
          <View style={styles.verifiedInfoContainer}>
            <View style={styles.verifiedItem}>
              <Icon name="person" size={20} color="#075B5E" />
              <Text style={styles.verifiedText}>{name}</Text>
              <View style={styles.verifiedBadge}>
                <Icon name="verified" size={16} color="#4CAF50" />
              </View>
            </View>
            <View style={styles.verifiedItem}>
              <Icon name="email" size={20} color="#075B5E" />
              <Text style={styles.verifiedText}>{email}</Text>
              <View style={styles.verifiedBadge}>
                <Icon name="verified" size={16} color="#4CAF50" />
              </View>
            </View>
            <View style={styles.verifiedItem}>
              <Icon name="phone" size={20} color="#075B5E" />
              <Text style={styles.verifiedText}>{phone}</Text>
              <View style={styles.verifiedBadge}>
                <Icon name="verified" size={16} color="#4CAF50" />
              </View>
            </View>
          </View>
          <TouchableOpacity style={styles.getStartedButton} onPress={handleNext}>
            <Text style={styles.getStartedButtonText}>Get Started</Text>
            <Icon name="arrow-forward" size={20} color="#fff" style={styles.buttonIcon} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <TouchableOpacity onPress={handleBackPress} style={{
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
          marginTop: 40,
        }}>
          <Icon name="arrow-back" size={24} color="#fff" />
      </TouchableOpacity>
      <View style={styles.contentContainer}>
        <Text style={styles.title}>{getTitle()}</Text>
        <TouchableOpacity style={styles.profileImageContainer}>
          <View style={styles.profilePlaceholder}>
            <Icon name="person" size={40} color="#999" />
          </View>
          <View style={styles.cameraIcon}>
            <Icon name="camera-alt" size={16} color="#fff" />
          </View>
        </TouchableOpacity>
        <View style={styles.inputContainer}>
          <TextInput
            style={[styles.input, nameFocused && styles.inputFocused, source === "google" && styles.inputPrefilled, loading && styles.inputDisabled]}
            value={name}
            onChangeText={setName}
            placeholder="Enter your Name"
            placeholderTextColor="#ccc"
            editable={source !== "google" && !loading}
            onFocus={() => setNameFocused(true)}
            onBlur={() => setNameFocused(false)}
          />
        </View>
        <View style={styles.inputContainer}>
          <TextInput
            style={[styles.input, emailFocused && styles.inputFocused, source === "google" && styles.inputPrefilled, loading && styles.inputDisabled]}
            value={email}
            onChangeText={setEmail}
            placeholder="Enter your Email"
            placeholderTextColor="#ccc"
            keyboardType="email-address"
            editable={source !== "google" && !loading}
            onFocus={() => setEmailFocused(true)}
            onBlur={() => setEmailFocused(false)}
          />
        </View>
        <View style={styles.inputContainer}>
          <TextInput
            style={[styles.input, phoneFocused && styles.inputFocused, source === "phone" && styles.inputPrefilled, loading && styles.inputDisabled]}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="Enter your Phone Number"
            placeholderTextColor="#ccc"
            editable={source !== "phone" && !loading}
            autoFocus={source === "google" && !verified}
            onFocus={() => setPhoneFocused(true)}
            onBlur={() => setPhoneFocused(false)}
          />
        </View>
        {error && <Text style={styles.error}>{error}</Text>}
        <TouchableOpacity
          style={[styles.button, (!isFormValid() || loading) && styles.buttonDisabled]}
          onPress={handleNext}
          disabled={!isFormValid() || loading}
        >
          <View style={styles.buttonContent}>
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.buttonText}>{getButtonText()}</Text>
            )}
          </View>
        </TouchableOpacity>
        <Text style={styles.helpText}>{getHelpText()}</Text>
      </View>
      <View style={styles.keyboardPlaceholder} />

      <ConfirmationModal
        visible={showBackConfirmation}
        title="Cancel Setup?"
        message="Are you sure you want to cancel account setup?"
        confirmText="Cancel"
        cancelText="Continue"
        onConfirm={handleConfirmBack}
        onCancel={handleCancelBack}
        type="warning"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", paddingHorizontal: 16 },
  contentContainer: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 20 },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 32, textAlign: "center", color: "#333" },
  profileImageContainer: { width: 100, height: 100, borderRadius: 50, marginBottom: 32, position: "relative" },
  profilePlaceholder: { width: "100%", height: "100%", borderRadius: 50, backgroundColor: "#f0f0f0", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#e0e0e0" },
  cameraIcon: { position: "absolute", bottom: 0, right: 0, width: 32, height: 32, borderRadius: 16, backgroundColor: "#075B5E", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#fff" },
  inputContainer: { width: "100%", marginBottom: 16 },
  input: { width: "100%", height: 48, borderWidth: 1, borderColor: "#ccc", borderRadius: 8, paddingHorizontal: 10, color: "#000", fontSize: 16 },
  inputFocused: { borderColor: "#075B5E", borderWidth: 2 },
  inputPrefilled: { backgroundColor: "#f8f9fa", color: "#666" },
  inputDisabled: { backgroundColor: "#f5f5f5", color: "#999" },
  button: { width: "100%", backgroundColor: "#075B5E", borderRadius: 12, padding: 16, alignItems: "center" },
  buttonDisabled: { backgroundColor: "#ccc" },
  buttonContent: { flexDirection: "row", alignItems: "center" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  helpText: { fontSize: 14, color: "#666", textAlign: "center", marginTop: 16, lineHeight: 20 },
  error: { color: "#F44336", fontSize: 14, textAlign: "center", marginTop: 8 },
  keyboardPlaceholder: { height: 200 },
  successContainer: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 20 },
  successIcon: { marginBottom: 24 },
  successTitle: { fontSize: 24, fontWeight: "700", marginBottom: 12, textAlign: "center", color: "#333" },
  successSubtitle: { fontSize: 16, color: "#666", textAlign: "center", marginBottom: 32, lineHeight: 22 },
  verifiedInfoContainer: { width: "100%", marginBottom: 32 },
  verifiedItem: { flexDirection: "row", alignItems: "center", backgroundColor: "#f8f9fa", padding: 16, borderRadius: 8, marginBottom: 12 },
  verifiedText: { flex: 1, fontSize: 16, color: "#333", marginLeft: 12 },
  verifiedBadge: { marginLeft: 8 },
  getStartedButton: { flexDirection: "row", alignItems: "center", backgroundColor: "#075B5E", paddingHorizontal: 24, paddingVertical: 16, borderRadius: 12 },
  getStartedButtonText: { color: "#fff", fontSize: 18, fontWeight: "600", marginRight: 8 },
  buttonIcon: { marginLeft: 4 },

})

export default SetupScreen