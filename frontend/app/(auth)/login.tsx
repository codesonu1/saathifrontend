import React from 'react';
import { View, StyleSheet, Text, Image } from 'react-native';
import { Button } from 'react-native-paper';
import { useRouter } from 'expo-router';
import Icon from 'react-native-vector-icons/FontAwesome';
import { clearAccessToken } from '../utils/apiClient';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LoginScreen = () => {
  const router = useRouter();

  const handlePLogin = () => {
    router.push('/(auth)/phoneLogin'); 
  };

  const handleGLogin = () => {
    router.push('/(auth)/setup?source=google');
  };

  return (
    <View style={styles.container}>
      <View style={styles.contentContainer}>
        <View style={styles.imageContainer}>
          <Image
            source={require('../../assets/images/login.jpg')}
            style={styles.image}
            resizeMode="contain"
          />
        </View>
        <Text style={styles.title}>Your app for safe ride</Text>
        <Text style={styles.subtitle}>Rides that feels like friendship</Text>
      </View>

      <View style={styles.buttonContainer}>
        <Button 
          mode="contained" 
          style={styles.button} 
          onPress={handlePLogin}
          contentStyle={styles.buttonContent}
          icon={() => <Icon name="phone" size={20} color="#000"/>}
        >
          Continue with phone
        </Button>
        
        <Button 
          mode="outlined" 
          style={styles.googleButton} 
          onPress={handleGLogin}
          contentStyle={styles.buttonContent}
          icon={() => <Icon name="google" size={20} color="#000"/>}
        >
          <Text style={styles.googleButtonText}>Continue with Google</Text>
        </Button>
        
        <Text style={styles.terms}>
          Joining our app means you agree with our Terms of Use and Privacy Policy. Welcome onboard!
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  imageContainer: {
    width: '100%',
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  image: {
    width: '100%',
    height: '90%',
  },
  title: {
    fontSize: 25,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
    color: '#333',
  },
  subtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  buttonContainer: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    paddingTop: 20,
  },
  button: {
    width: '100%',
    backgroundColor: '#00809D',
    marginBottom: 12,
    borderRadius: 12,
  },
  googleButton: {
    width: '100%',
    borderColor: '#dadce0',
    borderWidth: 1,
    marginBottom: 20,
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  googleButtonText: {
    fontWeight: '400',
    color: "#075B5E",
  },
  buttonContent: {
    height: 48,
  },
  terms: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 20,
  },
});

export default LoginScreen;

export async function logoutAndResetNavigation(router: any) {
  await clearAccessToken();
  await AsyncStorage.removeItem('userRole');
  router.replace('/login');
}

