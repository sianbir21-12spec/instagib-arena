// Optional Firebase bridge.
// Firebase is disabled unless FIREBASE_PROJECT_ID is configured. This keeps local
// development and existing deployments working while allowing production to use
// Firebase Auth + Firestore as a cloud identity/profile mirror.

import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID?.trim() || '';
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim() || '';
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim() || '';

export const firebaseEnabled = !!projectId;

let initialized = false;

function ensureFirebase(): void {
  if (!firebaseEnabled || initialized) return;
  if (getApps().length) {
    initialized = true;
    return;
  }

  if (clientEmail && privateKey) {
    initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
      projectId,
    });
  } else {
    // Supports Zeabur/GCP environments using Application Default Credentials.
    initializeApp({ credential: applicationDefault(), projectId });
  }
  initialized = true;
}

export async function createFirebaseToken(input: {
  uid: string;
  username: string;
  isAdmin: boolean;
}): Promise<string | null> {
  if (!firebaseEnabled) return null;
  ensureFirebase();
  const auth = getAuth();
  await auth.setCustomUserClaims(input.uid, {
    gameUsername: input.username,
    admin: input.isAdmin,
  });
  return auth.createCustomToken(input.uid, {
    gameUsername: input.username,
    admin: input.isAdmin,
  });
}

export async function syncPlayerProfile(input: {
  uid: string;
  username: string;
  isAdmin: boolean;
  level: number;
  totalXp: number;
  credits: number;
}): Promise<void> {
  if (!firebaseEnabled) return;
  ensureFirebase();
  const db = getFirestore();
  await db.collection('players').doc(input.uid).set(
    {
      username: input.username,
      isAdmin: input.isAdmin,
      level: input.level,
      totalXp: input.totalXp,
      credits: input.credits,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function recordCoinAudit(input: {
  actorId: string;
  actorName: string;
  targetId: string;
  targetName: string;
  amount: number;
  reason: string;
  balance: number;
}): Promise<void> {
  if (!firebaseEnabled) return;
  ensureFirebase();
  await getFirestore().collection('coinAudit').add({
    ...input,
    createdAt: FieldValue.serverTimestamp(),
  });
}
