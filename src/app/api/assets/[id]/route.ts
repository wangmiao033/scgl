import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { unlink } from 'fs/promises';
import { existsSync } from 'fs';
import {
  assetFileCandidates,
  thumbnailFileCandidates,
} from '@/lib/server-paths';

// GET /api/assets/[id] - Get single asset
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const asset = await db.asset.findUnique({
      where: { id },
    });

    if (!asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    return NextResponse.json({ asset });
  } catch (error) {
    console.error('Get asset error:', error);
    return NextResponse.json(
      { error: 'Failed to get asset' },
      { status: 500 }
    );
  }
}

// PUT /api/assets/[id] - Rename an asset or move to a project
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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
      // Allow null to unassign, or a valid project ID
      if (projectId !== null) {
        // Verify project exists
        const project = await db.project.findUnique({ where: { id: projectId } });
        if (!project) {
          return NextResponse.json({ error: 'Project not found' }, { status: 400 });
        }
      }
      updateData.projectId = projectId;
    }

    if (channelId !== undefined) {
      if (channelId !== null) {
        const channel = await db.channel.findUnique({ where: { id: channelId } });
        if (!channel) {
          return NextResponse.json({ error: 'Channel not found' }, { status: 400 });
        }
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
    return NextResponse.json(
      { error: 'Failed to update asset' },
      { status: 500 }
    );
  }
}

// DELETE /api/assets/[id] - Delete an asset
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const asset = await db.asset.findUnique({ where: { id } });

    if (!asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    // Delete file from filesystem
    const fullPath = assetFileCandidates(asset.fileName)[0];
    if (existsSync(fullPath)) {
      await unlink(fullPath);
    }

    // Delete thumbnail if exists
    const thumbPath = thumbnailFileCandidates(asset.fileName)[0];
    if (existsSync(thumbPath)) {
      await unlink(thumbPath);
    }

    // Delete from database
    await db.asset.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete asset error:', error);
    return NextResponse.json(
      { error: 'Failed to delete asset' },
      { status: 500 }
    );
  }
}
