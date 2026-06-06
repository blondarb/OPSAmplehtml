import { Pool } from 'pg'
import { getRdsCredentials } from './secrets'
import { RDS_CA_BUNDLE } from './rds-ca-bundle'

let pool: Pool | null = null
let wearablePool: Pool | null = null

// Validate the RDS server cert against the vendored AWS RDS CA bundle (prevents MITM).
// RDS_SSL_INSECURE=true is an emergency escape hatch to disable validation without a
// code revert if the CA ever mismatches (e.g. AWS rotates the root CA before we refresh
// the bundle). Default is strict validation.
const rdsSsl = {
  ca: RDS_CA_BUNDLE,
  rejectUnauthorized: process.env.RDS_SSL_INSECURE === 'true' ? false : true,
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
  return wearablePool
}

export default getPool
