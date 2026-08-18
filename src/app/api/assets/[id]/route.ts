import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { db, ensureDatabaseReady } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDatabaseReady();
    const { id } = await params;
    const asset = await db.asset.findUnique({ where: { id } });

    if (!asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    return NextResponse.json({ asset });
  } catch (error) {
    console.error('Get asset error:', error);
    return NextResponse.json({ error: 'Failed to get asset' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDatabaseReady();
    const { id } = await params;
    const body = await request.json();
    const { newName, projectId, channelId } = body;

    const asset = await db.asset.findUnique({ where: { id } });
    if (!asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    const updateData: any = {};

    if (newName !== undefined) {
      if (!newName || typeof newName !== 'string') {
        return NextResponse.json({ error: 'New name is required' }, { status: 400 });
      }
      updateData.originalName = newName;
    }

    if (projectId !== undefined) {
      if (projectId !== null) {
        const project = await db.project.findUnique({ where: { id: projectId } });
        if (!project) {
          return NextResponse.json({ error: 'Project not found' }, { status: 400 });
        }
      }
      updateData.projectId = projectId;
      if (projectId === null) updateData.channelId = null;
    }

    if (channelId !== undefined) {
      if (channelId !== null) {
        const channel = await db.channel.findUnique({ where: { id: channelId } });
        if (!channel) {
          return NextResponse.json({ error: 'Channel not found' }, { status: 400 });
        }

        const effectiveProjectId = projectId !== undefined ? projectId : asset.projectId;
        if (effectiveProjectId && channel.projectId !== effectiveProjectId) {
          return NextResponse.json({ error: 'Channel does not belong to project' }, { status: 400 });
        }
        if (!effectiveProjectId) updateData.projectId = channel.projectId;
      }
      updateData.channelId = channelId;
    }

    const updated = await db.asset.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ asset: updated });
  } catch (error) {
    console.error('Update asset error:', error);
    return NextResponse.json({ error: 'Failed to update asset' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDatabaseReady();
    const { id } = await params;
    const asset = await db.asset.findUnique({ where: { id } });

    if (!asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    await del([
      `assets/${asset.fileName}`,
      `thumbnails/${asset.fileName}.webp`,
    ]);

    await db.asset.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete asset error:', error);
    return NextResponse.json({ error: 'Failed to delete asset' }, { status: 500 });
  }
}
