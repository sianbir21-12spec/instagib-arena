import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getDatabase } from 'firebase-admin/database';

const projectId = process.env.FIREBASE_PROJECT_ID?.trim() || '';
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim() || '';
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim() || '';
const databaseURL = process.env.FIREBASE_DATABASE_URL?.trim() || (projectId ? `https://${projectId}-default-rtdb.firebaseio.com` : '');

function ensureApp() {
  if (!projectId) throw new Error('firebase_not_configured');
  if (getApps().length) return getApps()[0];
  if (clientEmail && privateKey) {
    return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId, databaseURL });
  }
  return initializeApp({ credential: applicationDefault(), projectId, databaseURL });
}

export async function publishChatMessage(input: {
  matchId: string;
  messageId: string;
  uid: string;
  username: string;
  text: string;
  bot: boolean;
  persona?: string | null;
}): Promise<void> {
  const app = ensureApp();
  const matchId = input.matchId.trim().slice(0, 80) || 'lobby';
  const messageId = input.messageId.trim().slice(0, 80);
  const payload = {
    uid: input.uid.slice(0, 80),
    username: input.username.trim().slice(0, 20),
    text: input.text.trim().slice(0, 300),
    bot: Boolean(input.bot),
    persona: input.persona?.slice(0, 40) ?? null,
    createdAt: Date.now(),
  };
  if (!messageId || !payload.username || !payload.text) throw new Error('invalid_chat_message');

  await Promise.all([
    getDatabase(app).ref(`matches/${matchId}/chat/${messageId}`).set(payload),
    getFirestore(app).collection('matches').doc(matchId).collection('chat').doc(messageId).set({
      ...payload,
      createdAt: FieldValue.serverTimestamp(),
    }),
  ]);
}
