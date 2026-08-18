import { NextRequest, NextResponse } from 'next/server';
import { del, get, put } from '@vercel/blob';
import sharp from 'sharp';
import { db, ensureDatabaseReady } from '@/lib/db';
import { ACCEPTED_EXTENSIONS, getFileExtension } from '@/lib/file-utils';

const THUMB_TARGET_WIDTH = 300;
const MAX_IMAGE_PROCESSING_BYTES = 25 * 1024 * 1024;
const THUMBNAIL_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'tif',
]);

type RegisterBody = {
  pathname?: string;
  originalName?: string;
  fileSize?: number;
  mimeType?: string;
  projectId?: string | null;
  channelId?: string | null;
};

async function cleanupUploadedBlob(pathname: string, fileName: string) {
  await Promise.allSettled([
    del(pathname),
    del(`thumbnails/${fileName}.webp`),
  ]);
}

export async function POST(request: NextRequest) {
  let pathname: string | null = null;
  let fileName: string | null = null;
  let registered = false;

  try {
    await ensureDatabaseReady();
    const body = (await request.json()) as RegisterBody;
    pathname = body.pathname ?? null;

    if (!pathname?.startsWith('assets/')) {
      return NextResponse.json({ error: 'Invalid upload path' }, { status: 400 });
    }

    fileName = pathname.slice('assets/'.length);
    if (!fileName || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      await cleanupUploadedBlob(pathname, fileName || 'invalid');
      return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
    }

    const ext = getFileExtension(fileName);
    if (!ACCEPTED_EXTENSIONS.has(ext)) {
      await cleanupUploadedBlob(pathname, fileName);
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
    }

    if (!body.originalName || typeof body.originalName !== 'string') {
      await cleanupUploadedBlob(pathname, fileName);
      return NextResponse.json({ error: 'Original filename is required' }, { status: 400 });
    }

    if (!Number.isFinite(body.fileSize) || (body.fileSize as number) < 0 || (body.fileSize as number) > 2147483647) {
      await cleanupUploadedBlob(pathname, fileName);
      return NextResponse.json({ error: 'Invalid file size' }, { status: 400 });
    }

    let projectId = body.projectId || null;
    const channelId = body.channelId || null;

    if (projectId) {
      const project = await db.project.findUnique({ where: { id: projectId } });
      if (!project) {
        await cleanupUploadedBlob(pathname, fileName);
        return NextResponse.json({ error: 'Project not found' }, { status: 400 });
      }
    }

    if (channelId) {
      const channel = await db.channel.findUnique({ where: { id: channelId } });
      if (!channel) {
        await cleanupUploadedBlob(pathname, fileName);
        return NextResponse.json({ error: 'Channel not found' }, { status: 400 });
      }

      if (!projectId) projectId = channel.projectId;
      if (channel.projectId !== projectId) {
        await cleanupUploadedBlob(pathname, fileName);
        return NextResponse.json({ error: 'Channel does not belong to project' }, { status: 400 });
      }
    }

    const blobResult = await get(pathname, { access: 'private' });
    if (!blobResult || blobResult.statusCode !== 200) {
      return NextResponse.json({ error: 'Uploaded blob not found' }, { status: 404 });
    }

    let width: number | null = null;
    let height: number | null = null;

    if (THUMBNAIL_EXTENSIONS.has(ext) && (body.fileSize as number) <= MAX_IMAGE_PROCESSING_BYTES) {
      try {
        const buffer = Buffer.from(await new Response(blobResult.stream).arrayBuffer());
        const image = sharp(buffer);
        const metadata = await image.metadata();
        width = metadata.width ?? null;
        height = metadata.height ?? null;

        const thumbnail = await image
          .resize({ width: THUMB_TARGET_WIDTH, withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer();

        await put(`thumbnails/${fileName}.webp`, thumbnail, {
          access: 'private',
          addRandomSuffix: false,
          contentType: 'image/webp',
        });
      } catch (thumbnailError) {
        console.warn('Thumbnail generation skipped:', thumbnailError);
      }
    }

    const asset = await db.asset.create({
      data: {
        fileName,
        originalName: body.originalName,
        fileSize: Math.trunc(body.fileSize as number),
        mimeType: body.mimeType || blobResult.blob.contentType || 'application/octet-stream',
        width,
        height,
        filePath: `/api/upload/assets/${fileName}`,
        projectId,
        channelId,
      },
    });

    registered = true;
    return NextResponse.json({ asset });
  } catch (error) {
    if (!registered && pathname && fileName) {
      await cleanupUploadedBlob(pathname, fileName);
    }
    console.error('Register asset error:', error);
    return NextResponse.json({ error: 'Failed to register uploaded file' }, { status: 500 });
  }
}
