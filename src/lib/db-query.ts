/**
 * Lightweight Supabase-compatible query builder backed by node-postgres (pg).
 *
 * Provides the same chaining API as Supabase client:
 *   db.from('table').select('*').eq('col', val).order('col').single()
 *
 * Returns { data, error } just like Supabase, so consuming code needs
 * minimal changes — only the import and initialization line.
 */
import { getPool } from './db'

// ── public entry points ──────────────────────────────────────────────

/** Start a query on a table — drop-in replacement for supabase.from() */
export function from(table: string): QueryBuilder {
  return new QueryBuilder(table)
}

/** Replace supabase.rpc('get_openai_key') — returns { data, error } like Supabase */
export async function getOpenAIKey(): Promise<DbResult> {
  try {
    const pool = await getPool()
    const { rows } = await pool.query(
      `SELECT value FROM app_settings WHERE key = 'openai_api_key' LIMIT 1`
    )
    return { data: rows[0]?.value ?? null, error: null }
  } catch (e: unknown) {
    return { data: null, error: { message: e instanceof Error ? e.message : String(e), code: 'DB_ERROR' } }
  }
}

/** Generic RPC replacement — runs a SQL function */
export async function rpc(
  fnName: string,
  params?: Record<string, unknown>
): Promise<DbResult> {
  try {
    const pool = await getPool()
    const paramEntries = params ? Object.entries(params) : []
    const placeholders = paramEntries.map((_, i) => `$${i + 1}`).join(', ')
    const namedPlaceholders = paramEntries
      .map(([key], i) => `${key} := $${i + 1}`)
      .join(', ')
    const sql = `SELECT * FROM ${fnName}(${namedPlaceholders || ''})`
    const { rows } = await pool.query(sql, paramEntries.map(([, v]) => v))
    // Supabase RPC returns the scalar if function returns a single value
    if (rows.length === 1 && Object.keys(rows[0]).length === 1) {
      return { data: Object.values(rows[0])[0], error: null }
    }
    return { data: rows, error: null }
  } catch (e: unknown) {
    return { data: null, error: e instanceof Error ? { message: e.message, code: 'DB_ERROR' } : { message: String(e), code: 'DB_ERROR' } }
  }
}

// ── types ────────────────────────────────────────────────────────────

/** Matches Supabase error shape so consuming code can access .message, .code */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbResult = { data: any; error: { message: string; code?: string; details?: any; hint?: any } | null; count?: number | null }

// ── query builder ────────────────────────────────────────────────────

type Op = 'select' | 'insert' | 'update' | 'delete' | 'upsert'

interface Condition {
  sql: string
  values: unknown[]
}

class QueryBuilder implements PromiseLike<DbResult> {
  private table: string
  private op: Op = 'select'
  private cols = '*'
  private conditions: Condition[] = []
  private orders: string[] = []
  private limitN?: number
  private singleRow = false
  private maybeSingleRow = false
  private doReturn = false
  private payload?: Record<string, unknown> | Record<string, unknown>[]
  private conflictCol?: string
  private countMode?: 'exact'
  private headMode = false

  constructor(table: string) {
    this.table = table
  }

  // ── operation starters ──

  select(columns?: string, opts?: { count?: 'exact'; head?: boolean }): this {
    if (this.op === 'select' || this.op === undefined) {
      this.op = 'select'
    }
    if (columns) this.cols = columns
    if (opts?.count) this.countMode = opts.count
    if (opts?.head) this.headMode = true
    this.doReturn = true
    return this
  }

  insert(data: Record<string, unknown> | Record<string, unknown>[]): this {
    this.op = 'insert'
    this.payload = data
    return this
  }

  update(data: Record<string, unknown>): this {
    this.op = 'update'
    this.payload = data
    return this
  }

  delete(): this {
    this.op = 'delete'
    return this
  }

  upsert(
    data: Record<string, unknown> | Record<string, unknown>[],
    opts?: { onConflict?: string }
  ): this {
    this.op = 'upsert'
    this.payload = data
    if (opts?.onConflict) this.conflictCol = opts.onConflict
    return this
  }

  // ── filters ──

  eq(col: string, val: unknown): this {
    this.conditions.push({ sql: `"${col}" = ?`, values: [val] })
    return this
  }

  neq(col: string, val: unknown): this {
    this.conditions.push({ sql: `"${col}" != ?`, values: [val] })
    return this
  }

  gt(col: string, val: unknown): this {
    this.conditions.push({ sql: `"${col}" > ?`, values: [val] })
    return this
  }

