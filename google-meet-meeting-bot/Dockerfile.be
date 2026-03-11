# ─── base (Node 20 required by @firebase/* and firebase-admin) ───────────
FROM node:20-slim
ARG CACHEBUST=1
WORKDIR /app

# ─── config & manifests ──────────────────────────────────────────────────
COPY tsconfig.base.json ./
COPY package*.json       ./
COPY src/backend/package*.json ./src/backend/
COPY src/backend/tsconfig.json ./src/backend/

# ─── source code ─────────────────────────────────────────────────────────
COPY src ./src

# ─── deps (npm install so container resolves deps; ci fails when lockfile from different env) ─
RUN npm install \
 && npm install --prefix ./src/backend

# ─── Prisma ──────────────────────────────────────────────────────────────
COPY src/backend/schema.prisma ./prisma/
RUN apt-get update -y && apt-get install -y openssl \
 && npx prisma generate

# ─── build ───────────────────────────────────────────────────────────────
RUN echo "🔧  CACHEBUST=$CACHEBUST - running tsc…" \
 && npx tsc --project src/backend/tsconfig.json \
 && echo "✅  build done; contents of src/dist/backend:" \
 && ls -l src/dist/backend | grep server.js

# ─── start ───────────────────────────────────────────────────────────────
EXPOSE 3001
CMD ["node", "src/dist/backend/server.js"]
