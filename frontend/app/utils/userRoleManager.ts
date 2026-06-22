import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

class UserRoleManager {
  private role: "driver" | "passenger" = "passenger";
  private listeners: ((role: "driver" | "passenger") => void)[] = [];
  private initialized = false;
  private static STORAGE_KEY = 'userRole';

  // Call this once at app start
  async init() {
    if (this.initialized) return;
    const stored = await AsyncStorage.getItem(UserRoleManager.STORAGE_KEY);
    if (stored === 'driver' || stored === 'passenger') {
      this.role = stored;
    }
    this.initialized = true;
    this.listeners.forEach((listener) => listener(this.role));
  }

  async setRole(newRole: "driver" | "passenger") {
    this.role = newRole;
    await AsyncStorage.setItem(UserRoleManager.STORAGE_KEY, newRole);
    this.listeners.forEach((listener) => listener(newRole));
  }

  getRole(): "driver" | "passenger" {
    return this.role;
  }

  subscribe(listener: (role: "driver" | "passenger") => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
}

export const userRoleManager = new UserRoleManager();

// Helper to get the current role asynchronously (for initial load)
export async function getCurrentUserRole(): Promise<"driver" | "passenger"> {
  const stored = await AsyncStorage.getItem('userRole');
  if (stored === 'driver' || stored === 'passenger') return stored;
  return 'passenger';
}


export function useUserRole() {
  const [role, setRole] = useState(userRoleManager.getRole());
  useEffect(() => {
    const unsubscribe = userRoleManager.subscribe(setRole);
    return unsubscribe;
  }, []);
  return role;
}
