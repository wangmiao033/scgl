import { NextRequest, NextResponse } from 'next/server';
import { get } from '@vercel/blob';
import { db, ensureDatabaseReady } from '@/lib/db';

function isValidFilename(filename: string) {
  return !!filename && !filename.includes('..') && !filename.includes('/') && !filename.includes('\\');
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    if (!isValidFilename(filename)) {
      return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
    }

    const result = await get(`assets/${filename}`, {
      access: 'private',
      ifNoneMatch: request.headers.get('if-none-match') ?? undefined,
    });

    if (!result) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    if (result.statusCode === 304) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: result.blob.etag,
          'Cache-Control': 'private, no-cache',
        },
      });
    }

    if (result.statusCode !== 200) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const isDownload = request.nextUrl.searchParams.get('download') === '1';
    const headers: Record<string, string> = {
      'Content-Type': result.blob.contentType || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      ETag: result.blob.etag,
      'Cache-Control': 'private, no-cache',
    };

    if (isDownload) {
      await ensureDatabaseReady();
      const asset = await db.asset.findFirst({
        where: { fileName: filename },
        select: { originalName: true },
      });
      const downloadName = asset?.originalName || filename;
      headers['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`;
    }

    return new NextResponse(result.stream, { status: 200, headers });
  } catch (error) {
    console.error('Serve file error:', error);
    return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 });
  }
}
