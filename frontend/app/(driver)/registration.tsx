import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronRight, Check } from 'lucide-react-native';

const Registration = () => {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { vehicle } = params;
  const [completedSteps, setCompletedSteps] = useState(['registerSelfie']);

  const handleClose = () => {
    router.push('/');
  };

  const handleStepPress = (step: string) => {
    const routes = {
      basic: '/(regSteps)/basicProfile',
      license: '/(regSteps)/driverLicense',
      selfie: '/(regSteps)/registerSelfie',
      vehicle: '/(regSteps)/vehicleInfo',
    };
    router.push(routes[step as keyof typeof routes] as any);
  };

  const handleDone = () => {
    router.push('/(tabs)');
  };

  const steps = [
    { id: 'basic', name: 'Basic info', completed: completedSteps.includes('basicProfile') },
    { id: 'license', name: 'Driver licence', completed: completedSteps.includes('driverLicense') },
    { id: 'selfie', name: 'Selfie with ID', completed: completedSteps.includes('registerSelfie') },
    { id: 'vehicle', name: 'Vehicle Info', completed: completedSteps.includes('vehicleInfo') },
  ];

  const allCompleted = steps.every(step => step.completed);

  useEffect(() => {
    if (params.completed) {
      setCompletedSteps(prev => [...new Set([...prev, params.completed as string])]);
    }
  }, [params.completed]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f5f5f5" />
      <View style={styles.header}>
        <Text style={styles.title}>Registration</Text>
        <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
          <Text style={styles.closeText}>Close</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.stepsContainer}>
          {steps.map((step, index) => (
            <TouchableOpacity
              key={step.id}
              style={[styles.stepItem, index === steps.length - 1 && styles.lastStepItem]}
              onPress={() => handleStepPress(step.id)}
            >
              <View style={styles.stepContent}>
                <Text style={styles.stepName}>{step.name}</Text>
                <View style={styles.stepActions}>
                  <ChevronRight size={20} color="#4CAF50" />
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          style={[styles.doneButton, !allCompleted && styles.doneButtonDisabled]}
          onPress={handleDone}
          disabled={!allCompleted}
        >
          <Text style={[styles.doneButtonText, !allCompleted && styles.doneButtonTextDisabled]}>
            Done
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginTop: 30,
  },
  closeButton: { paddingHorizontal: 8, paddingVertical: 4, marginTop: 30 },
  closeText: { fontSize: 16, color: '#333', fontWeight: '500' },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },
  stepsContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  stepItem: { borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  lastStepItem: { borderBottomWidth: 0 },
  stepContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  stepName: { fontSize: 16, color: '#333', fontWeight: '500' },
  stepActions: { flexDirection: 'row', alignItems: 'center' },
  doneButton: {
    backgroundColor: '#075B5E',
    borderRadius: 25,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  doneButtonDisabled: { backgroundColor: '#ccc' },
  doneButtonText: { fontSize: 18, fontWeight: '600', color: '#fff' },
  doneButtonTextDisabled: { color: '#999' },
});

export default Registration;