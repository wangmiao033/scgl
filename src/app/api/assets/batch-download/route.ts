import { NextRequest, NextResponse } from 'next/server';
import { get } from '@vercel/blob';
import { Readable } from 'node:stream';
import { db, ensureDatabaseReady } from '@/lib/db';
import { ZipArchive } from 'archiver';

function safeArchiveName(name: string, index: number) {
  const normalized = name.replace(/\\/g, '/');
  const baseName = normalized.split('/').pop()?.replace(/\0/g, '') || `file-${index + 1}`;
  return baseName || `file-${index + 1}`;
}

export async function POST(request: NextRequest) {
  try {
    await ensureDatabaseReady();
    const body = await request.json();
    const { ids } = body as { ids: string[] };

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No ids provided' }, { status: 400 });
    }

    if (ids.length > 200) {
      return NextResponse.json({ error: 'Too many files (max 200)' }, { status: 400 });
    }

    const assets = await db.asset.findMany({
      where: { id: { in: ids } },
    });

    if (assets.length === 0) {
      return NextResponse.json({ error: 'No assets found' }, { status: 404 });
    }

    const readable = new ReadableStream({
      start(controller) {
        const archive = new ZipArchive({ zlib: { level: 5 } });

        archive.on('data', (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk));
        });
        archive.on('end', () => controller.close());
        archive.on('error', (err: Error) => controller.error(err));

        void (async () => {
          try {
            for (const [index, asset] of assets.entries()) {
              const blobResult = await get(`assets/${asset.fileName}`, { access: 'private' });
              if (blobResult?.statusCode === 200) {
                archive.append(Readable.fromWeb(blobResult.stream as any), {
                  name: safeArchiveName(asset.originalName, index),
                });
              }
            }
            archive.finalize();
          } catch (error) {
            archive.abort();
            controller.error(error);
          }
        })();
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
    return NextResponse.json({ error: 'Failed to create download' }, { status: 500 });
  }
}
