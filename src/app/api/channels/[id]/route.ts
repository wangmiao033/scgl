import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/channels/[id] - Get single channel
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const channel = await db.channel.findUnique({
      where: { id },
      include: {
        _count: {
          select: { assets: true },
        },
      },
    });

    if (!channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    return NextResponse.json({
      channel: {
        id: channel.id,
        name: channel.name,
        description: channel.description,
        projectId: channel.projectId,
        createdAt: channel.createdAt.toISOString(),
        updatedAt: channel.updatedAt.toISOString(),
        _count: channel._count,
      },
    });
  } catch (error) {
    console.error('Get channel error:', error);
    return NextResponse.json(
      { error: 'Failed to get channel' },
      { status: 500 }
    );
  }
}

// PUT /api/channels/[id] - Update channel
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, description } = body as { name?: string; description?: string };

    const channel = await db.channel.findUnique({ where: { id } });
    if (!channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    const updateData: any = {};
    if (name !== undefined) {
      if (!name || typeof name !== 'string') {
        return NextResponse.json({ error: 'Name is required' }, { status: 400 });
      }
      updateData.name = name.trim();
    }
    if (description !== undefined) {
      updateData.description = description === '' ? null : description.trim();
    }

    const updated = await db.channel.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      channel: {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        projectId: updated.projectId,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Update channel error:', error);
    return NextResponse.json(
      { error: 'Failed to update channel' },
      { status: 500 }
    );
  }
}

// DELETE /api/channels/[id] - Delete channel and unlink its assets
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const channel = await db.channel.findUnique({ where: { id } });
    if (!channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    // Unlink assets from this channel
    const unlinkResult = await db.asset.updateMany({
      where: { channelId: id },
      data: { channelId: null },
    });

    // Delete the channel
    await db.channel.delete({ where: { id } });

    return NextResponse.json({ success: true, unlinkedCount: unlinkResult.count });
  } catch (error) {
    console.error('Delete channel error:', error);
    return NextResponse.json(
      { error: 'Failed to delete channel' },
      { status: 500 }
    );
  }
}