  gte(col: string, val: unknown): this {
    this.conditions.push({ sql: `"${col}" >= ?`, values: [val] })
    return this
  }

  lt(col: string, val: unknown): this {
    this.conditions.push({ sql: `"${col}" < ?`, values: [val] })
    return this
  }

  lte(col: string, val: unknown): this {
    this.conditions.push({ sql: `"${col}" <= ?`, values: [val] })
    return this
  }

  in(col: string, vals: unknown[]): this {
    if (!vals.length) {
      // Empty IN → always false
      this.conditions.push({ sql: 'FALSE', values: [] })
      return this
    }
    const placeholders = vals.map(() => '?').join(', ')
    this.conditions.push({ sql: `"${col}" IN (${placeholders})`, values: vals })
    return this
  }

  is(col: string, val: null): this {
    this.conditions.push({ sql: `"${col}" IS ${val === null ? 'NULL' : 'NOT NULL'}`, values: [] })
    return this
  }

  ilike(col: string, val: string): this {
    this.conditions.push({ sql: `"${col}" ILIKE ?`, values: [val] })
    return this
  }

  like(col: string, val: string): this {
    this.conditions.push({ sql: `"${col}" LIKE ?`, values: [val] })
    return this
  }

  not(col: string, operator: string, val: string): this {
    // Supabase: .not('id', 'in', '(1,2,3)')
    if (operator === 'in') {
      // Parse the Supabase format: "(val1,val2,...)"
      const inner = val.replace(/^\(|\)$/g, '')
      const items = inner.split(',').map(s => s.trim())
      const placeholders = items.map(() => '?').join(', ')
      this.conditions.push({ sql: `"${col}" NOT IN (${placeholders})`, values: items })
    } else {
      this.conditions.push({ sql: `NOT "${col}" ${operator} ?`, values: [val] })
    }
    return this
  }

  // ── modifiers ──

  order(col: string, opts?: { ascending?: boolean }): this {
    const dir = opts?.ascending === false ? 'DESC' : 'ASC'
    this.orders.push(`"${col}" ${dir}`)
    return this
  }

  limit(n: number): this {
    this.limitN = n
    return this
  }

  single(): this {
    this.singleRow = true
    this.doReturn = true
    return this
  }

  maybeSingle(): this {
    this.maybeSingleRow = true
    this.doReturn = true
    return this
  }

  // ── execution via PromiseLike ──

