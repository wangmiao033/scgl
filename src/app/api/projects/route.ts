import { NextRequest, NextResponse } from 'next/server';
import { db, ensureDatabaseReady } from '@/lib/db';

// POST /api/projects - Create a project
export async function POST(request: NextRequest) {
  try {
    await ensureDatabaseReady();
    const body = await request.json();
    const { name, description } = body as { name: string; description?: string };

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
    }

    const project = await db.project.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
      },
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    console.error('Create project error:', error);
    return NextResponse.json(
      { error: 'Failed to create project' },
      { status: 500 }
    );
  }
}

// GET /api/projects - List all projects with asset count
export async function GET() {
  try {
    await ensureDatabaseReady();
    const projects = await db.project.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { assets: true },
        },
      },
    });

    return NextResponse.json({ projects });
  } catch (error) {
    console.error('List projects error:', error);
    return NextResponse.json(
      { error: 'Failed to list projects' },
      { status: 500 }
    );
  }
}
