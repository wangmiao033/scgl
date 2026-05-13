import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { IMAGE_EXTENSIONS, getFileExtension } from '@/lib/file-utils';

const UPLOAD_DIR = '/home/z/my-project/upload/assets';
const THUMBNAIL_DIR = '/home/z/my-project/upload/thumbnails';
const THUMB_TARGET_WIDTH = 300;

// Image extensions that support thumbnail generation via sharp
const THUMBNAIL_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'tif']);

async function ensureUploadDir() {
  if (!existsSync(UPLOAD_DIR)) {
    await mkdir(UPLOAD_DIR, { recursive: true });
  }
  if (!existsSync(THUMBNAIL_DIR)) {
    await mkdir(THUMBNAIL_DIR, { recursive: true });
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureUploadDir();

    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const projectId = formData.get('projectId') as string | null;
    const channelId = formData.get('channelId') as string | null;

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    // Validate projectId if provided
    if (projectId) {
      const project = await db.project.findUnique({ where: { id: projectId } });
      if (!project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 400 });
      }
    }

    // Validate channelId if provided
    if (channelId) {
      const channel = await db.channel.findUnique({ where: { id: channelId } });
      if (!channel) {
        return NextResponse.json({ error: 'Channel not found' }, { status: 400 });
      }
    }

    const results = [];

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = getFileExtension(file.name);
      const uniqueFileName = `${uuidv4()}.${ext}`;
      const filePath = path.join(UPLOAD_DIR, uniqueFileName);

      // Save file to disk
      await writeFile(filePath, buffer);

      // Extract image dimensions with sharp
      let width: number | null = null;
      let height: number | null = null;

      if (IMAGE_EXTENSIONS.has(ext) && ext !== 'svg') {
        try {
          const metadata = await sharp(filePath).metadata();
          width = metadata.width ?? null;
          height = metadata.height ?? null;
        } catch {
          // Sharp can't process this file, skip dimension extraction
        }
      }

      // Generate thumbnail for supported image types
      if (THUMBNAIL_EXTENSIONS.has(ext)) {
        try {
          const thumbnailPath = path.join(THUMBNAIL_DIR, uniqueFileName);
          await sharp(filePath)
            .resize({ width: THUMB_TARGET_WIDTH, withoutEnlargement: true })
            .toFile(thumbnailPath);
        } catch {
          // Thumbnail generation failed, skip
        }
      }

      // Store in database
      const asset = await db.asset.create({
        data: {
          fileName: uniqueFileName,
          originalName: file.name,
          fileSize: file.size,
          mimeType: file.type || 'application/octet-stream',
          width,
          height,
          filePath: `/api/upload/assets/${uniqueFileName}`,
          projectId: projectId || null,
          channelId: channelId || null,
        },
      });

      results.push(asset);
    }

    return NextResponse.json({ assets: results, count: results.length });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload files' },
      { status: 500 }
    );
  }
}
