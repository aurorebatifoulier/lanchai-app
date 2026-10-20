import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

// Firebase Web SDK config is not a secret by design — access control happens via
// Firestore/Storage security rules, not by hiding this config. It's still sourced
// from env vars (rather than hardcoded) so EAS Build's cloud archive — which only
// includes git-tracked files — can resolve it via EAS environment variables,
// without this file needing to carry literal values. Local values live in
// .env.local (gitignored, untouched by this change).
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const db = getFirestore(app);
export const storage = getStorage(app);
// Callable Cloud Functions live in asia-southeast1 (same region as everything else) —
// always call them through this instance, never the default us-central1 one.
export const functions = getFunctions(app, 'asia-southeast1');
