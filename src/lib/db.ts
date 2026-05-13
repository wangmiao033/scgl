import { PrismaClient } from '@prisma/client'
import { copyFileSync, existsSync, mkdirSync } from 'fs'
import path from 'path'

function ensureDatabaseUrl() {
  if (process.env.DATABASE_URL) return

  const bundledDbPath = path.join(process.cwd(), 'db', 'custom.db')
  const dbPath = process.env.VERCEL
    ? path.join('/tmp', 'scgl', 'custom.db')
    : bundledDbPath

  if (process.env.VERCEL) {
    mkdirSync(path.dirname(dbPath), { recursive: true })
    if (!existsSync(dbPath) && existsSync(bundledDbPath)) {
      copyFileSync(bundledDbPath, dbPath)
    }
  }

  process.env.DATABASE_URL = `file:${dbPath}`
}

ensureDatabaseUrl()

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