  then<TResult1 = DbResult, TResult2 = never>(
    onfulfilled?:
      | ((value: DbResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  // ── SQL generation & execution ──

  private async execute(): Promise<DbResult> {
    try {
      const pool = await getPool()
      let sql = ''
      const allValues: unknown[] = []

      switch (this.op) {
        case 'select':
          sql = this.buildSelect(allValues)
          break
        case 'insert':
          sql = this.buildInsert(allValues)
          break
        case 'update':
          sql = this.buildUpdate(allValues)
          break
        case 'delete':
          sql = this.buildDelete(allValues)
          break
        case 'upsert':
          sql = this.buildUpsert(allValues)
          break
      }

      // If count mode with head, run a COUNT(*) query instead
      if (this.countMode === 'exact' && this.headMode) {
        const countSql = sql.replace(/^SELECT .+? FROM/, 'SELECT COUNT(*)::int AS count FROM')
        const { rows } = await pool.query(countSql, allValues)
        return { data: null, error: null, count: rows[0]?.count ?? 0 }
      }

      const { rows } = await pool.query(sql, allValues)

      // If count mode without head, return both data and count
      if (this.countMode === 'exact') {
        const countSql = sql.replace(/^SELECT .+? FROM/, 'SELECT COUNT(*)::int AS count FROM')
          .replace(/ ORDER BY .+$/, '')
          .replace(/ LIMIT \d+$/, '')
        const countResult = await pool.query(countSql, allValues)
        const count = countResult.rows[0]?.count ?? 0

        if (this.singleRow) {
          return { data: rows[0] ?? null, error: rows.length === 0 ? { message: 'No rows found', code: 'PGRST116', details: null, hint: null } : null, count }
        }
        return { data: rows, error: null, count }
      }

      if (this.singleRow) {
        if (rows.length === 0) {
          return {
            data: null,
            error: { message: 'No rows found', code: 'PGRST116', details: null, hint: null },
          }
        }
        return { data: rows[0], error: null }
      }

      if (this.maybeSingleRow) {
        return { data: rows[0] ?? null, error: null }
      }

      return { data: rows, error: null }
    } catch (e: unknown) {
      const err = e as { message?: string; code?: string }
      return {
        data: null,
        error: {
          message: err.message || String(e),
          code: err.code || 'DB_ERROR',
          details: null,
          hint: null,
        },
      }
    }
  }

  // ── SQL builders ──

  private buildWhere(allValues: unknown[]): string {
    if (!this.conditions.length) return ''
    const parts = this.conditions.map(c => {
      const sql = c.sql.replace(/\?/g, () => {
        allValues.push(c.values.shift())
        return `$${allValues.length}`
      })
      return sql
    })
    return ' WHERE ' + parts.join(' AND ')
  }

  private buildOrderLimit(): string {
    let s = ''
    if (this.orders.length) s += ' ORDER BY ' + this.orders.join(', ')
    if (this.limitN !== undefined) s += ` LIMIT ${this.limitN}`
    if (this.singleRow || this.maybeSingleRow) s += ' LIMIT 1'
    return s
  }

  private buildSelect(allValues: unknown[]): string {
    return (
      `SELECT ${this.cols} FROM "${this.table}"` +
      this.buildWhere(allValues) +
      this.buildOrderLimit()
    )
  }

  private buildInsert(allValues: unknown[]): string {
    const row = Array.isArray(this.payload) ? this.payload[0] : this.payload!
    const keys = Object.keys(row)
    const cols = keys.map(k => `"${k}"`).join(', ')

    if (Array.isArray(this.payload)) {
      // Multi-row insert
      const valueRows = this.payload.map(r => {
        const placeholders = keys.map(k => {
          const val = r[k]
          allValues.push(typeof val === 'object' && val !== null ? JSON.stringify(val) : val)
          return `$${allValues.length}`
        })
        return `(${placeholders.join(', ')})`
      })
      const ret = this.doReturn ? ' RETURNING *' : ''
      return `INSERT INTO "${this.table}" (${cols}) VALUES ${valueRows.join(', ')}${ret}`
    }

    const placeholders = keys.map(k => {
      const val = row[k]
      allValues.push(typeof val === 'object' && val !== null && !Array.isArray(val) ? JSON.stringify(val) : val)
      return `$${allValues.length}`
    })
    const ret = this.doReturn ? ' RETURNING *' : ''
    return `INSERT INTO "${this.table}" (${cols}) VALUES (${placeholders.join(', ')})${ret}`
  }

  private buildUpdate(allValues: unknown[]): string {
    const data = this.payload as Record<string, unknown>
    const sets = Object.entries(data).map(([k, v]) => {
      allValues.push(typeof v === 'object' && v !== null && !Array.isArray(v) ? JSON.stringify(v) : v)
      return `"${k}" = $${allValues.length}`
    })
    const ret = this.doReturn ? ' RETURNING *' : ''
    return (
      `UPDATE "${this.table}" SET ${sets.join(', ')}` +
      this.buildWhere(allValues) +
      ret
    )
  }

  private buildDelete(allValues: unknown[]): string {
    const ret = this.doReturn ? ' RETURNING *' : ''
    return `DELETE FROM "${this.table}"` + this.buildWhere(allValues) + ret
  }

  private buildUpsert(allValues: unknown[]): string {
    const row = Array.isArray(this.payload) ? this.payload[0] : this.payload!
    const keys = Object.keys(row)
    const cols = keys.map(k => `"${k}"`).join(', ')
    const placeholders = keys.map(k => {
      const val = row[k]
      allValues.push(typeof val === 'object' && val !== null && !Array.isArray(val) ? JSON.stringify(val) : val)
      return `$${allValues.length}`
    })
    // Support comma-separated multi-column conflict keys (e.g. 'case_id,run_number,model')
    const conflictCols = this.conflictCol
      ? this.conflictCol.split(',').map(c => `"${c.trim()}"`)
      : keys.map(k => `"${k}"`)
    const conflict = conflictCols.join(', ')
    const conflictSet = new Set(this.conflictCol ? this.conflictCol.split(',').map(c => c.trim()) : keys)
    const updates = keys
      .filter(k => !conflictSet.has(k))
      .map(k => `"${k}" = EXCLUDED."${k}"`)
      .join(', ')
    const ret = this.doReturn ? ' RETURNING *' : ''
    return `INSERT INTO "${this.table}" (${cols}) VALUES (${placeholders.join(', ')}) ON CONFLICT (${conflict}) DO UPDATE SET ${updates}${ret}`
  }
}
