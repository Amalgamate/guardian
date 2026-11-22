import { readdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Pool } = pg
const migrationsPath = resolve(dirname(fileURLToPath(import.meta.url)), 'migrations')

export function createDatabase({ connectionString, ssl = false }) {
  if (!connectionString) throw new Error('DATABASE_URL is required. Set it in .env to connect to PostgreSQL.')
  const pool = new Pool({
    connectionString,
    ssl: ssl ? { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== 'false' } : undefined,
    max: Number(process.env.PG_POOL_MAX || 10),
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    application_name: 'guardian-exams-api',
  })
  pool.on('error', (error) => console.error('Unexpected idle PostgreSQL client error:', error.message))

  const database = {
    query: (text, values = []) => pool.query(text, values),
    one: async (text, values = []) => (await pool.query(text, values)).rows[0],
    many: async (text, values = []) => (await pool.query(text, values)).rows,
    async transaction(work) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const result = await work({
          query: (text, values = []) => client.query(text, values),
          one: async (text, values = []) => (await client.query(text, values)).rows[0],
          many: async (text, values = []) => (await client.query(text, values)).rows,
        })
        await client.query('COMMIT')
        return result
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    },
    async migrate() {
      await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`)
      const files = (await readdir(migrationsPath)).filter((name) => name.endsWith('.sql')).sort()
      for (const version of files) {
        const applied = await database.transaction(async (client) => {
          await client.query('SELECT pg_advisory_xact_lock(74291, 1)')
          if (await client.one('SELECT 1 FROM schema_migrations WHERE version=$1', [version])) return false
          const sql = await readFile(resolve(migrationsPath, version), 'utf8')
          await client.query(sql)
          await client.query('INSERT INTO schema_migrations(version) VALUES($1)', [version])
          return true
        })
        if (applied) console.info(`PostgreSQL migration applied: ${version}`)
      }
    },
    end: () => pool.end(),
  }
  return database
}
