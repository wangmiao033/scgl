import { PrismaClient } from '@prisma/client'
import { mkdirSync } from 'fs'
import path from 'path'

function ensureDatabaseUrl() {
  if (!process.env.DATABASE_URL) {
    const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data')
    process.env.DATABASE_URL = `file:${path.join(dataDir, 'custom.db')}`
  }

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl?.startsWith('file:')) return

  const databasePath = databaseUrl.slice('file:'.length).split('?')[0]
  const resolvedPath = path.isAbsolute(databasePath)
    ? databasePath
    : path.join(process.cwd(), databasePath)

  mkdirSync(path.dirname(resolvedPath), { recursive: true })
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

let databaseReadyPromise: Promise<void> | null = null

export function ensureDatabaseReady() {
  if (!databaseReadyPromise) {
    databaseReadyPromise = initializeSqliteSchema().catch((error) => {
      databaseReadyPromise = null
      throw error
    })
  }

  return databaseReadyPromise
}

async function initializeSqliteSchema() {
  await db.$executeRawUnsafe('PRAGMA foreign_keys = ON')

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "User" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "email" TEXT NOT NULL,
      "name" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await db.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email")
  `)

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Post" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "title" TEXT NOT NULL,
      "content" TEXT,
      "published" BOOLEAN NOT NULL DEFAULT false,
      "authorId" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Project" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Channel" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "projectId" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Channel_projectId_fkey"
        FOREIGN KEY ("projectId") REFERENCES "Project" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE
    )
  `)

  await db.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Channel_projectId_idx" ON "Channel"("projectId")
  `)

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Asset" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "fileName" TEXT NOT NULL,
      "originalName" TEXT NOT NULL,
      "fileSize" INTEGER NOT NULL,
      "mimeType" TEXT NOT NULL,
      "width" INTEGER,
      "height" INTEGER,
      "filePath" TEXT NOT NULL,
      "projectId" TEXT,
      "channelId" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Asset_projectId_fkey"
        FOREIGN KEY ("projectId") REFERENCES "Project" ("id")
        ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "Asset_channelId_fkey"
        FOREIGN KEY ("channelId") REFERENCES "Channel" ("id")
        ON DELETE SET NULL ON UPDATE CASCADE
    )
  `)

  await db.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Asset_projectId_idx" ON "Asset"("projectId")
  `)

  await db.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Asset_channelId_idx" ON "Asset"("channelId")
  `)
}
