import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const LEGACY_BASE = 'https://scgl.hnchpower.cn';

async function probe(path: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${LEGACY_BASE}${path}`, {
      cache: 'no-store',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'user-agent': 'SCGL-Vercel-Migration-Probe/1.0',
        accept: 'application/json,text/plain,*/*',
      },
    });
    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }

    const summarize = (value: unknown): unknown => {
      if (Array.isArray(value)) {
        return {
          kind: 'array',
          length: value.length,
          sample: value.slice(0, 2),
        };
      }
      if (value && typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        const summary: Record<string, unknown> = {
          kind: 'object',
          keys: Object.keys(obj).slice(0, 30),
        };
        for (const key of ['projects', 'channels', 'assets', 'data', 'items', 'count', 'total', 'pagination']) {
          if (key in obj) {
            const v = obj[key];
            if (Array.isArray(v)) summary[key] = { length: v.length, sample: v.slice(0, 2) };
            else summary[key] = v;
          }
        }
        return summary;
      }
      return value;
    };

    return {
      path,
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get('content-type'),
      server: response.headers.get('server'),
      location: response.headers.get('location'),
      summary: parsed !== null ? summarize(parsed) : null,
      textSample: parsed === null ? text.slice(0, 500) : undefined,
    };
  } catch (error) {
    return {
      path,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET() {
  const results = await Promise.all([
    probe('/api'),
    probe('/api/projects'),
    probe('/api/channels'),
    probe('/api/assets'),
  ]);

  return NextResponse.json({
    legacyBase: LEGACY_BASE,
    checkedAt: new Date().toISOString(),
    results,
  });
}
