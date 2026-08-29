import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getAnalytics, isSupported as analyticsSupported } from 'firebase/analytics';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCG0cwStBmAirshkqHIWXztz_1bwZQZrc',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'zelloo-440f3.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'zelloo-440f3',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'zelloo-440f3.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '712583135545',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:712583135545:web:a02181400f93510450e8e8',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-R6RLQGT4QF',
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(config);
export const firebaseAuth = getAuth(firebaseApp);
export const firestore = getFirestore(firebaseApp);

export const firebaseAnalytics = analyticsSupported()
  .then((supported) => supported ? getAnalytics(firebaseApp) : null)
  .catch(() => null);
