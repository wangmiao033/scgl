import { NextRequest, NextResponse } from 'next/server';
import { db, ensureDatabaseReady } from '@/lib/db';

// PUT /api/assets/batch-move - Move multiple assets to a project
export async function PUT(request: NextRequest) {
  try {
    await ensureDatabaseReady();
    const body = await request.json();
    const { ids, projectId, channelId } = body as { ids: string[]; projectId: string | null; channelId?: string | null };

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No ids provided' }, { status: 400 });
    }

    // If projectId is provided (not null), verify the project exists
    if (projectId) {
      const project = await db.project.findUnique({ where: { id: projectId } });
      if (!project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 400 });
      }
    }

    // If channelId is provided (not null), verify the channel exists
    if (channelId) {
      const channel = await db.channel.findUnique({ where: { id: channelId } });
      if (!channel) {
        return NextResponse.json({ error: 'Channel not found' }, { status: 400 });
      }
    }

    const data: any = { projectId };
    if (channelId !== undefined) {
      data.channelId = channelId;
    }

    const result = await db.asset.updateMany({
      where: { id: { in: ids } },
      data,
    });

    return NextResponse.json({ success: true, updatedCount: result.count });
  } catch (error) {
    console.error('Batch move error:', error);
    return NextResponse.json(
      { error: 'Failed to move assets' },
      { status: 500 }
    );
  }
}
