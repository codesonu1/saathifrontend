import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface DriverBottomNavProps {
  activeTab: 'home' | 'activity' | 'earnings' | 'account';
  onEarningsPress?: () => void;
}

const DriverBottomNav: React.FC<DriverBottomNavProps> = ({ activeTab, onEarningsPress }) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomPadding = insets.bottom > 0 ? insets.bottom : 6;
  const navHeight = 56 + bottomPadding;

  const handleTabPress = (tab: 'home' | 'activity' | 'earnings' | 'account') => {
    if (tab === activeTab) return;

    if (tab === 'home') {
      router.push('/(driver)/driverSection' as any);
    } else if (tab === 'activity') {
      router.push('/(common)/rideHistory' as any);
    } else if (tab === 'earnings') {
      if (onEarningsPress) {
        onEarningsPress();
      } else {
        router.push('/(driver)/earnings' as any);
      }
    } else if (tab === 'account') {
      router.push('/(driver)/driverProfile' as any);
    }
  };

  return (
    <View style={[styles.navContainer, { height: navHeight, paddingBottom: bottomPadding }]}>
      {/* Home Tab */}
      <TouchableOpacity
        style={styles.navItem}
        onPress={() => handleTabPress('home')}
        activeOpacity={0.75}
      >
        <MaterialIcons
          name="home"
          size={24}
          color={activeTab === 'home' ? '#BC001F' : '#5F5E5E'}
        />
        <Text style={[styles.navLabel, activeTab === 'home' && styles.activeNavLabel]}>
          Home
        </Text>
      </TouchableOpacity>

      {/* Activity Tab */}
      <TouchableOpacity
        style={styles.navItem}
        onPress={() => handleTabPress('activity')}
        activeOpacity={0.75}
      >
        <MaterialIcons
          name="history"
          size={24}
          color={activeTab === 'activity' ? '#BC001F' : '#5F5E5E'}
        />
        <Text style={[styles.navLabel, activeTab === 'activity' && styles.activeNavLabel]}>
          Activity
        </Text>
      </TouchableOpacity>

      {/* Earnings Tab */}
      <TouchableOpacity
        style={styles.navItem}
        onPress={() => handleTabPress('earnings')}
        activeOpacity={0.75}
      >
        <MaterialIcons
          name="account-balance-wallet"
          size={24}
          color={activeTab === 'earnings' ? '#BC001F' : '#5F5E5E'}
        />
        <Text style={[styles.navLabel, activeTab === 'earnings' && styles.activeNavLabel]}>
          Earnings
        </Text>
      </TouchableOpacity>

      {/* Account Tab */}
      <TouchableOpacity
        style={styles.navItem}
        onPress={() => handleTabPress('account')}
        activeOpacity={0.75}
      >
        <MaterialIcons
          name="person"
          size={24}
          color={activeTab === 'account' ? '#BC001F' : '#5F5E5E'}
        />
        <Text style={[styles.navLabel, activeTab === 'account' && styles.activeNavLabel]}>
          Account
        </Text>
      </TouchableOpacity>
    </View>
  );
};

export default DriverBottomNav;

const styles = StyleSheet.create({
  navContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: Platform.OS === 'ios' ? 76 : 64,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderTopColor: '#EFEDF3',
    paddingBottom: Platform.OS === 'ios' ? 16 : 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 999,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  navLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5F5E5E',
    marginTop: 2,
  },
  activeNavLabel: {
    color: '#BC001F',
    fontWeight: '700',
  },
});
