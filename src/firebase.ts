// Firebase Web SDK bridge. The web config is intentionally public Firebase
// configuration. Server credentials/service-account keys MUST remain in Zeabur
// secrets and never be placed in VITE_* variables.

import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';

const config = {
  // Environment variables are preferred for alternate deployments; the provided
  // project is the default so a fresh Zeabur build works without extra frontend
  // configuration.
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY as string | undefined) || 'AIzaSyDFhS4Lynk-ngViadcyrrJ7WxawqKhl4Q',
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) || 'discord-46350.firebaseapp.com',
  projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined) || 'discord-46350',
  storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined) || 'discord-46350.firebasestorage.app',
  messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined) || '298665873753',
  appId: (import.meta.env.VITE_FIREBASE_APP_ID as string | undefined) || '1:298665873753:web:5a295d709da95db584bc48',
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
