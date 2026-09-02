# Instagib Arena — Zeabur single-service image.
# One container serves the web client, HTTP APIs, and WebSocket game.

FROM node:22-bookworm-slim

WORKDIR /app

# better-sqlite3 may need to compile from source when a prebuilt binary is
# unavailable, so keep the native build toolchain in the image.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# package.json was updated with Firebase dependencies, while an older
# package-lock may still be present. Use npm install so npm can reconcile and
# regenerate the lockfile during the container build instead of failing npm ci
# on a package-lock/package.json mismatch.
COPY package*.json ./
ENV NODE_ENV=development
RUN npm install --include=dev

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV HOST=0.0.0.0

# Zeabur supplies PORT at runtime; server/index.ts validates it and falls back
# safely when the platform variable is absent/invalid.
EXPOSE 8080

CMD ["npm", "start"]
