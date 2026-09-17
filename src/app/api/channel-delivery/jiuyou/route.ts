import { NextRequest, NextResponse } from 'next/server';
import { get } from '@vercel/blob';
import { Readable } from 'node:stream';
import { ZipArchive } from 'archiver';
import { db, ensureDatabaseReady } from '@/lib/db';

export const runtime = 'nodejs';

const LEGACY_ASSET_BASE = 'https://files.hnchpower.cn/assets/';
const QDSC_BASE_URL = (process.env.QDSC_BASE_URL || 'https://qdsc.hnchpower.cn').replace(/\/$/, '');
const QQ_SEND_URL = `${QDSC_BASE_URL}/api/jiuyou/qq-send`;
const MAX_IDS = 50;
const QQ_MAX_ZIP_BYTES = 4 * 1024 * 1024;

type JiuyouSpecId = 'splash' | 'popup' | 'banner' | 'feed' | 'tab' | 'egg';

type JiuyouSpec = {
  id: JiuyouSpecId;
  name: string;
  width?: number;
  height: number;
  maxWidth?: number;
  maxBytes: number;
  formats: string[];
};

const JIUYOU_SPECS: Record<JiuyouSpecId, JiuyouSpec> = {
  splash: {
    id: 'splash',
    name: '闪屏',
    width: 1080,
    height: 2340,
    maxBytes: 1024 * 1024,
    formats: ['JPG', 'JPEG', 'PNG', 'WEBP'],
  },
  popup: {
    id: 'popup',
    name: '大弹窗',
    width: 720,
    height: 1100,
    maxBytes: 1024 * 1024,
    formats: ['PNG', 'WEBP'],
  },
  banner: {
    id: 'banner',
    name: '首页 Banner',
    width: 720,
    height: 405,
    maxBytes: 500 * 1024,
    formats: ['JPG', 'JPEG', 'PNG'],
  },
  feed: {
    id: 'feed',
    name: '首页信息流',
    width: 720,
    height: 405,
    maxBytes: 500 * 1024,
    formats: ['JPG', 'JPEG', 'PNG'],
  },
  tab: {
    id: 'tab',
    name: '首页 Tab',
    height: 54,
    maxWidth: 320,
    maxBytes: 100 * 1024,
    formats: ['PNG', 'WEBP'],
  },
  egg: {
    id: 'egg',
    name: '首页彩蛋',
    width: 152,
    height: 152,
    maxBytes: 300 * 1024,
    formats: ['PNG', 'WEBP'],
  },
};

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function getFormat(fileName: string) {
  const ext = fileName.split('.').pop()?.toUpperCase() || '';
  return ext === 'JPE' ? 'JPEG' : ext;
}

