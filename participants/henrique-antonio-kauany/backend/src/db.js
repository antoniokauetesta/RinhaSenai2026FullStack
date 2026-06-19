import { PrismaLibSQL } from '@prisma/adapter-libsql'
import { createClient } from '@libsql/client'
import { PrismaClient } from '../generated/prisma/index.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Resolve absolute path for the sqlite file regardless of cwd
const dbUrl = process.env.DATABASE_URL || 'file:../data.db'
const dbPath = dbUrl.startsWith('file:') ? dbUrl.slice('file:'.length) : dbUrl
const absoluteDbPath = path.isAbsolute(dbPath)
  ? dbPath
  : path.resolve(__dirname, '..', dbPath)

export const libsql = createClient({
  url: `file:${absoluteDbPath}`,
})

async function tuneSqlite() {
  await libsql.execute('PRAGMA journal_mode = WAL')
  await libsql.execute('PRAGMA busy_timeout = 10000')
  await libsql.execute('PRAGMA synchronous = NORMAL')
  await libsql.execute('PRAGMA cache_size = -64000') // 64MB
  await libsql.execute('PRAGMA temp_store = MEMORY')
}

await tuneSqlite()

const adapter = new PrismaLibSQL(libsql)

export const prisma = new PrismaClient({ adapter })
