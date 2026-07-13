import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '12mb',
    },
  },
  // Pass build-time env vars to the server runtime.
  // Amplify SSR compute does not inject app-level env vars at runtime,
  // so we inline them during the build via next.config.
  env: {
    // Durable long-packet rollout flag (SAM worker stacks deployed 2026-07-12)
    TRIAGE_LONG_PACKET_DURABLE_ENABLED: process.env.TRIAGE_LONG_PACKET_DURABLE_ENABLED,
    TRIAGE_LONG_PACKET_MAX_ATTEMPTS: process.env.TRIAGE_LONG_PACKET_MAX_ATTEMPTS,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY,
    RDS_HOST: process.env.RDS_HOST,
    RDS_PORT: process.env.RDS_PORT,
    RDS_USER: process.env.RDS_USER,
    RDS_PASSWORD: process.env.RDS_PASSWORD,
    RDS_DATABASE: process.env.RDS_DATABASE,
    COGNITO_USER_POOL_ID: process.env.COGNITO_USER_POOL_ID,
    COGNITO_CLIENT_ID: process.env.COGNITO_CLIENT_ID,
    COGNITO_REGION: process.env.COGNITO_REGION,
    BEDROCK_ACCESS_KEY_ID: process.env.BEDROCK_ACCESS_KEY_ID,
    BEDROCK_SECRET_ACCESS_KEY: process.env.BEDROCK_SECRET_ACCESS_KEY,
    BEDROCK_REGION: process.env.BEDROCK_REGION,
    BEDROCK_TRIAGE_MODEL: process.env.BEDROCK_TRIAGE_MODEL,
    BEDROCK_KB_ID: process.env.BEDROCK_KB_ID,
    COGNITO_CLIENT_SECRET: process.env.COGNITO_CLIENT_SECRET,
    // AI Historian turn-taking / noise handling (hot-revertable without a code change)
    HISTORIAN_TURN_DETECTION_MODE: process.env.HISTORIAN_TURN_DETECTION_MODE,
    HISTORIAN_NOISE_REDUCTION: process.env.HISTORIAN_NOISE_REDUCTION,
    // Voice provider A/B (OpenAI Realtime vs Nova Sonic). Must be inlined here or
    // the historian session route can't read them at runtime on Amplify SSR.
    // Nova fails closed (provider.start throws) until NOVA_SONIC_RELAY_URL is set.
    VOICE_PROVIDER: process.env.VOICE_PROVIDER,
    NOVA_SONIC_RELAY_URL: process.env.NOVA_SONIC_RELAY_URL,
    NOVA_SONIC_VOICE_ID: process.env.NOVA_SONIC_VOICE_ID,
    // Shared secret used to mint the relay's WS-upgrade auth token
    // (src/app/api/ai/historian/session/route.ts mintNovaRelayToken). Same
    // known Amplify SSR gotcha as the vars above — must be inlined here or
    // the session route can't read it at runtime.
    NOVA_RELAY_SHARED_SECRET: process.env.NOVA_RELAY_SHARED_SECRET,
    // Clara R&D voice test gate (src/lib/clara/testGate.ts). Doubles as the
    // HMAC secret for the gate cookie. Same Amplify SSR gotcha — must be
    // inlined here or /api/ai/clara/auth fail-closes with "unset" at runtime.
    CLARA_TEST_PASSWORD: process.env.CLARA_TEST_PASSWORD,
    BEDROCK_CLARA_CLASSIFIER_MODEL: process.env.BEDROCK_CLARA_CLASSIFIER_MODEL,
  },
};

export default nextConfig;
