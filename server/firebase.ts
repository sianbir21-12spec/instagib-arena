// Optional Firebase bridge.
// Firebase is disabled unless FIREBASE_PROJECT_ID is configured. This keeps local
// development and existing deployments working while allowing production to use
// Firebase Auth + Firestore as a cloud identity/profile mirror.

import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type UserRecord } from 'firebase-admin/auth';
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

/**
 * Firebase Auth requires a user record before custom claims can be assigned.
 * Game accounts are authoritative, so Firebase users are created lazily from
 * the stable game account id. This also makes existing accounts work without
 * requiring a separate Firebase sign-up flow.
 */
async function ensureFirebaseUser(input: {
  uid: string;
  username: string;
  isAdmin: boolean;
}): Promise<UserRecord> {
  const auth = getAuth();
  try {
    return await auth.getUser(input.uid);
  } catch (err: unknown) {
    const code = typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code)
      : '';
    if (code !== 'auth/user-not-found') throw err;

    return auth.createUser({
      uid: input.uid,
      displayName: input.username,
    });
  }
}

export async function createFirebaseToken(input: {
  uid: string;
  username: string;
  isAdmin: boolean;
}): Promise<string | null> {
  if (!firebaseEnabled) return null;
  ensureFirebase();
  const auth = getAuth();

  // Create the Firebase Auth record if this game account has never been
  // mirrored before. Without this, setCustomUserClaims throws
  // "There is no user record corresponding to the provided identifier."
  await ensureFirebaseUser(input);

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
