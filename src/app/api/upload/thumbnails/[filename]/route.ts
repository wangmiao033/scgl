import { NextRequest, NextResponse } from 'next/server';
import { get } from '@vercel/blob';

const LEGACY_ASSET_BASE = 'https://files.hnchpower.cn/assets/';

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

    const ifNoneMatch = request.headers.get('if-none-match') ?? undefined;

    try {
      let result = await get(`thumbnails/${filename}.webp`, {
        access: 'private',
        ifNoneMatch,
      });

      if (!result || (result.statusCode !== 200 && result.statusCode !== 304)) {
        result = await get(`assets/${filename}`, {
          access: 'private',
          ifNoneMatch,
        });
      }

      if (result?.statusCode === 304) {
        return new NextResponse(null, {
          status: 304,
          headers: {
            ETag: result.blob.etag,
            'Cache-Control': 'private, no-cache',
          },
        });
      }

      if (result?.statusCode === 200) {
        return new NextResponse(result.stream, {
          status: 200,
          headers: {
            'Content-Type': result.blob.contentType || 'application/octet-stream',
            'X-Content-Type-Options': 'nosniff',
            ETag: result.blob.etag,
            'Cache-Control': 'private, no-cache',
          },
        });
      }
    } catch {
      // Legacy records are not expected to exist in Vercel Blob.
    }

    // Safe compatibility fallback: render the original R2 object directly.
    // This preserves previews after metadata migration without duplicating GBs of files.
    const url = new URL(encodeURIComponent(filename), LEGACY_ASSET_BASE);
    return NextResponse.redirect(url, 307);
  } catch (error) {
    console.error('Serve thumbnail error:', error);
    return NextResponse.json({ error: 'Failed to serve thumbnail' }, { status: 500 });
  }
}
