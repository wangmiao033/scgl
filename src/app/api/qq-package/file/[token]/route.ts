import { NextRequest, NextResponse } from 'next/server';
import { get } from '@vercel/blob';

export const runtime = 'nodejs';

function isValidToken(token: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token);
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  if (!isValidToken(token)) {
    return NextResponse.json({ error: 'Invalid package token' }, { status: 400 });
  }

  const pathname = `qq-packages/${token}.zip`;

  try {
    const blobResult = await get(pathname, { access: 'private' });
    if (!blobResult || blobResult.statusCode !== 200) {
      return NextResponse.json({ error: 'Package not found' }, { status: 404 });
    }

    return new NextResponse(blobResult.stream as any, {
      headers: {
        'Content-Type': 'application/zip',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('[qq-package/file]', error);
    return NextResponse.json({ error: 'Package unavailable' }, { status: 404 });
  }
}
