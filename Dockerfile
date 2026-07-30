# --- Shklet POS — production image (Next.js + Prisma + PostgreSQL) ---
FROM node:22-alpine AS base
WORKDIR /app
# Prisma needs openssl on Alpine; postgresql-client provides pg_dump for the
# daily R2 database backups (see src/lib/backup.ts).
RUN apk add --no-cache openssl postgresql-client tzdata

# Install dependencies (including dev deps — Prisma CLI is needed at runtime for migrations).
# Copy the Prisma schema BEFORE `npm ci` so the postinstall `prisma generate` can find it.
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

# Build the app.
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV TZ=Asia/Baghdad
# Railway provides PORT; default to 3000 locally.
ENV PORT=3000
EXPOSE 3000

# Apply migrations, then start the server. (Run `npm run seed` once after first deploy.)
CMD ["npm", "run", "start:prod"]
