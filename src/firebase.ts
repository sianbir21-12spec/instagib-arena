// Firebase Web SDK bridge. Firebase Auth is the client identity layer. Firestore
// is used for non-latency-critical chat, bot profiles, voice-pack metadata and
// player state; the authoritative game server remains responsible for movement,
// shooting, hit detection and matchmaking.

import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithCustomToken, signOut, type User } from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';

const config = {
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY as string | undefined) || 'AIzaSyA7wyEIBMV8j9MohStKnzseCXOqVP8rZ00',
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) || 'fps2-c4fd3.firebaseapp.com',
  projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined) || 'fps2-c4fd3',
  storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined) || 'fps2-c4fd3.firebasestorage.app',
  messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined) || '104421879509',
  appId: (import.meta.env.VITE_FIREBASE_APP_ID as string | undefined) || '1:104421879509:web:d46548af5b436c3a44fc5c',
};

export const firebaseClientEnabled = Boolean(config.apiKey && config.projectId && config.appId);
let auth: ReturnType<typeof getAuth> | null = null;
let db: ReturnType<typeof getFirestore> | null = null;

function getFirebaseApp() {
  if (!firebaseClientEnabled) return null;
  return getApps().length ? getApp() : initializeApp(config);
}

function getFirebaseAuth() {
  const app = getFirebaseApp();
  if (!app) return null;
  auth ??= getAuth(app);
  return auth;
}

function getFirebaseDb() {
  const app = getFirebaseApp();
  if (!app) return null;
  db ??= getFirestore(app);
  return db;
}

export async function syncFirebaseSession(): Promise<void> {
  const firebaseAuth = getFirebaseAuth();
  if (!firebaseAuth) return;
  const response = await fetch('/api/auth/firebase-token', { method: 'POST', credentials: 'same-origin' });
  if (!response.ok) return;
  const data = (await response.json()) as { token?: string };
  if (data.token) await signInWithCustomToken(firebaseAuth, data.token);
}

export async function signOutFirebase(): Promise<void> {
  const firebaseAuth = getFirebaseAuth();
  if (!firebaseAuth) return;
  await signOut(firebaseAuth);
}

export function observeFirebaseUser(callback: (user: User | null) => void): Unsubscribe {
  const firebaseAuth = getFirebaseAuth();
  if (!firebaseAuth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(firebaseAuth, callback);
}

export type MatchChatMessage = {
  id: string;
  uid: string;
  username: string;
  text: string;
  bot: boolean;
  createdAt: unknown;
};

export async function sendMatchChatMessage(matchId: string, username: string, text: string, bot = false): Promise<void> {
  const firestore = getFirebaseDb();
  const user = getFirebaseAuth()?.currentUser;
  if (!firestore || !user) return;
  const cleanMatch = matchId.trim().slice(0, 80);
  const cleanText = text.trim().slice(0, 300);
  if (!cleanMatch || !cleanText) return;
  await addDoc(collection(firestore, 'matches', cleanMatch, 'chat'), {
    uid: user.uid,
    username: username.trim().slice(0, 20),
    text: cleanText,
    bot: Boolean(bot),
    createdAt: serverTimestamp(),
  });
}

export function subscribeMatchChat(matchId: string, callback: (messages: MatchChatMessage[]) => void): Unsubscribe {
  const firestore = getFirebaseDb();
  if (!firestore) {
    callback([]);
    return () => {};
  }
  const cleanMatch = matchId.trim().slice(0, 80);
  if (!cleanMatch) {
    callback([]);
    return () => {};
  }
  const q = query(
    collection(firestore, 'matches', cleanMatch, 'chat'),
    orderBy('createdAt', 'desc'),
    limit(50),
  );
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<MatchChatMessage, 'id'>) })).reverse());
  }, () => callback([]));
}

export async function saveBotProfile(input: {
  id: string;
  name: string;
  difficulty: string;
  persona: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const firestore = getFirebaseDb();
  if (!firestore) return;
  const id = input.id.trim().slice(0, 80);
  if (!id) return;
  await setDoc(doc(firestore, 'botProfiles', id), {
    name: input.name.trim().slice(0, 40),
    difficulty: input.difficulty.slice(0, 20),
    persona: input.persona.slice(0, 40),
    metadata: input.metadata ?? {},
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export type VoicePack = {
  id: string;
  name: string;
  blurb: string;
  storagePath?: string;
  variants?: Record<string, number>;
};

export function subscribeVoicePacks(callback: (packs: VoicePack[]) => void): Unsubscribe {
  const firestore = getFirebaseDb();
  if (!firestore) {
    callback([]);
    return () => {};
  }
  const q = query(collection(firestore, 'voicePacks'), orderBy('name'), limit(50));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<VoicePack, 'id'>) })));
  }, () => callback([]));
}

export async function syncPlayerState(input: {
  level: number;
  totalXp: number;
  credits: number;
  unlocked: string[];
  equipped: Record<string, string>;
  stats: Record<string, unknown>;
}): Promise<void> {
  const firestore = getFirebaseDb();
  const user = getFirebaseAuth()?.currentUser;
  if (!firestore || !user) return;
  await setDoc(doc(firestore, 'players', user.uid), {
    level: input.level,
    totalXp: input.totalXp,
    credits: input.credits,
    inventory: { unlocked: input.unlocked, equipped: input.equipped },
    stats: input.stats,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}
