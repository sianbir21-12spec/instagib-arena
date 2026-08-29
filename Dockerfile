# Instagib Arena — Zeabur single-service image.
# One container serves the web client, HTTP APIs, and WebSocket game.

FROM node:20.19-bookworm-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Firebase was added to package.json after the checked-in lockfile was created.
# npm install refreshes the dependency graph during the image build.
COPY package*.json ./
ENV NODE_ENV=development
RUN npm install --include=dev

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV HOST=0.0.0.0
EXPOSE 4000

CMD ["npm", "start"]
