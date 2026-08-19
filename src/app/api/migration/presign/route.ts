import { NextRequest, NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { issueSignedToken, presignUrl } from '@vercel/blob';

export const runtime = 'nodejs';

const EXPECTED_KEY_HASH = '7941972597737c5850a7bccc6dbe8e2b20008c1723e929196e13c47b69124f99';
const PREFIX = 'migration-legacy/';

function isAuthorized(value: string | null): boolean {
  if (!value) return false;
  const actual = createHash('sha256').update(value).digest('hex');
  const a = Buffer.from(actual, 'utf8');
  const b = Buffer.from(EXPECTED_KEY_HASH, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

function validPathname(pathname: unknown): pathname is string {
  return typeof pathname === 'string' && pathname.startsWith(PREFIX) && !pathname.includes('..');
}

async function makePresignedUrl({
  pathname,
  operation,
  contentType,
  maximumSizeInBytes,
}: {
  pathname: string;
  operation: 'put' | 'get';
  contentType?: string;
  maximumSizeInBytes?: number;
}) {
  const validUntil = Date.now() + 30 * 60 * 1000;
  const token = await issueSignedToken({
    pathname,
    operations: [operation],
    validUntil,
    ...(operation === 'put' && maximumSizeInBytes
      ? { maximumSizeInBytes }
      : {}),
  });

  return presignUrl(token, {
    pathname,
    operation,
    validUntil,
    ...(operation === 'put'
      ? {
          access: 'private' as const,
          addRandomSuffix: false,
          allowOverwrite: true,
          ...(contentType ? { allowedContentTypes: [contentType] } : {}),
          ...(maximumSizeInBytes ? { maximumSizeInBytes } : {}),
        }
      : {}),
  });
}

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorized(request.headers.get('x-scgl-migration-key'))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { pathname, operation = 'put', contentType, maximumSizeInBytes } = body as {
      pathname?: unknown;
      operation?: 'put' | 'get';
      contentType?: string;
      maximumSizeInBytes?: number;
    };

    if (!validPathname(pathname)) {
      return NextResponse.json({ error: 'Invalid pathname' }, { status: 400 });
    }
    if (operation !== 'put' && operation !== 'get') {
      return NextResponse.json({ error: 'Invalid operation' }, { status: 400 });
    }
    if (
      maximumSizeInBytes !== undefined &&
      (!Number.isFinite(maximumSizeInBytes) || maximumSizeInBytes <= 0 || maximumSizeInBytes > 5_000_000_000_000)
    ) {
      return NextResponse.json({ error: 'Invalid maximumSizeInBytes' }, { status: 400 });
    }

    const result = await makePresignedUrl({
      pathname,
      operation,
      contentType,
      maximumSizeInBytes,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Migration presign error:', error);
    return NextResponse.json({ error: 'Failed to create signed URL' }, { status: 500 });
  }
}

// Temporary read bridge used only while the legacy migration is in progress.
// The secret itself is never committed; only its SHA-256 hash is stored above.
export async function GET(request: NextRequest) {
  try {
    const key = request.nextUrl.searchParams.get('key');
    const pathname = request.nextUrl.searchParams.get('pathname');

    if (!isAuthorized(key)) {
      return new NextResponse('Unauthorized', { status: 401 });
    }
    if (!validPathname(pathname)) {
      return new NextResponse('Invalid pathname', { status: 400 });
    }

    const { presignedUrl } = await makePresignedUrl({
      pathname,
      operation: 'get',
    });

    return NextResponse.redirect(presignedUrl, 302);
  } catch (error) {
    console.error('Migration signed read error:', error);
    return new NextResponse('Failed to create signed read URL', { status: 500 });
  }
}
