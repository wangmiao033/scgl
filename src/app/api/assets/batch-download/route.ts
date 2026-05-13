import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ZipArchive } from 'archiver';
import { existsSync } from 'fs';
import { resolveAssetFilePath } from '@/lib/server-paths';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids } = body as { ids: string[] };

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No ids provided' }, { status: 400 });
    }

    if (ids.length > 200) {
      return NextResponse.json({ error: 'Too many files (max 200)' }, { status: 400 });
    }

    // Get all assets to find their files
    const assets = await db.asset.findMany({
      where: { id: { in: ids } },
    });

    if (assets.length === 0) {
      return NextResponse.json({ error: 'No assets found' }, { status: 404 });
    }

    // Create a streaming ZIP response
    const readable = new ReadableStream({
      start(controller) {
        const archive = new ZipArchive({
          zlib: { level: 5 },
        });

        // Pipe archive data to the stream
        archive.on('data', (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk));
        });

        archive.on('end', () => {
          controller.close();
        });

        archive.on('error', (err: Error) => {
          console.error('Archive error:', err);
          controller.error(err);
        });

        // Add files to archive
        for (const asset of assets) {
          const fullPath = resolveAssetFilePath(asset.fileName);
          if (fullPath && existsSync(fullPath)) {
            archive.file(fullPath, { name: asset.originalName });
          }
        }

        // Finalize the archive
        archive.finalize();
      },
    });

    return new NextResponse(readable, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="assets-${Date.now()}.zip"`,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Batch download error:', error);
    return NextResponse.json(
      { error: 'Failed to create download' },
      { status: 500 }
    );
  }
}
