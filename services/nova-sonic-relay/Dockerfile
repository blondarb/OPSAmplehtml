# ---------------------------------------------------------------------------
# Stage 1: build — compile TypeScript to dist/
# ---------------------------------------------------------------------------
FROM public.ecr.aws/docker/library/node:22-alpine3.23@sha256:46825fbbd4e996a78b7a2cdc08d75e38a5a505bdab95dcda55605359bf124bc6 AS build

# The immutable upstream image predates Alpine's OpenSSL 3.5.8 security
# packages. Pin the patched v3.23 packages so builds do not inherit the
# vulnerable 3.5.7-r0 layer or float across unrelated package updates.
RUN apk add --no-cache --upgrade \
      openssl=3.5.8-r0 \
      libssl3=3.5.8-r0 \
      libcrypto3=3.5.8-r0

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2: runtime — production deps only + compiled output
# ---------------------------------------------------------------------------
FROM public.ecr.aws/docker/library/node:22-alpine3.23@sha256:46825fbbd4e996a78b7a2cdc08d75e38a5a505bdab95dcda55605359bf124bc6

RUN apk add --no-cache --upgrade \
      openssl=3.5.8-r0 \
      libssl3=3.5.8-r0 \
      libcrypto3=3.5.8-r0

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

USER node

CMD ["node", "dist/server.js"]
