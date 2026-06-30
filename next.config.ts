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
    BEDROCK_KB_ID: process.env.BEDROCK_KB_ID,
    COGNITO_CLIENT_SECRET: process.env.COGNITO_CLIENT_SECRET,
    // Neuro/OAB FAQ voice POC — selects the active specialty corpus + lexicons,
    // classifier model, and escape-hatch phone numbers at runtime on Amplify SSR.
    FAQ_SPECIALTY: process.env.FAQ_SPECIALTY,
    BEDROCK_FAQ_CLASSIFIER_MODEL: process.env.BEDROCK_FAQ_CLASSIFIER_MODEL,
    FAQ_POLLY_VOICE_ID: process.env.FAQ_POLLY_VOICE_ID,
    FAQ_POLLY_ENGINE: process.env.FAQ_POLLY_ENGINE,
    FAQ_POLLY_REGION: process.env.FAQ_POLLY_REGION,
    FAQ_CLINIC_NUMBER: process.env.FAQ_CLINIC_NUMBER,
    FAQ_AFTER_HOURS_NUMBER: process.env.FAQ_AFTER_HOURS_NUMBER,
  },
};

export default nextConfig;
