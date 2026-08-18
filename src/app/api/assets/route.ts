import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { db, ensureDatabaseReady } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    await ensureDatabaseReady();
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const sortBy = searchParams.get('sortBy') || 'date';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    const projectId = searchParams.get('projectId') || null;

    const where: any = {};

    if (projectId === 'unassigned') {
      where.projectId = null;
    } else if (projectId && projectId !== 'all') {
      where.projectId = projectId;
    }

    const channelId = searchParams.get('channelId') || null;
    if (channelId === 'unassigned') {
      where.channelId = null;
    } else if (channelId) {
      where.channelId = channelId;
    }

    if (search) {
      where.OR = [
        { originalName: { contains: search, mode: 'insensitive' } },
        { fileName: { contains: search, mode: 'insensitive' } },
      ];
    }

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

    const assets = await db.asset.findMany({ where, orderBy });
    return NextResponse.json({ assets });
  } catch (error) {
    console.error('List assets error:', error);
    return NextResponse.json({ error: 'Failed to list assets' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await ensureDatabaseReady();
    const body = await request.json();
    const { ids } = body as { ids: string[] };

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No ids provided' }, { status: 400 });
    }

    const assets = await db.asset.findMany({
      where: { id: { in: ids } },
    });

    const blobPaths = assets.flatMap((asset) => [
      `assets/${asset.fileName}`,
      `thumbnails/${asset.fileName}.webp`,
    ]);

    if (blobPaths.length > 0) {
      await del(blobPaths);
    }

    const result = await db.asset.deleteMany({
      where: { id: { in: ids } },
    });

    return NextResponse.json({ success: true, deletedCount: result.count });
  } catch (error) {
    console.error('Batch delete error:', error);
    return NextResponse.json({ error: 'Failed to delete assets' }, { status: 500 });
  }
}
