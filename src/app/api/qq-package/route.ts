import { NextRequest, NextResponse } from 'next/server';
import { del, get, put } from '@vercel/blob';
import { Readable } from 'node:stream';
import { ZipArchive } from 'archiver';
import { db, ensureDatabaseReady } from '@/lib/db';

export const runtime = 'nodejs';

const LEGACY_ASSET_BASE = 'https://files.hnchpower.cn/assets/';
const QDSC_BASE_URL = (process.env.QDSC_BASE_URL || 'https://qdsc.hnchpower.cn').replace(/\/$/, '');
const SCGL_PUBLIC_BASE_URL = (process.env.SCGL_PUBLIC_BASE_URL || 'https://scgl.hnchpower.cn').replace(/\/$/, '');
const QQ_SEND_URL = `${QDSC_BASE_URL}/api/jiuyou/qq-send`;
const MAX_IDS = 50;
const DIRECT_QQ_BYTES = 4 * 1024 * 1024;

function sanitizeName(name: string) {
  return name
    .replace(/[\\/:*?"<>|\r\n]/g, '_')
    .replace(/\s+/g, ' ')
    .trim() || '素材包';
}

function safeArchiveName(name: string, index: number) {
  const normalized = name.replace(/\\/g, '/');
  const baseName = normalized.split('/').pop()?.replace(/\0/g, '') || `file-${index + 1}`;
  return `${String(index + 1).padStart(2, '0')}_${baseName}`;
}

function makeTimeStamp() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
}

async function openAssetStream(fileName: string): Promise<Readable | null> {
  try {
    const blobResult = await get(`assets/${fileName}`, { access: 'private' });
    if (blobResult?.statusCode === 200) {
      return Readable.fromWeb(blobResult.stream as any);
    }
  } catch {
    // Legacy R2-backed assets are fetched below.
  }

  const legacyUrl = new URL(encodeURIComponent(fileName), LEGACY_ASSET_BASE);
  const response = await fetch(legacyUrl, { cache: 'no-store' });
  if (!response.ok || !response.body) return null;
  return Readable.fromWeb(response.body as any);
}

async function buildZip(
  assets: Array<{
    fileName: string;
    originalName: string;
  }>,
) {
  const archive = new ZipArchive({ zlib: { level: 6 } });
  const chunks: Buffer[] = [];
  const done = new Promise<void>((resolve, reject) => {
    archive.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    archive.on('end', resolve);
    archive.on('error', reject);
  });

  for (const [index, asset] of assets.entries()) {
    const stream = await openAssetStream(asset.fileName);
    if (!stream) throw new Error(`读取素材失败：${asset.originalName}`);
    archive.append(stream, { name: safeArchiveName(asset.originalName, index) });
  }

  archive.finalize();
  await done;
  return Buffer.concat(chunks);
}

async function sendSmallPackageToQq(zipBuffer: Buffer, zipName: string, notice: string) {
  const formData = new FormData();
  formData.append('file', new Blob([new Uint8Array(zipBuffer)], { type: 'application/zip' }), zipName);
  formData.append('packageName', zipName);
  formData.append('notice', notice);

  return fetch(QQ_SEND_URL, {
    method: 'POST',
    body: formData,
    cache: 'no-store',
  });
}

async function sendLargePackageToQq(zipBuffer: Buffer, zipName: string, notice: string) {
  const token = crypto.randomUUID();
  const pathname = `qq-packages/${token}.zip`;

  await put(pathname, zipBuffer, {
    access: 'private',
    addRandomSuffix: false,
    contentType: 'application/zip',
  });

  try {
    const fileUrl = `${SCGL_PUBLIC_BASE_URL}/api/qq-package/file/${token}`;
    return await fetch(QQ_SEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileUrl,
        packageName: zipName,
        notice,
      }),
      cache: 'no-store',
    });
  } finally {
    await del(pathname).catch(() => undefined);
  }
}

export async function GET() {
  try {
    const response = await fetch(QQ_SEND_URL, { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json({
      configured: false,
      appConfigured: false,
      groupConfigured: false,
      error: error instanceof Error ? error.message : '无法连接 QQ 发送服务',
    }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureDatabaseReady();
    const body = await request.json() as {
      action?: 'download' | 'send';
      ids?: string[];
      packageName?: string;
    };

    const action = body.action === 'send' ? 'send' : 'download';
    const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
    const packageName = sanitizeName(body.packageName || '素材包');

    if (ids.length === 0) {
      return NextResponse.json({ error: '请先选择要打包的素材' }, { status: 400 });
    }
    if (ids.length > MAX_IDS) {
      return NextResponse.json({ error: `单次最多打包 ${MAX_IDS} 个素材` }, { status: 400 });
    }

    const found = await db.asset.findMany({ where: { id: { in: ids } } });
    const byId = new Map(found.map(asset => [asset.id, asset]));
    const assets = ids.map(id => byId.get(id)).filter((asset): asset is NonNullable<typeof asset> => Boolean(asset));

    if (assets.length !== ids.length) {
      return NextResponse.json({ error: '部分素材已不存在，请刷新素材列表后重试' }, { status: 404 });
    }

    const zipBuffer = await buildZip(assets);
    const zipName = `${packageName}_${makeTimeStamp()}.zip`;

    if (action === 'download') {
      return new NextResponse(new Uint8Array(zipBuffer), {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="assets-${Date.now()}.zip"; filename*=UTF-8''${encodeURIComponent(zipName)}`,
          'Cache-Control': 'no-cache',
        },
      });
    }

    const notice = `【素材包】共 ${assets.length} 个文件，素材包「${zipName}」已发到本群，请查收使用。`;
    const useUrlDelivery = zipBuffer.byteLength > DIRECT_QQ_BYTES;
    const qqResponse = useUrlDelivery
      ? await sendLargePackageToQq(zipBuffer, zipName, notice)
      : await sendSmallPackageToQq(zipBuffer, zipName, notice);
    const qqData = await qqResponse.json().catch(() => ({}));

    if (!qqResponse.ok) {
      return NextResponse.json(qqData, { status: qqResponse.status });
    }

    return NextResponse.json({
      ...qqData,
      transport: useUrlDelivery ? 'url' : 'direct',
      packageBytes: zipBuffer.byteLength,
    }, { status: qqResponse.status });
  } catch (error) {
    console.error('[qq-package]', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : '素材打包发送失败',
    }, { status: 500 });
  }
}
