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
    COGNITO_CLIENT_SECRET: process.env.COGNITO_CLIENT_SECRET,
  },
};

export default nextConfig;
