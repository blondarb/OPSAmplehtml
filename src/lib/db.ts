import { Pool } from 'pg'
import { getRdsCredentials } from './secrets'

let pool: Pool | null = null

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

export default getPool
