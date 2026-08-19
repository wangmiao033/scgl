export const dynamic = 'force-dynamic';

const RAW_SCRIPT_URL =
  'https://raw.githubusercontent.com/wangmiao033/scgl/main/scripts/legacy-snapshot-upload-v2.sh';

export async function GET() {
  const response = await fetch(RAW_SCRIPT_URL, { cache: 'no-store' });

  if (!response.ok || !response.body) {
    return new Response('Failed to load migration script', { status: 502 });
  }

  return new Response(response.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/x-shellscript; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
