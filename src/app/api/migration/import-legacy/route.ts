import { NextRequest, NextResponse } from 'next/server';
import { db, ensureDatabaseReady } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const LEGACY_BASE = 'https://scgl.hnchpower.cn';
const CONFIRM = 'import-legacy-scgl-20260819';

type LegacyProject = {
  id: string;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
};

type LegacyChannel = {
  id: string;
  name: string;
  description?: string | null;
  projectId: string;
  createdAt: string;
  updatedAt: string;
};

type LegacyAsset = {
  id: string;
  fileName: string;
  originalName: string;
  fileSize: number;
  mimeType: string;
  width?: number | null;
  height?: number | null;
  filePath: string;
  projectId?: string | null;
  channelId?: string | null;
  createdAt: string;
  updatedAt: string;
};

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${LEGACY_BASE}${path}`, {
    cache: 'no-store',
    headers: { accept: 'application/json', 'user-agent': 'SCGL-Vercel-Legacy-Import/1.0' },
  });
  if (!response.ok) {
    throw new Error(`Legacy ${path} returned ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get('confirm') !== CONFIRM) {
    return NextResponse.json({ error: 'Missing confirmation' }, { status: 403 });
  }

  try {
    await ensureDatabaseReady();

    const [projectPayload, channelPayload, assetPayload] = await Promise.all([
      getJson<{ projects: LegacyProject[] }>('/api/projects'),
      getJson<{ channels: LegacyChannel[] }>('/api/channels'),
      getJson<{ assets: LegacyAsset[] }>('/api/assets'),
    ]);

    const projects = projectPayload.projects ?? [];
    const channels = channelPayload.channels ?? [];
    const assets = assetPayload.assets ?? [];

    if (!projects.length || !assets.length) {
      throw new Error('Legacy source unexpectedly returned no projects/assets');
    }

    const sourceProjectIds = new Set(projects.map((p) => p.id));
    const sourceChannelIds = new Set(channels.map((c) => c.id));

    const badChannels = channels.filter((c) => !sourceProjectIds.has(c.projectId));
    const badAssets = assets.filter((a) =>
      (a.projectId && !sourceProjectIds.has(a.projectId)) ||
      (a.channelId && !sourceChannelIds.has(a.channelId))
    );

    if (badChannels.length || badAssets.length) {
      return NextResponse.json({
        error: 'Legacy relation integrity check failed',
        badChannels: badChannels.slice(0, 10),
        badAssets: badAssets.slice(0, 10),
      }, { status: 409 });
    }

    const before = {
      projects: await db.project.count(),
      channels: await db.channel.count(),
      assets: await db.asset.count(),
    };

    // This migration target was verified empty before import. If someone adds unrelated
    // data before this route runs, refuse instead of silently mixing datasets.
    if (before.projects !== 0 || before.channels !== 0 || before.assets !== 0) {
      const existingProjectIds = new Set((await db.project.findMany({ select: { id: true } })).map((x) => x.id));
      const existingChannelIds = new Set((await db.channel.findMany({ select: { id: true } })).map((x) => x.id));
      const existingAssetIds = new Set((await db.asset.findMany({ select: { id: true } })).map((x) => x.id));
      const hasForeign =
        [...existingProjectIds].some((id) => !sourceProjectIds.has(id)) ||
        [...existingChannelIds].some((id) => !sourceChannelIds.has(id)) ||
        [...existingAssetIds].some((id) => !assets.some((a) => a.id === id));
      if (hasForeign) {
        return NextResponse.json({ error: 'Target database contains non-legacy data; refusing to mix', before }, { status: 409 });
      }
    }

    const projectRows = projects.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description ?? null,
      createdAt: new Date(p.createdAt),
      updatedAt: new Date(p.updatedAt),
    }));

    const channelRows = channels.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description ?? null,
      projectId: c.projectId,
      createdAt: new Date(c.createdAt),
      updatedAt: new Date(c.updatedAt),
    }));

    const assetRows = assets.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      originalName: a.originalName,
      fileSize: a.fileSize,
      mimeType: a.mimeType || 'application/octet-stream',
      width: a.width ?? null,
      height: a.height ?? null,
      filePath: a.filePath || `/api/upload/assets/${a.fileName}`,
      projectId: a.projectId ?? null,
      channelId: a.channelId ?? null,
      createdAt: new Date(a.createdAt),
      updatedAt: new Date(a.updatedAt),
    }));

    await db.$transaction(async (tx) => {
      await tx.project.createMany({ data: projectRows, skipDuplicates: true });
      await tx.channel.createMany({ data: channelRows, skipDuplicates: true });
      // Keep batches modest for Neon parameter limits.
      for (let i = 0; i < assetRows.length; i += 200) {
        await tx.asset.createMany({ data: assetRows.slice(i, i + 200), skipDuplicates: true });
      }
    }, { timeout: 45000 });

    const after = {
      projects: await db.project.count(),
      channels: await db.channel.count(),
      assets: await db.asset.count(),
    };

    const source = {
      projects: projects.length,
      channels: channels.length,
      assets: assets.length,
      totalBytes: assets.reduce((sum, a) => sum + Number(a.fileSize || 0), 0),
    };

    const exact =
      after.projects === source.projects &&
      after.channels === source.channels &&
      after.assets === source.assets;

    return NextResponse.json({
      success: exact,
      legacyBase: LEGACY_BASE,
      source,
      before,
      after,
      exactCountMatch: exact,
    }, { status: exact ? 200 : 409 });
  } catch (error) {
    console.error('Legacy import error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Legacy import failed',
    }, { status: 500 });
  }
}
