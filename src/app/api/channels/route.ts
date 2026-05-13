import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/channels - List channels (optional projectId filter)
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('projectId');

    const where: any = {};
    if (projectId) {
      where.projectId = projectId;
    }

    const channels = await db.channel.findMany({
      where,
      include: {
        _count: {
          select: { assets: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const channelsWithCount = channels.map((ch) => ({
      id: ch.id,
      name: ch.name,
      description: ch.description,
      projectId: ch.projectId,
      createdAt: ch.createdAt.toISOString(),
      updatedAt: ch.updatedAt.toISOString(),
      _count: ch._count,
    }));

    return NextResponse.json({ channels: channelsWithCount });
  } catch (error) {
    console.error('List channels error:', error);
    return NextResponse.json(
      { error: 'Failed to list channels' },
      { status: 500 }
    );
  }
}

// POST /api/channels - Create a channel
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, projectId, description } = body as {
      name: string;
      projectId: string;
      description?: string;
    };

    if (!name || !projectId) {
      return NextResponse.json(
        { error: 'Name and projectId are required' },
        { status: 400 }
      );
    }

    // Verify project exists
    const project = await db.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 400 }
      );
    }

    const channel = await db.channel.create({
      data: {
        name: name.trim(),
        projectId,
        description: description?.trim() || null,
      },
    });

    return NextResponse.json(
      {
        channel: {
          id: channel.id,
          name: channel.name,
          description: channel.description,
          projectId: channel.projectId,
          createdAt: channel.createdAt.toISOString(),
          updatedAt: channel.updatedAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create channel error:', error);
    return NextResponse.json(
      { error: 'Failed to create channel' },
      { status: 500 }
    );
  }
}
