# ---------------------------------------------------------------------------
# Stage 1: build — compile TypeScript to dist/
# ---------------------------------------------------------------------------
FROM node:20-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2: runtime — production deps only + compiled output
# ---------------------------------------------------------------------------
FROM node:20-slim

WORKDIR /app

# Install production dependencies only.
# Runtime deps (@aws-sdk/client-bedrock-runtime, @smithy/node-http-handler,
# ws, uuid) are in "dependencies", so --omit=dev keeps them.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

ENV NODE_ENV=production
ENV PORT=8081
EXPOSE 8081

CMD ["node", "dist/server.js"]
