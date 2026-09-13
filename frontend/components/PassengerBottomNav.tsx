import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface PassengerBottomNavProps {
  activeTab: 'home' | 'history' | 'notifications' | 'profile';
}

const PassengerBottomNav: React.FC<PassengerBottomNavProps> = ({ activeTab }) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleTabPress = (tab: 'home' | 'history' | 'notifications' | 'profile') => {
    if (tab === activeTab) return;

    if (tab === 'home') {
      router.push('/(tabs)' as any);
    } else if (tab === 'history') {
      router.push('/(common)/rideHistory' as any);
    } else if (tab === 'notifications') {
      router.push('/(common)/notifications' as any);
    } else if (tab === 'profile') {
      router.push('/(common)/profile' as any);
    }
  };

  return (
    <View style={[styles.bottomTabBar, { paddingBottom: Math.max(insets.bottom > 0 ? insets.bottom : 10, Platform.OS === 'ios' ? 20 : 10) }]}>
      {/* Home Tab */}
      {activeTab === 'home' ? (
        <TouchableOpacity style={styles.activeTabItem} activeOpacity={0.85}>
          <Ionicons name="home" size={18} color="#FFFFFF" />
          <Text style={styles.activeTabText}>Home</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => handleTabPress('home')}
          activeOpacity={0.75}
        >
          <Ionicons name="home-outline" size={20} color="#5B403F" />
          <Text style={styles.tabText}>Home</Text>
        </TouchableOpacity>
      )}

      {/* History Tab */}
      {activeTab === 'history' ? (
        <TouchableOpacity style={styles.activeTabItem} activeOpacity={0.85}>
          <Ionicons name="time" size={18} color="#FFFFFF" />
          <Text style={styles.activeTabText}>History</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => handleTabPress('history')}
          activeOpacity={0.75}
        >
          <Ionicons name="time-outline" size={20} color="#5B403F" />
          <Text style={styles.tabText}>History</Text>
        </TouchableOpacity>
      )}

      {/* Notifications Tab */}
      {activeTab === 'notifications' ? (
        <TouchableOpacity style={styles.activeTabItem} activeOpacity={0.85}>
          <Ionicons name="notifications" size={18} color="#FFFFFF" />
          <Text style={styles.activeTabText}>Notifications</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => handleTabPress('notifications')}
          activeOpacity={0.75}
        >
          <Ionicons name="notifications-outline" size={20} color="#5B403F" />
          <Text style={styles.tabText}>Notifications</Text>
        </TouchableOpacity>
      )}

      {/* Profile Tab */}
      {activeTab === 'profile' ? (
        <TouchableOpacity style={styles.activeTabItem} activeOpacity={0.85}>
          <Ionicons name="person" size={18} color="#FFFFFF" />
          <Text style={styles.activeTabText}>Profile</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => handleTabPress('profile')}
          activeOpacity={0.75}
        >
          <Ionicons name="person-outline" size={20} color="#5B403F" />
          <Text style={styles.tabText}>Profile</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

export default PassengerBottomNav;

const styles = StyleSheet.create({
  bottomTabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: Platform.OS === 'ios' ? 78 : 70,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: '#EFEFEF',
    zIndex: 1000,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  activeTabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#B7102A',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    gap: 6,
  },
  activeTabText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  tabText: {
    color: '#5B403F',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
});
