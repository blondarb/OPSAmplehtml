import type { NextConfig } from "next";

// Security response headers (audit 2026-08-04 N4). Applied to every route.
//
// SCOPE NOTE — the CSP here is deliberately NOT a full default-src policy.
// This app opens WebRTC/WSS connections to OpenAI Realtime, the Nova Sonic
// relay, and Deepgram from the patient historian, and renders inline <style>
// blocks throughout. A `default-src 'self'` policy would break the voice
// interview, so the directives below are limited to the ones that close real
// vectors without touching connect/script/style: clickjacking (frame-ancestors,
// backed by X-Frame-Options), plugin injection (object-src), base-tag hijack
// (base-uri), and form exfiltration (form-action). Tightening to a nonce-based
// script-src/connect-src allowlist is a follow-up that needs its own
// verification pass against the live voice path — do NOT add default-src here
// without testing an end-to-end historian session first.
const SECURITY_HEADERS = [
  {
    key: 'Content-Security-Policy',
    value: [
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      'upgrade-insecure-requests',
    ].join('; '),
  },
  // 2 years, preload-eligible. All traffic is already HTTPS via Amplify.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Microphone stays enabled for this origin — the historian needs it.
  { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), payment=(), usb=(), microphone=(self)' },
]

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '12mb',
    },
  },
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }]
  },
  // Standalone public URL for the outpatient referral-triage demo.
  //
  // ⚠️ THESE TWO RULES ARE LOCAL-DEV PARITY ONLY. They do NOT work on Amplify,
  // and they are NOT what serves /triage-demo in production — the Amplify
  // custom rules do (see "Amplify route rules" in the Known Gotchas of
  // CLAUDE.md). Verified against a real branch deployment 2026-08-05:
  //   · the 301 never fires — a public/ asset is served straight from the
  //     static CDN origin and never reaches this routing layer at all
  //   · the rewrite 404s — /triage-demo does reach the compute, but the
  //     compute bundle contains no copy of public/, so Next cannot resolve
  //     the destination
  // Keep them so `npm run dev` behaves like production. Do not delete them
  // assuming they are load-bearing, and do not add more public/-targeting
  // route rules here expecting them to ship.
  async redirects() {
    return [
      {
        source: '/concepts/triage-nurse/outpatient-triage-nurse-demo.html',
        destination: '/triage-demo',
        // statusCode, not `permanent: true` — the latter emits 308.
        statusCode: 301,
      },
    ]
  },
  async rewrites() {
    return [
      {
        source: '/triage-demo',
        destination: '/concepts/triage-nurse/outpatient-triage-nurse-demo.html',
      },
    ]
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
    RDS_DATABASE: process.env.RDS_DATABASE,
    // Non-secret tenant routing must also be available to Amplify SSR route
    // handlers; NEXT_PUBLIC_DEMO_TENANT covers the matching client bundle.
    DEMO_TENANT: process.env.DEMO_TENANT,
    NEXT_PUBLIC_DEMO_TENANT: process.env.NEXT_PUBLIC_DEMO_TENANT,
    COGNITO_USER_POOL_ID: process.env.COGNITO_USER_POOL_ID,
    COGNITO_CLIENT_ID: process.env.COGNITO_CLIENT_ID,
    COGNITO_REGION: process.env.COGNITO_REGION,
    BEDROCK_ACCESS_KEY_ID: process.env.BEDROCK_ACCESS_KEY_ID,
    BEDROCK_SECRET_ACCESS_KEY: process.env.BEDROCK_SECRET_ACCESS_KEY,
    BEDROCK_REGION: process.env.BEDROCK_REGION,
    BEDROCK_TRIAGE_MODEL: process.env.BEDROCK_TRIAGE_MODEL,
    BEDROCK_KB_ID: process.env.BEDROCK_KB_ID,
    // Identifiers/configuration only. Secret values are resolved at request
    // time through src/lib/secrets.ts and must never be embedded in a build.
    COGNITO_CLIENT_SECRET_ID: process.env.COGNITO_CLIENT_SECRET_ID,
    RDS_SECRET_ID: process.env.RDS_SECRET_ID,
    // AI Historian turn-taking / noise handling (hot-revertable without a code change)
    HISTORIAN_TURN_DETECTION_MODE: process.env.HISTORIAN_TURN_DETECTION_MODE,
    HISTORIAN_NOISE_REDUCTION: process.env.HISTORIAN_NOISE_REDUCTION,
    // Voice provider A/B (OpenAI Realtime vs Nova Sonic). Must be inlined here or
    // the historian session route can't read them at runtime on Amplify SSR.
    // Nova fails closed (provider.start throws) until NOVA_SONIC_RELAY_URL is set.
    VOICE_PROVIDER: process.env.VOICE_PROVIDER,
    NOVA_SONIC_RELAY_URL: process.env.NOVA_SONIC_RELAY_URL,
    NOVA_SONIC_VOICE_ID: process.env.NOVA_SONIC_VOICE_ID,
    // Non-secret identifier for the shared relay secret. The actual HMAC key
    // is resolved at request time and is never embedded in an app artifact.
    NOVA_RELAY_SECRET_ID: process.env.NOVA_RELAY_SECRET_ID,
    NOVA_RELAY_SECRET_CACHE_TTL_MS: process.env.NOVA_RELAY_SECRET_CACHE_TTL_MS,
    // Clara R&D voice test gate (src/lib/clara/testGate.ts). Doubles as the
    // HMAC secret for the gate cookie. Same Amplify SSR gotcha — must be
    // inlined here or /api/ai/clara/auth fail-closes with "unset" at runtime.
    CLARA_TEST_PASSWORD: process.env.CLARA_TEST_PASSWORD,
    BEDROCK_CLARA_CLASSIFIER_MODEL: process.env.BEDROCK_CLARA_CLASSIFIER_MODEL,
  },
};

export default nextConfig;
