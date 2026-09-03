# Firebase-first setup

This branch uses **Firebase Auth + Firebase Admin SDK as the identity and cloud-data base** while keeping the existing Node game server authoritative for latency-critical FPS simulation.

## Architecture

- **Authentication & identity:** Firebase Auth + Firebase Admin SDK.
- **Users/admin roles:** Firebase Auth custom claims (`admin: true`), verified server-side.
- **Coins/economy:** Firestore `players/{uid}.credits` with Admin SDK transactions + `coinAudit` records.
- **Chat:** Firestore match chat with realtime listeners for non-latency-critical communication.
- **Bot/player profiles:** Firestore `botProfiles` and `players`.
- **Voice-pack metadata:** Firestore `voicePacks`.
- **Voice-pack assets:** Firebase Storage under `voice-packs/{packId}/...`.
- **Stats/progression/inventory:** mirrored into the Firestore player profile by the trusted server.
- **Permissions:** Firebase ID tokens/custom claims are verified server-side; client flags are never trusted.
- **Realtime:** Firestore `onSnapshot` is used where realtime synchronization is useful.
- **Low latency:** movement, shooting, hit detection, matchmaking and other simulation remain on the Node/WebSocket game server.

## 1. Firebase project

1. Create/select the Firebase project.
2. Enable **Authentication**.
3. Add the Web App and put its public configuration in `VITE_FIREBASE_*` variables.
4. Enable **Firestore**.
5. Enable **Storage**.
6. Deploy `firestore.rules` and `storage.rules` with the Firebase CLI when managing rules from this repository.

The web config is public client configuration. **Never put a Firebase service-account private key in the repository or any `VITE_*` variable.**

## 2. Server credentials

Set these as Zeabur server secrets:

```text
FIREBASE_PROJECT_ID=fps2-c4fd3
FIREBASE_CLIENT_EMAIL=your-service-account-email
FIREBASE_PRIVATE_KEY=your-private-key
```

`FIREBASE_PRIVATE_KEY` may contain literal `\n` escapes; the server normalizes them. Application Default Credentials are also supported when the runtime provides them.

## 3. Admin roles

The server creates/synchronizes the Firebase Auth record for a game account and assigns the `admin` custom claim from the server-side admin configuration.

For the current compatibility layer, set:

```text
ADMIN_USERNAMES=YourGameUsername
```

Do not build admin authorization from a client-side boolean. Protected Firebase-backed routes verify the Firebase ID token and `admin` custom claim on the server.

## 4. Coins

When Firebase is configured, admin coin operations use a Firestore transaction against `players/{uid}` and create a corresponding `coinAudit` document. This prevents two simultaneous grants from overwriting each other.

The existing SQLite economy remains only as a local fallback when Firebase is not configured.

## 5. Client identity

After normal game login/register, the browser calls `/api/auth/firebase-token`. The server creates/updates the Firebase Auth record, sets custom claims, and returns a Firebase custom token. The browser exchanges that token for a Firebase session.

Admin API requests include the Firebase ID token as:

```text
Authorization: Bearer <firebase-id-token>
```

The server verifies the token with Firebase Admin SDK before accepting protected operations.

## 6. Firestore collections

```text
players/{uid}
coinAudit/{auditId}
botProfiles/{botId}
voicePacks/{packId}
playerEvents/{eventId}
matches/{matchId}/chat/{messageId}
```

Authoritative player writes are performed by the trusted server. Firestore rules deny ordinary clients from directly modifying coins/progression.

## 7. Voice packs

Create a `voicePacks/{packId}` document containing metadata such as `name`, `blurb`, `storagePath`, and variant counts. Store actual audio in Firebase Storage under the pack's storage path. The web client can resolve an asset with `getVoicePackAssetUrl()`.

Use original or properly licensed voice assets; do not upload voices you do not have rights to distribute.

## 8. Deployment

This branch is configured for Node 22 and uses `npm install` so the Firebase dependency graph is reconciled during the Zeabur build. Keep `main` untouched until the branch has been tested and intentionally merged.
