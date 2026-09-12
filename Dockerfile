# syntax=docker/dockerfile:1

# =============================================================================
#  Veltrixair backend
#
#  Two stages. The first compiles TypeScript and needs the whole toolchain;
#  the second is a clean image that keeps only what is needed to run, so the
#  compiler, the linter and every dev dependency stay behind.
#
#  Node 22 rather than the 24 on the development machine: 22 is the current
#  LTS line, which is the one to be on for something that has to keep running
#  unattended. tsconfig targets ES2023, which 22 supports in full.
# =============================================================================

# ---- stage 1: build ---------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

# Manifests first, on their own. Docker caches each instruction, and this one
# only invalidates when a dependency actually changes — so editing source does
# not reinstall 800 packages.
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build


# ---- stage 2: run -----------------------------------------------------------
FROM node:22-alpine AS run

WORKDIR /app
ENV NODE_ENV=production

# Production dependencies only. --omit=dev drops typescript, eslint, jest and
# the rest, which is most of node_modules.
COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

# The compiled output is not enough on its own. `npm run migration:run` uses
# typeorm-ts-node-commonjs against src/data-source.ts, so a dist-only image
# could start but could never migrate itself — and migrations are a deliberate
# deploy step here, not something the app does at boot.
COPY --from=build /app/src ./src
COPY tsconfig*.json ./

# The node image ships a non-root `node` user. Running as root inside a
# container is a habit worth not forming.
USER node

EXPOSE 3000

CMD ["node", "dist/main"]
