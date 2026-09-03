import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase, limitToLast, onValue, orderByChild, query, ref, type Unsubscribe } from 'firebase/database';

const projectId = (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined) || 'fps2-c4fd3';
const config = {
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY as string | undefined) || 'AIzaSyA7wyEIBMV8j9MohStKnzseCXOqVP8rZ00',
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) || 'fps2-c4fd3.firebaseapp.com',
  projectId,
  storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined) || 'fps2-c4fd3.firebasestorage.app',
  messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined) || '104421879509',
  appId: (import.meta.env.VITE_FIREBASE_APP_ID as string | undefined) || '1:104421879509:web:d46548af5b436c3a44fc5c',
};
const databaseURL = (import.meta.env.VITE_FIREBASE_DATABASE_URL as string | undefined)?.trim()
  || `https://${projectId}-default-rtdb.firebaseio.com`;

function database() {
  const app = getApps().length ? getApp() : initializeApp(config);
  return getDatabase(app, databaseURL);
}

export type SharedChatMessage = {
  id: string;
  uid: string;
  username: string;
  text: string;
  bot: boolean;
  persona?: string | null;
  createdAt: number;
};

export function subscribeSharedChat(matchId: string, callback: (messages: SharedChatMessage[]) => void): Unsubscribe {
  const auth = getAuth(getApps().length ? getApp() : initializeApp(config));
  if (!auth.currentUser) { callback([]); return () => {}; }
  const safeMatch = matchId.trim().slice(0, 80) || 'lobby';
  const chatRef = query(ref(database(), `matches/${safeMatch}/chat`), orderByChild('createdAt'), limitToLast(50));
  return onValue(chatRef, (snapshot) => {
    const messages: SharedChatMessage[] = [];
    snapshot.forEach((child) => {
      const value = child.val() as Omit<SharedChatMessage, 'id'>;
      if (value && typeof value.text === 'string') messages.push({ id: child.key ?? '', ...value });
      return false;
    });
    callback(messages);
  }, () => callback([]));
}
