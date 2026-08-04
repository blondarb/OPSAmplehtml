import { Pool } from 'pg'
import { getRdsCredentials } from './secrets'
import { RDS_CA_BUNDLE } from './rds-ca-bundle'

let pool: Pool | null = null
let wearablePool: Pool | null = null
let neuroPlansPool: Pool | null = null

// Validate the RDS server cert against the vendored AWS RDS CA bundle (prevents MITM).
// RDS_SSL_INSECURE=true is an emergency escape hatch to disable validation without a
// code revert if the CA ever mismatches (e.g. AWS rotates the root CA before we refresh
// the bundle). Default is strict validation.
const rdsSsl = {
  ca: RDS_CA_BUNDLE,
  rejectUnauthorized: process.env.RDS_SSL_INSECURE === 'true' ? false : true,
}

/**
 * node-postgres emits 'error' on the POOL when an idle client dies (RDS
 * failover, connection reset, security-group blip). With no listener that is
 * an unhandled EventEmitter error, which crashes the whole Node process and
 * kills every in-flight request on the container — not just the one that
 * touched the bad connection. The pool self-heals by discarding the client;
 * all it needs is for someone to be listening. (Audit 2026-08-04.)
 */
function attachPoolErrorHandler(p: Pool, label: string): Pool {
  p.on('error', (err) => {
    console.error(`[db:${label}] idle client error (pool will discard it):`, err)
  })
  return p
}

export async function getPool(): Promise<Pool> {
  if (pool) return pool
  const creds = await getRdsCredentials()
  pool = new Pool({
    host: creds.host,
    port: parseInt(creds.port || '5432'),
    user: creds.username,
    password: creds.password,
    database: creds.database,
    max: 5,
    ssl: rdsSsl,
  })
  attachPoolErrorHandler(pool, 'default')
  return pool
}

// Wearable data lives in sevaro_monitor (written by SevaroMonitor iOS app via Lambda).
// OPSAmple's default DB (github_showcase) has separate copies of these tables but
// the iOS app does not write there — always use this pool for wearable queries.
export async function getWearablePool(): Promise<Pool> {
  if (wearablePool) return wearablePool
  const creds = await getRdsCredentials()
  wearablePool = new Pool({
    host: creds.host,
    port: parseInt(creds.port || '5432'),
    user: creds.username,
    password: creds.password,
    database: 'sevaro_monitor',
    max: 5,
    ssl: rdsSsl,
  })
  attachPoolErrorHandler(wearablePool, 'wearable')
  return wearablePool
}

// Clinical plan library lives in neuro_plans (synced from blondarb/neuro-plans via
// `npm run sync-plans`), same RDS instance as the app's other databases. Used for
// grounding the AI Historian localizer's differential/questions in vetted clinical
// plans. Read-only use.
export async function getNeuroPlansPool(): Promise<Pool> {
  if (neuroPlansPool) return neuroPlansPool
  const creds = await getRdsCredentials()
  neuroPlansPool = new Pool({
    host: creds.host,
    port: parseInt(creds.port || '5432'),
    user: creds.username,
    password: creds.password,
    database: 'neuro_plans',
    max: 5,
    ssl: rdsSsl,
  })
  attachPoolErrorHandler(neuroPlansPool, 'neuro_plans')
  return neuroPlansPool
}

export default getPool
