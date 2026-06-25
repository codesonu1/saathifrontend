"use client"

import type React from "react"
import { useRef, useEffect } from "react"
import { View, Text, TouchableOpacity, StyleSheet, Animated, Dimensions } from "react-native"
import Icon from "react-native-vector-icons/MaterialIcons"
import { useRouter } from "expo-router"
import { userRoleManager } from '../utils/userRoleManager';
import webSocketService from '../utils/websocketService';
import { logoutAndResetNavigation } from '../(auth)/login';

const { width, height: screenHeight } = Dimensions.get("window")

type SidePanelProps = {
  visible: boolean
  onClose: () => void
  role: "driver" | "passenger"
  rideInProgress: boolean
  onChangeRole: (role: "driver" | "passenger") => void
  activeItem?: string
}

const SidePanel: React.FC<SidePanelProps> = ({ visible, onClose, role, rideInProgress, onChangeRole, activeItem = "home" }) => {
  const slideAnim = useRef(new Animated.Value(-width * 0.75)).current
  const router = useRouter()

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: visible ? 0 : -width * 0.75,
      duration: 300,
      useNativeDriver: true,
    }).start()
  }, [visible, slideAnim])

  const navigateToProfile = () => {
    router.push("/profile")
    onClose()
  }

  const navigateToRideHistory = () => {
    router.push("/rideHistory")
    onClose()
  }

  const navigateToSupport = () => {
    router.push("/support")
    onClose()
  }

  const navigateToDriverSection = () => {
    router.push("/driverSection")
    onClose()
  }

  const navigateToNotifications = () => {
    router.push("/notifications")
    onClose()
  }

  const handleLogout = async () => {
    await logoutAndResetNavigation(router);
    onClose();
  }

  const handleChangeRole = async () => {
    if (!rideInProgress) {
      const newRole = role === "driver" ? "passenger" : "driver";
      await userRoleManager.setRole(newRole);
      webSocketService.disconnect('driver');
      webSocketService.disconnect('passenger');
      webSocketService.disconnect('ride');
      if (newRole === "driver") {
        router.push("/(driver)");
      } else {
        router.push("/(tabs)");
      }
      onClose();
    } else {
      alert("Cannot change role during an active ride.");
    }
  };

  const menuItems =
    role === "driver"
      ? [
          { id: "home", name: "Home", icon: "home", action: onClose },
          { id: "map", name: "Map", icon: "map", action: navigateToDriverSection },
          { id: "profile", name: "Profile", icon: "person-4", action: navigateToProfile },
          { id: "history", name: "Ride History", icon: "directions-car", action: navigateToRideHistory },
          { id: "support", name: "Support", icon: "contact-support", action: navigateToSupport },
          { id: "notifications", name: "Notifications", icon: "notifications", action: navigateToNotifications },
        ]
      : [
          { id: "home", name: "Home", icon: "home", action: onClose },
          { id: "history", name: "Trip History", icon: "directions-car", action: navigateToRideHistory },
          { id: "profile", name: "Profile", icon: "person-4", action: navigateToProfile },
          { id: "notifications", name: "Notifications", icon: "notifications", action: navigateToNotifications },
          { id: "support", name: "Support", icon: "contact-support", action: navigateToSupport },
        ]

  if (!visible) return null

  return (
    <View style={styles.modalOverlay}>
      <TouchableOpacity style={styles.modalBackground} onPress={onClose} />
      <Animated.View style={[styles.sidePanel, { transform: [{ translateX: slideAnim }] }]}>
        <View style={styles.sidePanelHeader}>
          <Text style={styles.sidePanelTitle}>Menu</Text>
          <TouchableOpacity onPress={onClose}>
            <Icon name="close" size={24} color="#333" />
          </TouchableOpacity>
        </View>

        <View style={styles.menuItems}>
          {menuItems.map((item) => {
            const isActive = item.id === activeItem;
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.menuItem, isActive && styles.activeMenuItem]}
                onPress={item.action}
              >
                <Icon name={item.icon} size={24} color={isActive ? "#075B5E" : "#333"} />
                <Text style={[styles.menuText, isActive && styles.activeMenuText]}>{item.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.bottomButtons}>
          <TouchableOpacity
            style={[styles.roleButton, rideInProgress && styles.buttonDisabled]}
            onPress={handleChangeRole}
            disabled={rideInProgress}
          >
            <Text style={styles.buttonText}>{role === "driver" ? "Switch to Passenger" : "Switch to Driver"}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Icon name="logout" size={24} color="#f44336" />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: screenHeight,
    flexDirection: "row",
    justifyContent: "flex-start",
    zIndex: 10000,
    elevation: 100,
  },
  modalBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  sidePanel: {
    width: width * 0.75,
    backgroundColor: "#fff",
    height: screenHeight,
    paddingTop: 50,
  },
  sidePanelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  sidePanelTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#333",
  },
  menuItems: {
    paddingTop: 20,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderLeftWidth: 4,
    borderLeftColor: "transparent",
  },
  activeMenuItem: {
    backgroundColor: "#e6f2f2",
    borderLeftColor: "#075B5E",
  },
  activeMenuText: {
    color: "#075B5E",
    fontWeight: "600",
  },
  bottomButtons: {
    position: "absolute",
    bottom: 30,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
    paddingTop: 20,
  },
  roleButton: {
    backgroundColor: "#075B5E",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 10,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  logoutText: {
    color: "#f44336",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  menuText: {
    fontSize: 16,
    color: "#333",
    marginLeft: 16,
  },
})

export default SidePanel
