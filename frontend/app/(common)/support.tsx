"use client"

import { View, Text, TouchableOpacity, StyleSheet, Linking, SafeAreaView, StatusBar, ScrollView } from "react-native"
import Icon from "react-native-vector-icons/MaterialIcons"
import { useRouter } from "expo-router"
import Constants from 'expo-constants';

const SUPPORT_PHONE = Constants.expoConfig?.extra?.SUPPORT_PHONE;
const SUPPORT_EMAIL = Constants.expoConfig?.extra?.SUPPORT_EMAIL;
const FACEBOOK_URL = Constants.expoConfig?.extra?.FACEBOOK_URL;
const INSTAGRAM_URL = Constants.expoConfig?.extra?.INSTAGRAM_URL;
const TWITTER_URL = Constants.expoConfig?.extra?.TWITTER_URL;
const WEBSITE_URL = Constants.expoConfig?.extra?.WEBSITE_URL;

export default function Support() {
  const router = useRouter()
  const appVersion = Constants.expoConfig?.version || '1.0.0';

  const handleLinkPress = (url: string) => {
    Linking.openURL(url)
  }

  const handleCallSupport = () => {
    Linking.openURL(`tel:${SUPPORT_PHONE}`)
  }

  const socialLinks = {
    facebook: FACEBOOK_URL,
    instagram: INSTAGRAM_URL,
    gmail: `mailto:${SUPPORT_EMAIL}`,
    twitter: TWITTER_URL,
    website: WEBSITE_URL,
  }

  const supportOptions = [
    {
      id: "call",
      title: "Call Support",
      subtitle: "Speak directly with our support team",
      icon: "phone",
      color: "#4CAF50",
      action: handleCallSupport,
    },
    {
      id: "email",
      title: "Email Support",
      subtitle: "Send us your questions via email",
      icon: "email",
      color: "#FF5722",
      action: () => handleLinkPress(socialLinks.gmail),
    },
  ]

  const socialMedia = [
    {
      id: "facebook",
      name: "Facebook",
      icon: "facebook",
      color: "#1877F2",
      url: socialLinks.facebook,
    },
    {
      id: "instagram",
      name: "Instagram",
      icon: "camera-alt",
      color: "#E4405F",
      url: socialLinks.instagram,
    },
    {
      id: "twitter",
      name: "Twitter",
      icon: "alternate-email",
      color: "#1DA1F2",
      url: socialLinks.twitter,
    },
    {
      id: "website",
      name: "Website",
      icon: "language",
      color: "#075B5E",
      url: socialLinks.website,
    },
  ]

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#075B5E" />

      {/* Header */}
      <View style={styles.header}>
      <TouchableOpacity onPress={() => router.back()}  style={{
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
          marginTop: 27,
        }}>
          <Icon name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Support & Help</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Welcome Section */}
        <View style={styles.welcomeCard}>
          <View style={styles.welcomeIcon}>
            <Icon name="support-agent" size={32} color="#075B5E" />
          </View>
          <Text style={styles.welcomeTitle}>How can we help you?</Text>
          <Text style={styles.welcomeSubtitle}>
            We&apos;re here to assist you with any questions or issues you may have. Choose from the options below to get
            started.
          </Text>
        </View>

        {/* Support Options */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Get Support</Text>
          <View style={styles.optionsGrid}>
            {supportOptions.map((option) => (
              <TouchableOpacity key={option.id} style={styles.optionCard} onPress={option.action}>
                <View style={[styles.optionIcon, { backgroundColor: `${option.color}15` }]}>
                  <Icon name={option.icon} size={24} color={option.color} />
                </View>
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>{option.title}</Text>
                  <Text style={styles.optionSubtitle}>{option.subtitle}</Text>
                </View>
                <Icon name="chevron-right" size={20} color="#ccc" />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Emergency Contact */}
        <View style={styles.emergencyCard}>
          <View style={styles.emergencyHeader}>
            <Icon name="emergency" size={24} color="#f44336" />
            <Text style={styles.emergencyTitle}>Emergency Support</Text>
          </View>
          <Text style={styles.emergencyText}>
            For urgent safety concerns or emergencies during your ride, contact us immediately.
          </Text>
          <TouchableOpacity style={styles.emergencyButton} onPress={() => Linking.openURL("tel:911")}>
            <Icon name="phone" size={20} color="#fff" />
            <Text style={styles.emergencyButtonText}>Emergency Hotline</Text>
          </TouchableOpacity>
        </View>

        {/* Social Media */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Follow Us</Text>
          <Text style={styles.sectionSubtitle}>Stay connected with us on social media.</Text>
          <View style={styles.socialGrid}>
            {socialMedia.map((social) => (
              <TouchableOpacity key={social.id} style={styles.socialCard} onPress={() => handleLinkPress(social.url)}>
                <View style={[styles.socialIcon, { backgroundColor: `${social.color}15` }]}>
                  <Icon name={social.icon} size={24} color={social.color} />
                </View>
                <Text style={styles.socialName}>{social.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* App Info */}
        <View style={styles.appInfoCard}>
          <Text style={styles.appInfoTitle}>App Information</Text>
          <View style={styles.appInfoRow}>
            <Text style={styles.appInfoLabel}>Version:</Text>
            <Text style={styles.appInfoValue}>{appVersion}</Text>
          </View>
          <View style={styles.appInfoRow}>
            <Text style={styles.appInfoLabel}>Build:</Text>
            <Text style={styles.appInfoValue}>2025.06.15</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Thank you for using Saathi! We&apos;re committed to providing you with the best ride-sharing experience.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  header: {
    backgroundColor: "#f8f9fa",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  backButton: {
    padding: 8,
    marginTop: 25,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#075B5E",
    marginTop: 25,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  welcomeCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    marginBottom: 24,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  welcomeIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#f0f9ff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#333",
    marginBottom: 8,
    textAlign: "center",
  },
  welcomeSubtitle: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    lineHeight: 22,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 16,
  },
  optionsGrid: {
    gap: 12,
  },
  optionCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  optionSubtitle: {
    fontSize: 14,
    color: "#666",
  },
  emergencyCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: "#f44336",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  emergencyHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  emergencyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#f44336",
    marginLeft: 12,
  },
  emergencyText: {
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
    marginBottom: 16,
  },
  emergencyButton: {
    backgroundColor: "#f44336",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  emergencyButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 8,
  },
  socialGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  socialCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    flex: 1,
    minWidth: "45%",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  socialIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  socialName: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
  },
  appInfoCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  appInfoTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 16,
  },
  appInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  appInfoLabel: {
    fontSize: 14,
    color: "#666",
  },
  appInfoValue: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
  },
  footer: {
    backgroundColor: "#f0f9ff",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  footerText: {
    fontSize: 14,
    color: "#075B5E",
    textAlign: "center",
    lineHeight: 20,
  },
})
