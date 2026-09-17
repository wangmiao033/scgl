import { NextRequest, NextResponse } from 'next/server';
import { del, put } from '@vercel/blob';
import sharp from 'sharp';
import { db, ensureDatabaseReady } from '@/lib/db';
import { ACCEPTED_EXTENSIONS, getFileExtension } from '@/lib/file-utils';

export const runtime = 'nodejs';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const THUMB_TARGET_WIDTH = 300;
const THUMBNAIL_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'tif',
]);

function isAllowedOrigin(origin: string | null) {
  if (!origin) return true;
  if (origin === 'https://qdsc.hnchpower.cn') return true;
  if (/^https:\/\/(qdsc|sccc-ggb)(?:-[a-z0-9-]+)*-wangmiao033s-projects\.vercel\.app$/i.test(origin)) return true;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;
  return false;
}

function corsHeaders(origin: string | null) {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origin && isAllowedOrigin(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function json(request: NextRequest, body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...corsHeaders(request.headers.get('origin')),
      ...(init?.headers || {}),
    },
  });
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!isAllowedOrigin(origin)) {
    return new NextResponse(null, { status: 403, headers: corsHeaders(origin) });
  }
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!isAllowedOrigin(origin)) {
    return json(request, { error: 'Origin not allowed' }, { status: 403 });
  }

  try {
    await ensureDatabaseReady();
    const [projects, channels] = await Promise.all([
      db.project.findMany({
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, description: true },
      }),
      db.channel.findMany({
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, description: true, projectId: true },
      }),
    ]);

    return json(request, { projects, channels });
  } catch (error) {
    console.error('[external-import/qdsc GET]', error);
    return json(request, { error: 'Failed to load asset library destinations' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!isAllowedOrigin(origin)) {
    return json(request, { error: 'Origin not allowed' }, { status: 403 });
  }

  let assetPath: string | null = null;
  let thumbnailPath: string | null = null;

  try {
    await ensureDatabaseReady();
    const formData = await request.formData();
    const file = formData.get('file');
    const projectIdValue = String(formData.get('projectId') || '').trim();
    const channelIdValue = String(formData.get('channelId') || '').trim();
    const projectId = projectIdValue || null;
    const channelId = channelIdValue || null;

    if (!(file instanceof File)) {
      return json(request, { error: 'No file received' }, { status: 400 });
    }
    if (file.size <= 0) {
      return json(request, { error: 'Empty file' }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return json(request, { error: `File exceeds ${MAX_FILE_BYTES / 1024 / 1024}MB limit` }, { status: 413 });
    }

    const originalName = file.name || 'image.png';
    const ext = getFileExtension(originalName);
    if (!ACCEPTED_EXTENSIONS.has(ext)) {
      return json(request, { error: 'Unsupported file type' }, { status: 400 });
    }

    let resolvedProjectId = projectId;
    if (resolvedProjectId) {
      const project = await db.project.findUnique({ where: { id: resolvedProjectId } });
      if (!project) return json(request, { error: 'Project not found' }, { status: 400 });
    }

    if (channelId) {
      const channel = await db.channel.findUnique({ where: { id: channelId } });
      if (!channel) return json(request, { error: 'Channel not found' }, { status: 400 });
      if (!resolvedProjectId) resolvedProjectId = channel.projectId;
      if (channel.projectId !== resolvedProjectId) {
        return json(request, { error: 'Channel does not belong to project' }, { status: 400 });
      }
    }

    const uniqueFileName = `${crypto.randomUUID()}.${ext}`;
    assetPath = `assets/${uniqueFileName}`;

    const bytes = Buffer.from(await file.arrayBuffer());
    await put(assetPath, bytes, {
      access: 'private',
      addRandomSuffix: false,
      contentType: file.type || 'application/octet-stream',
    });

    let width: number | null = null;
    let height: number | null = null;

    if (THUMBNAIL_EXTENSIONS.has(ext)) {
      try {
        const image = sharp(bytes);
        const metadata = await image.metadata();
        width = metadata.width ?? null;
        height = metadata.height ?? null;

        const thumbnail = await image
          .resize({ width: THUMB_TARGET_WIDTH, withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer();

        thumbnailPath = `thumbnails/${uniqueFileName}.webp`;
        await put(thumbnailPath, thumbnail, {
          access: 'private',
          addRandomSuffix: false,
          contentType: 'image/webp',
        });
      } catch (thumbnailError) {
        console.warn('[external-import/qdsc] thumbnail skipped', thumbnailError);
      }
    }

    const asset = await db.asset.create({
      data: {
        fileName: uniqueFileName,
        originalName,
        fileSize: file.size,
        mimeType: file.type || 'application/octet-stream',
        width,
        height,
        filePath: `/api/upload/assets/${uniqueFileName}`,
        projectId: resolvedProjectId,
        channelId,
      },
    });

    return json(request, { ok: true, asset }, { status: 201 });
  } catch (error) {
    if (assetPath) await del(assetPath).catch(() => undefined);
    if (thumbnailPath) await del(thumbnailPath).catch(() => undefined);
    console.error('[external-import/qdsc POST]', error);
    return json(request, {
      error: error instanceof Error ? error.message : 'Failed to import asset',
    }, { status: 500 });
  }
}
