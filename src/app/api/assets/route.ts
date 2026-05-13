import { NextRequest, NextResponse } from 'next/server';
import { db, ensureDatabaseReady } from '@/lib/db';
import { unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { UPLOAD_DIR, THUMBNAIL_DIR } from '@/lib/config';

export async function GET(request: NextRequest) {
  try {
    await ensureDatabaseReady();
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const sortBy = searchParams.get('sortBy') || 'date';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    const projectId = searchParams.get('projectId') || null;

    // Build where clause
    const where: any = {};

    // Project filter
    if (projectId === 'unassigned') {
      where.projectId = null;
    } else if (projectId && projectId !== 'all') {
      where.projectId = projectId;
    }
    // If 'all' or null, no project filter is applied

    // Channel filter
    const channelId = searchParams.get('channelId') || null;
    if (channelId === 'unassigned') {
      where.channelId = null;
    } else if (channelId) {
      where.channelId = channelId;
    }

    // Search filter
    if (search) {
      where.OR = [
        { originalName: { contains: search } },
        { fileName: { contains: search } },
      ];
    }

    // Build orderBy clause
    let orderBy: any = { createdAt: 'desc' };
    if (sortBy === 'name') {
      orderBy = { originalName: sortOrder === 'asc' ? 'asc' : 'desc' };
    } else if (sortBy === 'size') {
      orderBy = { fileSize: sortOrder === 'asc' ? 'asc' : 'desc' };
    } else if (sortBy === 'date') {
      orderBy = { createdAt: sortOrder === 'asc' ? 'asc' : 'desc' };
    } else if (sortBy === 'type') {
      orderBy = { mimeType: sortOrder === 'asc' ? 'asc' : 'desc' };
    }

    const assets = await db.asset.findMany({
      where,
      orderBy,
    });

    return NextResponse.json({ assets });
  } catch (error) {
    console.error('List assets error:', error);
    return NextResponse.json(
      { error: 'Failed to list assets' },
      { status: 500 }
    );
  }
}

// Batch delete
export async function DELETE(request: NextRequest) {
  try {
    await ensureDatabaseReady();
    const body = await request.json();
    const { ids } = body as { ids: string[] };

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No ids provided' }, { status: 400 });
    }

    // Get all assets to find their files
    const assets = await db.asset.findMany({
      where: { id: { in: ids } },
    });

    // Delete files and thumbnails from disk
    const deleteFilePromises = assets.map(async (asset) => {
      const fullPath = path.join(UPLOAD_DIR, asset.fileName);
      if (existsSync(fullPath)) {
        try {
          await unlink(fullPath);
        } catch {
          // Ignore file deletion errors
        }
      }
      // Also delete thumbnail if exists
      const thumbPath = path.join(THUMBNAIL_DIR, asset.fileName);
      if (existsSync(thumbPath)) {
        try {
          await unlink(thumbPath);
        } catch {
          // Ignore thumbnail deletion errors
        }
      }
    });
    await Promise.all(deleteFilePromises);

    // Delete from database
    const result = await db.asset.deleteMany({
      where: { id: { in: ids } },
    });

    return NextResponse.json({ success: true, deletedCount: result.count });
  } catch (error) {
    console.error('Batch delete error:', error);
    return NextResponse.json(
      { error: 'Failed to delete assets' },
      { status: 500 }
    );
  }
}
