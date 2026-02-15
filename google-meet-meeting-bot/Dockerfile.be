# ─── base ────────────────────────────────────────────────────────────────
FROM node:18-slim
ARG CACHEBUST=1
WORKDIR /app

# ─── config & manifests ──────────────────────────────────────────────────
COPY tsconfig.base.json ./
COPY package*.json       ./
COPY src/backend/package*.json ./src/backend/
COPY src/backend/tsconfig.json ./src/backend/

# ─── source code ─────────────────────────────────────────────────────────
COPY src ./src

# ─── deps (npm ci = reproducible builds from lock file) ──────────────────
RUN npm ci \
 && npm ci --prefix ./src/backend

# ─── Prisma ──────────────────────────────────────────────────────────────
COPY src/backend/schema.prisma ./prisma/
RUN npx prisma generate

# ─── build ───────────────────────────────────────────────────────────────
RUN echo "🔧  CACHEBUST=$CACHEBUST - running tsc…" \
 && npx tsc --project src/backend/tsconfig.json \
 && echo "✅  build done; contents of src/dist/backend:" \
 && ls -l src/dist/backend | grep server.js

# ─── start ───────────────────────────────────────────────────────────────
EXPOSE 3001
CMD ["node", "src/dist/backend/server.js"]
