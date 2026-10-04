# syntax=docker/dockerfile:1

# Debian slim rather than Alpine: Prisma's engines and sharp ship glibc binaries.
FROM node:24-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- deps: full install (dev deps are needed to build) ----
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ---- build ----
FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Local dev runs on SQLite; production runs on Postgres. Prisma can't pick the provider
# from an env var, so the schema is switched here (and the build fails if that didn't work).
RUN sed -i -E 's/provider(\s*)=(\s*)"sqlite"/provider\1=\2"postgresql"/' prisma/schema.prisma \
  && grep -q '"postgresql"' prisma/schema.prisma \
  && npx prisma generate && npm run build

# ---- runtime ----
FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Prisma CLI for `db push` at startup (pinned to the version in package-lock.json).
RUN npm install -g prisma@6.19.3 && npm cache clean --force

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/prisma/schema.prisma ./prisma/schema.prisma
# The generated client and its query engine, in case file tracing missed them.
COPY --from=builder --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=node:node /app/scripts/create-admin.mjs ./scripts/create-admin.mjs
COPY --chown=node:node docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Uploaded files live on a volume (the database is the Postgres service).
RUN mkdir -p /app/uploads && chown node:node /app/uploads \
  && chmod +x /usr/local/bin/docker-entrypoint.sh
VOLUME ["/app/uploads"]

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
