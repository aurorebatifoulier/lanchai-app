import { Platform } from 'react-native';
import { getAuth, initializeAuth } from 'firebase/auth';
// getReactNativePersistence ships in the React Native build that Metro resolves
// at runtime, but the published web-facing typings for 'firebase/auth' omit it.
// @ts-expect-error — see comment above
import { getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { app } from './firebase';

// Native (iOS/Android) gets persisted auth state via AsyncStorage. Web falls
// back to the default Firebase Auth (browser) persistence, since the RN
// persistence helper isn't part of the web bundle.
export const auth = Platform.OS === 'web'
  ? getAuth(app)
  : initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
