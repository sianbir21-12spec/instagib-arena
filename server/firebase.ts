import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken, type UserRecord } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type Firestore, type Transaction } from 'firebase-admin/firestore';
import type { Request } from 'express';

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
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId });
  } else {
    initializeApp({ credential: applicationDefault(), projectId });
  }
  initialized = true;
}

function firestore(): Firestore {
  ensureFirebase();
  return getFirestore();
}

async function ensureFirebaseUser(input: { uid: string; username: string }): Promise<UserRecord> {
  const auth = getAuth();
  try {
    return await auth.getUser(input.uid);
  } catch (err: unknown) {
    const code = typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code)
      : '';
    if (code !== 'auth/user-not-found') throw err;
    return auth.createUser({ uid: input.uid, displayName: input.username });
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

export async function verifyFirebaseRequest(req: Request): Promise<DecodedIdToken | null> {
  if (!firebaseEnabled) return null;
  const header = req.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  try {
    ensureFirebase();
    return await getAuth().verifyIdToken(header.slice(7).trim(), true);
  } catch {
    return null;
  }
}

export async function requireFirebaseAdmin(req: Request): Promise<DecodedIdToken | null> {
  const token = await verifyFirebaseRequest(req);
  return token?.admin === true ? token : null;
}

export async function syncPlayerProfile(input: {
  uid: string;
  username: string;
  isAdmin: boolean;
  level: number;
  totalXp: number;
  credits: number;
  stats?: Record<string, unknown>;
  inventory?: Record<string, unknown>;
}): Promise<void> {
  if (!firebaseEnabled) return;
  await firestore().collection('players').doc(input.uid).set({
    username: input.username,
    usernameLower: input.username.toLowerCase(),
    isAdmin: input.isAdmin,
    level: input.level,
    totalXp: input.totalXp,
    credits: input.credits,
    stats: input.stats ?? {},
    inventory: input.inventory ?? {},
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

export async function getFirebaseCoins(uid: string): Promise<number> {
  if (!firebaseEnabled) return 0;
  const snap = await firestore().collection('players').doc(uid).get();
  return Number(snap.get('credits') ?? 0);
}

export async function grantFirebaseCoins(input: {
  uid: string;
  username: string;
  amount: number;
  actorId: string;
  actorName: string;
  reason: string;
}): Promise<{ balance: number }> {
  if (!firebaseEnabled) throw new Error('firebase_not_configured');
  const amount = Math.trunc(input.amount);
  if (!Number.isSafeInteger(amount) || amount === 0 || amount < -1_000_000_000 || amount > 1_000_000_000) {
    throw new Error('invalid_amount');
  }
  const db = firestore();
  const playerRef = db.collection('players').doc(input.uid);
  const auditRef = db.collection('coinAudit').doc();
  let balance = 0;
  await db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(playerRef);
    const current = Number(snap.get('credits') ?? 0);
    const next = current + amount;
    if (!Number.isSafeInteger(next) || next < 0 || next > 9_000_000_000_000_000) throw new Error('coin_overflow');
    balance = next;
    tx.set(playerRef, {
      username: input.username,
      usernameLower: input.username.toLowerCase(),
      credits: next,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.set(auditRef, {
      actorId: input.actorId,
      actorName: input.actorName,
      targetId: input.uid,
      targetName: input.username,
      amount,
      balance: next,
      reason: input.reason.slice(0, 200),
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  return { balance };
}

export async function findFirebasePlayerByUsername(username: string): Promise<{ uid: string; username: string; credits: number } | null> {
  if (!firebaseEnabled) return null;
  const snap = await firestore().collection('players')
    .where('usernameLower', '==', username.trim().toLowerCase())
    .limit(1)
    .get();
  const doc = snap.docs[0];
  if (!doc) return null;
  return { uid: doc.id, username: String(doc.get('username') ?? username), credits: Number(doc.get('credits') ?? 0) };
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
  await firestore().collection('coinAudit').add({ ...input, createdAt: FieldValue.serverTimestamp() });
}

export async function upsertBotProfile(input: {
  id: string;
  name: string;
  difficulty: string;
  persona?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!firebaseEnabled) return;
  await firestore().collection('botProfiles').doc(input.id).set({
    name: input.name,
    difficulty: input.difficulty,
    persona: input.persona ?? 'default',
    metadata: input.metadata ?? {},
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

export async function upsertVoicePack(input: {
  id: string;
  name: string;
  blurb: string;
  storagePath?: string;
  variants?: Record<string, number>;
}): Promise<void> {
  if (!firebaseEnabled) return;
  await firestore().collection('voicePacks').doc(input.id).set({
    name: input.name,
    blurb: input.blurb,
    storagePath: input.storagePath ?? `voice-packs/${input.id}`,
    variants: input.variants ?? {},
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

export async function recordPlayerEvent(input: {
  uid: string;
  type: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  if (!firebaseEnabled) return;
  await firestore().collection('playerEvents').add({
    uid: input.uid,
    type: input.type,
    data: input.data ?? {},
    createdAt: FieldValue.serverTimestamp(),
  });
}
