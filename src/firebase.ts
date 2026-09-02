// Firebase Web SDK bridge. All values are public Firebase web config values;
// secrets/service-account credentials never belong in VITE_* variables.

import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

export const firebaseClientEnabled = Boolean(config.apiKey && config.projectId && config.appId);

let auth: ReturnType<typeof getAuth> | null = null;

function getFirebaseAuth() {
  if (!firebaseClientEnabled) return null;
  const app = getApps().length ? getApp() : initializeApp(config);
  auth ??= getAuth(app);
  return auth;
}

export async function syncFirebaseSession(): Promise<void> {
  const firebaseAuth = getFirebaseAuth();
  if (!firebaseAuth) return;
  const response = await fetch('/api/auth/firebase-token', {
    method: 'POST',
    credentials: 'same-origin',
  });
  if (!response.ok) return;
  const data = (await response.json()) as { token?: string };
  if (data.token) await signInWithCustomToken(firebaseAuth, data.token);
}

export async function signOutFirebase(): Promise<void> {
  const firebaseAuth = getFirebaseAuth();
  if (!firebaseAuth) return;
  await signOut(firebaseAuth);
}
