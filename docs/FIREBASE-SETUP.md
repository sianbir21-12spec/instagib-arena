# Firebase setup

The `feature/firebase-admin-aimbot` branch keeps the existing server session as the authoritative game identity and adds Firebase as a secondary cloud identity/profile layer.

## 1. Create the Firebase project

1. Create/select a Firebase project.
2. Enable **Authentication**.
3. Add a Web App and copy its public web configuration into the `VITE_FIREBASE_*` variables.
4. Enable Firestore.

The Firebase web config is not a service-account secret. The Admin SDK credentials below are secret and must stay server-side.

## 2. Server credentials

Preferred production setup is Application Default Credentials when the deployment platform provides them. Otherwise set:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

Never commit the private key.

## 3. Admin account

Set:

```text
ADMIN_USERNAMES=YourGameUsername
```

The existing account system will promote that username on registration/boot. Admin mutations continue to require the server-side game session.

## 4. Coin control

Open `/admin/coins` while logged in as an admin.

The grant endpoint is server-authoritative:

```text
POST /api/auth/admin/coins/grant
{
  "username": "PlayerName",
  "amount": 1000,
  "reason": "tournament reward"
}
```

Negative amounts are allowed for corrections, but the resulting balance may not become negative. Every mutation is recorded in the existing SQLite audit log and, when Firebase is configured, in the `coinAudit` Firestore collection.

## 5. Firebase identity bridge

After a successful game login/register, the browser exchanges the httpOnly game session for a Firebase custom token at `/api/auth/firebase-token`. The browser then signs into Firebase with that token.

This deliberately does **not** move game authorization into the browser. Match state, progression, coins, admin permissions, and competitive scoring remain server-authoritative.

## 6. Aim training

`/aim-lab` is an isolated training mode with moving targets and an optional local aim-assist trainer. It does not modify competitive match state, scores, or other players.

## 7. Dependency install

The Firebase Admin SDK 14.x requires Node 22+, so this branch raises the package engine requirement accordingly. Run `npm install` after pulling the branch so the lockfile is regenerated with the new Firebase dependencies before using `npm ci` in a locked production build.
