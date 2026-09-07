import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Tokens live in the device keychain / keystore on native.
 * Web falls back to AsyncStorage because SecureStore has no web backend.
 */
const nativeAvailable = Platform.OS !== 'web';

export const storage = {
  async get(key) {
    try {
      if (nativeAvailable) return await SecureStore.getItemAsync(key);
      return await AsyncStorage.getItem(key);
    } catch (_) {
      return null;
    }
  },
  async set(key, value) {
    try {
      if (nativeAvailable) return await SecureStore.setItemAsync(key, value);
      return await AsyncStorage.setItem(key, value);
    } catch (_) {
      /* storage is best effort */
    }
  },
  async remove(key) {
    try {
      if (nativeAvailable) return await SecureStore.deleteItemAsync(key);
      return await AsyncStorage.removeItem(key);
    } catch (_) {
      /* ignore */
    }
  },
};
