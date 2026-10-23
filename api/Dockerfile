# syntax=docker/dockerfile:1

# ---------- build ----------
# Compiles TypeScript with the dev dependencies, which are then thrown away.
FROM node:22-alpine AS build
WORKDIR /app

# Copied before the source so `npm ci` is only re-run when the manifest
# changes, not on every edit to a .ts file.
COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# Re-resolve with production deps only, so the runtime image never carries
# vitest, tsx, typescript or mongodb-memory-server.
RUN npm ci --omit=dev

# ---------- runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

# Run as a non-root user. The node image ships one; using it means a container
# escape does not land on a root shell.
USER node

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json

EXPOSE 3001

# Readiness, not liveness: this one round-trips to MongoDB, so the orchestrator
# stops sending traffic to a container that cannot actually serve it.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Direct node, no npm wrapper: npm would swallow SIGTERM and break the graceful
# shutdown that finishes in-flight submissions.
CMD ["node", "dist/server.js"]
