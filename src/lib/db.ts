import { Pool } from 'pg'
import { getRdsCredentials } from './secrets'

let pool: Pool | null = null
let wearablePool: Pool | null = null

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
    ssl: { rejectUnauthorized: false },
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
    ssl: { rejectUnauthorized: false },
  })
  return wearablePool
}

export default getPool