function sanitizeName(name: string) {
  return name
    .replace(/[\\/:*?"<>|\r\n]/g, '_')
    .replace(/\s+/g, ' ')
    .trim() || '九游素材包';
}

function safeArchiveName(name: string, index: number) {
  const normalized = name.replace(/\\/g, '/');
  return normalized.split('/').pop()?.replace(/\0/g, '') || `file-${index + 1}`;
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
    // Legacy assets are stored in R2 and are fetched below.
  }

  const legacyUrl = new URL(encodeURIComponent(fileName), LEGACY_ASSET_BASE);
  const response = await fetch(legacyUrl, { cache: 'no-store' });
  if (!response.ok || !response.body) return null;
  return Readable.fromWeb(response.body as any);
}

function validateAsset(
  asset: {
    id: string;
    originalName: string;
    fileSize: number;
    width: number | null;
    height: number | null;
  },
  specId: JiuyouSpecId | undefined,
) {
  if (!specId || !JIUYOU_SPECS[specId]) {
    return {
      status: 'pending' as const,
      reasons: ['请选择九游素材用途'],
      spec: null,
    };
  }

  const spec = JIUYOU_SPECS[specId];
  const width = asset.width || 0;
  const height = asset.height || 0;
  const format = getFormat(asset.originalName);
  const reasons: string[] = [];

  const sizeOk = spec.id === 'tab'
    ? height === spec.height && width <= (spec.maxWidth || 320)
    : width === spec.width && height === spec.height;

  if (!sizeOk) {
    reasons.push(
      spec.id === 'tab'
        ? `尺寸不符：当前 ${width}×${height}，要求高 54px 且宽 ≤ 320px`
        : `尺寸不符：当前 ${width}×${height}，要求 ${spec.width}×${spec.height}`,
    );
  }
  if (asset.fileSize > spec.maxBytes) {
    reasons.push(`文件过大：当前 ${formatBytes(asset.fileSize)}，上限 ${formatBytes(spec.maxBytes)}`);
  }
  if (!spec.formats.includes(format)) {
    reasons.push(`格式不符：当前 ${format || '未知'}，允许 ${spec.formats.join(' / ')}`);
  }

  return {
    status: reasons.length ? 'fail' as const : 'pass' as const,
    reasons,
    spec,
  };
}

async function buildZip(
  assets: Array<{
    id: string;
    fileName: string;
    originalName: string;
    fileSize: number;
    width: number | null;
    height: number | null;
  }>,
  assignments: Record<string, JiuyouSpecId>,
  packageName: string,
) {
  const archive = new ZipArchive({ zlib: { level: 6 } });
  const chunks: Buffer[] = [];
  const done = new Promise<void>((resolve, reject) => {
    archive.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    archive.on('end', resolve);
    archive.on('error', reject);
  });

  const manifest: string[] = [
    '【九游素材验收清单】',
    `素材包：${packageName}`,
    `打包时间：${new Date().toLocaleString('zh-CN')}`,
    `通过数量：${assets.length}/${assets.length}`,
    '',
  ];

  for (const [index, asset] of assets.entries()) {
    const result = validateAsset(asset, assignments[asset.id]);
    if (result.status !== 'pass' || !result.spec) {
      throw new Error(`${asset.originalName} 未通过九游规格验收`);
    }

    const stream = await openAssetStream(asset.fileName);
    if (!stream) throw new Error(`读取素材失败：${asset.originalName}`);

    const safeOriginal = safeArchiveName(asset.originalName, index);
    const zipPath = `${String(index + 1).padStart(2, '0')}_${sanitizeName(result.spec.name)}_${safeOriginal}`;
    archive.append(stream, { name: zipPath });
    manifest.push(
      `✅ ${result.spec.name}｜${asset.width || 0}×${asset.height || 0}｜${formatBytes(asset.fileSize)}｜${asset.originalName}｜通过`,
    );
  }

  archive.append(Buffer.from(`\uFEFF${manifest.join('\r\n')}`, 'utf8'), {
    name: '九游验收结果.txt',
  });
  archive.finalize();
  await done;

  return Buffer.concat(chunks);
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
      error: error instanceof Error ? error.message : '无法连接九游 QQ 发送服务',
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
      assignments?: Record<string, JiuyouSpecId>;
    };

    const action = body.action === 'send' ? 'send' : 'download';
    const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
    const assignments = body.assignments || {};
    const packageName = sanitizeName(body.packageName || '九游素材包');

    if (ids.length === 0) {
      return NextResponse.json({ error: '请先选择要交付的素材' }, { status: 400 });
    }
    if (ids.length > MAX_IDS) {
      return NextResponse.json({ error: `单次最多交付 ${MAX_IDS} 个素材` }, { status: 400 });
    }

    const found = await db.asset.findMany({ where: { id: { in: ids } } });
    const byId = new Map(found.map(asset => [asset.id, asset]));
    const assets = ids.map(id => byId.get(id)).filter((asset): asset is NonNullable<typeof asset> => Boolean(asset));

    if (assets.length !== ids.length) {
      return NextResponse.json({ error: '部分素材已不存在，请刷新素材列表后重试' }, { status: 404 });
    }

    const results = assets.map(asset => ({
      id: asset.id,
      name: asset.originalName,
      ...validateAsset(asset, assignments[asset.id]),
    }));
    const fail = results.filter(item => item.status === 'fail');
    const pending = results.filter(item => item.status === 'pending');

    if (fail.length || pending.length) {
      return NextResponse.json({
        error: `当前还不能交付：不通过 ${fail.length} 张，待选择用途 ${pending.length} 张`,
        summary: {
          total: results.length,
          pass: results.filter(item => item.status === 'pass').length,
          fail: fail.length,
          pending: pending.length,
        },
        results: results.map(item => ({
          id: item.id,
          name: item.name,
          status: item.status,
          reasons: item.reasons,
          spec: item.spec?.name || null,
        })),
      }, { status: 422 });
    }

    const zipBuffer = await buildZip(assets, assignments, packageName);
    const zipName = `${packageName}_${makeTimeStamp()}.zip`;

    if (action === 'download') {
      return new NextResponse(new Uint8Array(zipBuffer), {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="jiuyou-${Date.now()}.zip"; filename*=UTF-8''${encodeURIComponent(zipName)}`,
          'Cache-Control': 'no-cache',
        },
      });
    }

    if (zipBuffer.byteLength > QQ_MAX_ZIP_BYTES) {
      return NextResponse.json({
        error: `ZIP 超过 4MB，当前 ${(zipBuffer.byteLength / 1024 / 1024).toFixed(2)}MB，请减少单次交付素材数量`,
      }, { status: 413 });
    }

    const formData = new FormData();
    formData.append('file', new Blob([new Uint8Array(zipBuffer)], { type: 'application/zip' }), zipName);
    formData.append('packageName', zipName);
    formData.append('passedCount', String(assets.length));

    const specNames = [...new Set(assets.map(asset => JIUYOU_SPECS[assignments[asset.id]]?.name).filter(Boolean))];
    formData.append(
      'notice',
      `【九游素材】验收已通过，共 ${assets.length} 张素材（${specNames.join('、')}），素材包「${zipName}」已发到本群，请相关同学查收使用。`,
    );

    const qqResponse = await fetch(QQ_SEND_URL, {
      method: 'POST',
      body: formData,
      cache: 'no-store',
    });
    const qqData = await qqResponse.json().catch(() => ({}));

    return NextResponse.json(qqData, { status: qqResponse.status });
  } catch (error) {
    console.error('[channel-delivery/jiuyou]', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : '九游渠道交付失败',
    }, { status: 500 });
  }
}
