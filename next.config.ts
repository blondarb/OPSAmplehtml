import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Multiple unrelated lockfiles exist above this worktree. Keep server output
  // tracing inside this application so builds cannot sweep the developer home
  // directory or resolve tooling from an unrelated workspace root.
  outputFileTracingRoot: process.cwd(),
  experimental: {
    serverActions: {
      bodySizeLimit: '12mb',
    },
  },
  // Only non-secret configuration may be embedded in the build artifact.
  // Server credentials are resolved at runtime through the Amplify SSR
  // compute role and Secrets Manager. Never add passwords, API keys, static
  // AWS credentials, client secrets, or signing secrets to this block.
  env: {
    RDS_DATABASE: process.env.RDS_DATABASE,
    COGNITO_CLIENT_SECRET_ID: process.env.COGNITO_CLIENT_SECRET_ID,
    NOVA_RELAY_SECRET_ID: process.env.NOVA_RELAY_SECRET_ID,
    COGNITO_USER_POOL_ID: process.env.COGNITO_USER_POOL_ID,
    COGNITO_CLIENT_ID: process.env.COGNITO_CLIENT_ID,
    COGNITO_REGION: process.env.COGNITO_REGION,
    BEDROCK_REGION: process.env.BEDROCK_REGION,
    BEDROCK_TRIAGE_MODEL: process.env.BEDROCK_TRIAGE_MODEL,
    BEDROCK_KB_ID: process.env.BEDROCK_KB_ID,
    // AI Historian turn-taking / noise handling (hot-revertable without a code change)
    HISTORIAN_TURN_DETECTION_MODE: process.env.HISTORIAN_TURN_DETECTION_MODE,
    HISTORIAN_NOISE_REDUCTION: process.env.HISTORIAN_NOISE_REDUCTION,
    // Non-secret voice provider selection and relay endpoint configuration.
    // Nova fails closed (provider.start throws) until NOVA_SONIC_RELAY_URL is set.
    VOICE_PROVIDER: process.env.VOICE_PROVIDER,
    NOVA_SONIC_RELAY_URL: process.env.NOVA_SONIC_RELAY_URL,
    NOVA_SONIC_VOICE_ID: process.env.NOVA_SONIC_VOICE_ID,
    NOVA_RELAY_SECRET_CACHE_TTL_MS:
      process.env.NOVA_RELAY_SECRET_CACHE_TTL_MS,
  },
};

export default nextConfig;
