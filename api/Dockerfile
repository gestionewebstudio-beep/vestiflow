# VestiFlow API (NestJS + Prisma) — immagine di produzione per Railway.
# Build context = cartella api/ (Railway Root Directory = api).
FROM node:22-slim AS build

# Prisma engine richiede OpenSSL a runtime e in fase di generate.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Layer dipendenze: cache invalidata solo se cambia il lockfile.
COPY package.json package-lock.json ./
RUN npm ci

# Prisma client (serve lo schema prima di generare).
COPY prisma ./prisma
RUN npx prisma generate

# Sorgenti e build.
COPY . .
RUN npm run build

# ── Runtime ────────────────────────────────────────────────────────────────
FROM node:22-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

# Porta i node_modules (con client Prisma generato) e gli artefatti di build.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json

# Migrazioni al boot, poi avvio. PORT è iniettata da Railway.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
