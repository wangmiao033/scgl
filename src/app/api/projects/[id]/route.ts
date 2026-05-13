import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// PUT /api/projects/[id] - Rename/update a project
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, description } = body as { name?: string; description?: string };

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
    }

    const project = await db.project.findUnique({ where: { id } });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const updated = await db.project.update({
      where: { id },
      data: {
        name: name.trim(),
        description: description !== undefined ? (description?.trim() || null) : project.description,
      },
    });

    return NextResponse.json({ project: updated });
  } catch (error) {
    console.error('Update project error:', error);
    return NextResponse.json(
      { error: 'Failed to update project' },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[id] - Delete project and unlink its assets
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const project = await db.project.findUnique({ where: { id } });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Unlink all assets from this project (set projectId to null)
    const result = await db.asset.updateMany({
      where: { projectId: id },
      data: { projectId: null },
    });

    // Delete the project
    await db.project.delete({ where: { id } });

    return NextResponse.json({ success: true, unlinkedCount: result.count });
  } catch (error) {
    console.error('Delete project error:', error);
    return NextResponse.json(
      { error: 'Failed to delete project' },
      { status: 500 }
    );
  }
}
