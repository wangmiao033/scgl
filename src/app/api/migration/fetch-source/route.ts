import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SOURCE_URL = 'https://scgl.hnchpower.cn/__scgl_migration_source_20260819.tgz';
const MAX_BYTES = 2 * 1024 * 1024;

export async function GET() {
  const response = await fetch(SOURCE_URL, { cache: 'no-store' });
  if (!response.ok) {
    return NextResponse.json({ error: `Legacy source returned ${response.status}` }, { status: 502 });
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_BYTES) {
    return NextResponse.json({ error: 'Source archive too large', size: buffer.length }, { status: 413 });
  }
  return NextResponse.json({
    sourceUrl: SOURCE_URL,
    size: buffer.length,
    base64: buffer.toString('base64'),
  });
}
