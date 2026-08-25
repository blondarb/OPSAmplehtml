# ---------------------------------------------------------------------------
# Stage 1: build — compile TypeScript to dist/
# ---------------------------------------------------------------------------
FROM public.ecr.aws/docker/library/node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2: runtime — production deps only + compiled output
# ---------------------------------------------------------------------------
FROM public.ecr.aws/docker/library/node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32

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
