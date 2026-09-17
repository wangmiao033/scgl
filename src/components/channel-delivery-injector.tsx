'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bot,
  CheckCircle2,
  Download,
  ExternalLink,
  Loader2,
  PackageCheck,
  RefreshCw,
  Send,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useAssetStore } from '@/store/asset-store';
import { categorizeFile, type AssetRecord } from '@/lib/file-utils';

type JiuyouSpecId = 'splash' | 'popup' | 'banner' | 'feed' | 'tab' | 'egg';
type Assignment = JiuyouSpecId | '';

type QqStatus = {
  configured: boolean;
  appConfigured: boolean;
  groupConfigured: boolean;
  error?: string;
};

type InspectResult = {
  status: 'pass' | 'fail' | 'pending';
  reasons: string[];
};

const JIUYOU_SPECS: Array<{
  id: JiuyouSpecId;
  name: string;
  dimension: string;
  width?: number;
  height: number;
  maxWidth?: number;
  maxBytes: number;
  formats: string[];
}> = [
  {
    id: 'splash',
    name: '闪屏',
    dimension: '1080 × 2340',
    width: 1080,
    height: 2340,
    maxBytes: 1024 * 1024,
    formats: ['JPG', 'JPEG', 'PNG', 'WEBP'],
  },
  {
    id: 'popup',
    name: '大弹窗',
    dimension: '720 × 1100',
    width: 720,
    height: 1100,
    maxBytes: 1024 * 1024,
    formats: ['PNG', 'WEBP'],
  },
  {
    id: 'banner',
    name: '首页 Banner',
    dimension: '720 × 405',
    width: 720,
    height: 405,
    maxBytes: 500 * 1024,
    formats: ['JPG', 'JPEG', 'PNG'],
  },
  {
    id: 'feed',
    name: '首页信息流',
    dimension: '720 × 405',
    width: 720,
    height: 405,
    maxBytes: 500 * 1024,
    formats: ['JPG', 'JPEG', 'PNG'],
  },
  {
    id: 'tab',
    name: '首页 Tab',
    dimension: '高 54px · 宽 ≤ 320px',
    height: 54,
    maxWidth: 320,
    maxBytes: 100 * 1024,
    formats: ['PNG', 'WEBP'],
  },
  {
    id: 'egg',
    name: '首页彩蛋',
    dimension: '152 × 152',
    width: 152,
    height: 152,
    maxBytes: 300 * 1024,
    formats: ['PNG', 'WEBP'],
  },
];

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function getFormat(fileName: string) {
  const ext = fileName.split('.').pop()?.toUpperCase() || '';
  return ext === 'JPE' ? 'JPEG' : ext;
}

function inferSpec(asset: AssetRecord): Assignment {
  const width = asset.width || 0;
  const height = asset.height || 0;
  const lower = asset.originalName.toLowerCase();

  if (width === 1080 && height === 2340) return 'splash';
  if (width === 720 && height === 1100) return 'popup';
  if (height === 54 && width <= 320) return 'tab';
  if (width === 152 && height === 152) return 'egg';
  if (width === 720 && height === 405) {
    if (lower.includes('信息流') || lower.includes('feed')) return 'feed';
    if (lower.includes('banner')) return 'banner';
    return '';
  }
  return '';
}

function inspectAsset(asset: AssetRecord, specId: Assignment): InspectResult {
  if (!specId) {
    return { status: 'pending', reasons: ['请选择九游素材用途'] };
  }

  const spec = JIUYOU_SPECS.find(item => item.id === specId);
  if (!spec) return { status: 'pending', reasons: ['请选择九游素材用途'] };

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
        ? `当前 ${width}×${height}，要求高 54px 且宽 ≤ 320px`
        : `当前 ${width}×${height}，要求 ${spec.dimension}`,
    );
  }
  if (asset.fileSize > spec.maxBytes) {
    reasons.push(`当前 ${formatBytes(asset.fileSize)}，上限 ${formatBytes(spec.maxBytes)}`);
  }
  if (!spec.formats.includes(format)) {
    reasons.push(`当前 ${format || '未知'}，允许 ${spec.formats.join(' / ')}`);
  }

  return {
    status: reasons.length ? 'fail' : 'pass',
    reasons,
  };
}

function todayStamp() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
}

function selectedAssetsFromDom(assets: AssetRecord[], typeFilter: string) {
  const visibleAssets = typeFilter === 'all'
    ? assets
    : assets.filter(asset => categorizeFile(asset.originalName) === typeFilter);

  const queues = new Map<string, AssetRecord[]>();
  for (const asset of visibleAssets) {
    const current = queues.get(asset.originalName) || [];
    current.push(asset);
    queues.set(asset.originalName, current);
  }

  const selected: AssetRecord[] = [];
  const visitedGroups = new Set<Element>();
  const titleNodes = Array.from(document.querySelectorAll<HTMLElement>('main [title]'));

  for (const node of titleNodes) {
    const title = node.getAttribute('title') || '';
    const queue = queues.get(title);
    if (!queue?.length) continue;

    const group = node.closest('div.group');
    if (!group || visitedGroups.has(group)) continue;
    visitedGroups.add(group);

    const asset = queue.shift();
    if (!asset) continue;

    const className = group.getAttribute('class') || '';
    const isListChecked = className.includes('border-l-[#4A90E2]');
    const isGridChecked = className.includes('border-2') && className.includes('border-[#4A90E2]');

    if (isListChecked || isGridChecked) selected.push(asset);
  }

  return selected;
}

function sameIds(a: AssetRecord[], b: AssetRecord[]) {
  if (a.length !== b.length) return false;
  return a.every((item, index) => item.id === b[index]?.id);
}

export function ChannelDeliveryInjector() {
  const {
    assets,
    typeFilter,
    activeProjectId,
    activeChannelId,
    projects,
    channels,
  } = useAssetStore();

  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [selectedAssets, setSelectedAssets] = useState<AssetRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [assignments, setAssignments] = useState<Record<string, Assignment>>({});
  const [packageName, setPackageName] = useState('九游素材包');
  const [qqStatus, setQqStatus] = useState<QqStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [working, setWorking] = useState<'download' | 'send' | null>(null);

  const projectName = useMemo(() => {
    if (!activeProjectId || activeProjectId === 'unassigned') return '素材';
    return projects.find(project => project.id === activeProjectId)?.name || '素材';
  }, [activeProjectId, projects]);

  const sourceChannelName = useMemo(() => {
    if (!activeChannelId) return '全部项目素材';
    if (activeChannelId === 'unassigned') return '未分配渠道';
    return channels.find(channel => channel.id === activeChannelId)?.name || '当前渠道';
  }, [activeChannelId, channels]);

  const scanWorkbench = useCallback(() => {
    const main = document.querySelector('main');
    if (!main) {
      setPortalHost(null);
      setSelectedAssets([]);
      return;
    }

    const batchBar = Array.from(main.querySelectorAll<HTMLElement>('div')).find(element => {
      const className = element.getAttribute('class') || '';
      const text = element.textContent || '';
      return className.includes('bg-[#4A90E2]/10')
        && className.includes('rounded-lg')
        && text.includes('已选择')
        && text.includes('取消选择');
    });

    if (!batchBar) {
      setPortalHost(null);
      setSelectedAssets([]);
      return;
    }

    const actions = Array.from(batchBar.children).find(element => {
      const text = element.textContent || '';
      const className = element.getAttribute('class') || '';
      return text.includes('取消选择') && className.includes('flex');
    }) as HTMLElement | undefined;

    if (actions) {
      let host = actions.querySelector<HTMLElement>('[data-channel-delivery-slot="true"]');
      if (!host) {
        host = document.createElement('span');
        host.dataset.channelDeliverySlot = 'true';
        host.style.display = 'inline-flex';
        actions.appendChild(host);
      }
      setPortalHost(current => current === host ? current : host);
    }

    const nextSelected = selectedAssetsFromDom(assets, typeFilter);
    setSelectedAssets(current => sameIds(current, nextSelected) ? current : nextSelected);
  }, [assets, typeFilter]);

  useEffect(() => {
    let frame = 0;
    const scheduleScan = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(scanWorkbench);
    };

    scheduleScan();
    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class'],
    });
    window.addEventListener('click', scheduleScan, true);
    window.addEventListener('keydown', scheduleScan, true);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('click', scheduleScan, true);
      window.removeEventListener('keydown', scheduleScan, true);
    };
  }, [scanWorkbench]);

  const selectedKey = selectedAssets.map(asset => asset.id).join('|');

  const refreshQqStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const response = await fetch('/api/channel-delivery/jiuyou', { cache: 'no-store' });
      const data = await response.json() as QqStatus;
      setQqStatus(response.ok ? data : { ...data, configured: false });
    } catch {
      setQqStatus({
        configured: false,
        appConfigured: false,
        groupConfigured: false,
        error: '无法连接 QQ 发送服务',
      });
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    setAssignments(current => {
      const next: Record<string, Assignment> = {};
      for (const asset of selectedAssets) {
        next[asset.id] = current[asset.id] ?? inferSpec(asset);
      }
      return next;
    });
    setPackageName(`${projectName}_九游_${todayStamp()}`);
    void refreshQqStatus();
  }, [open, selectedKey, projectName, refreshQqStatus]);

  const results = useMemo(() => selectedAssets.map(asset => ({
    asset,
    result: inspectAsset(asset, assignments[asset.id] || ''),
  })), [selectedAssets, assignments]);

  const summary = useMemo(() => ({
    total: results.length,
    pass: results.filter(item => item.result.status === 'pass').length,
    fail: results.filter(item => item.result.status === 'fail').length,
    pending: results.filter(item => item.result.status === 'pending').length,
  }), [results]);

  const canDeliver = summary.total > 0
    && summary.pass === summary.total
    && summary.fail === 0
    && summary.pending === 0;

  const callDelivery = async (action: 'download' | 'send') => {
    if (!canDeliver) {
      toast.error(`当前还不能交付：不通过 ${summary.fail} 张，待选择用途 ${summary.pending} 张`);
      return;
    }

    setWorking(action);
    try {
      const response = await fetch('/api/channel-delivery/jiuyou', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          ids: selectedAssets.map(asset => asset.id),
          packageName,
          assignments,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || `渠道交付失败（HTTP ${response.status}）`);
      }

      if (action === 'download') {
        const blob = await response.blob();
        const disposition = response.headers.get('content-disposition') || '';
        const utf8Name = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
        const fileName = utf8Name ? decodeURIComponent(utf8Name) : `${packageName}.zip`;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        toast.success(`已生成九游素材包，共 ${summary.pass} 张`);
      } else {
        const data = await response.json() as {
          fileName?: string;
          noticeSent?: boolean;
          noticeError?: string;
        };
        toast.success(
          data.noticeSent === false
            ? `ZIP 已发到 QQ 群，文字通知失败：${data.noticeError || '未知错误'}`
            : `已发送到 QQ 群：${data.fileName || packageName}`,
        );
        void refreshQqStatus();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '渠道交付失败');
    } finally {
      setWorking(null);
    }
  };

  const portalButton = portalHost && selectedAssets.length > 0
    ? createPortal(
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-violet-600 px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-violet-700"
          title="验收、打包并发送到渠道群"
        >
          <Send size={14} />
          渠道交付
        </button>,
        portalHost,
      )
    : null;

  return (
    <>
      {portalButton}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto border-l border-slate-200 bg-[#F7F9FC] p-0 text-slate-900 sm:max-w-[580px]"
        >
          <SheetHeader className="border-b border-slate-200 bg-white px-5 py-4 text-left">
            <div className="flex items-start justify-between gap-3 pr-8">
              <div>
                <SheetTitle className="flex items-center gap-2 text-base font-bold text-slate-950">
                  <PackageCheck size={18} className="text-violet-600" />
                  渠道素材交付
                </SheetTitle>
                <SheetDescription className="mt-1 text-xs text-slate-500">
                  复用现有九游验收与 QQ 群发送流程；素材全部通过后才允许交付。
                </SheetDescription>
              </div>
              <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-700">
                九游 V1
              </span>
            </div>
          </SheetHeader>

          <div className="space-y-4 p-5">
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
                <div>
                  <div className="text-slate-400">项目</div>
                  <div className="mt-1 truncate font-bold text-slate-800" title={projectName}>{projectName}</div>
                </div>
                <div>
                  <div className="text-slate-400">来源分类</div>
                  <div className="mt-1 truncate font-bold text-slate-800" title={sourceChannelName}>{sourceChannelName}</div>
                </div>
                <div>
                  <div className="text-slate-400">目标渠道</div>
                  <div className="mt-1 font-bold text-violet-700">九游</div>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-4 gap-2">
              {[
                ['已选择', summary.total, 'text-slate-950'],
                ['已通过', summary.pass, 'text-emerald-600'],
                ['不通过', summary.fail, 'text-red-600'],
                ['待选择', summary.pending, 'text-amber-600'],
              ].map(([label, value, color]) => (
                <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm">
                  <div className={`text-xl font-black ${color}`}>{value}</div>
                  <div className="mt-0.5 text-[10px] font-semibold text-slate-400">{label}</div>
                </div>
              ))}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div>
                  <div className="text-sm font-bold text-slate-900">素材用途与验收</div>
                  <div className="mt-0.5 text-[11px] text-slate-400">系统会按尺寸自动匹配；720×405 需确认 Banner / 信息流。</div>
                </div>
                <button
                  type="button"
                  onClick={() => window.open('https://qdsc.hnchpower.cn/?view=jiuyouSpecs', '_blank', 'noopener,noreferrer')}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-600 hover:text-violet-700"
                >
                  完整验收页 <ExternalLink size={12} />
                </button>
              </div>

              <div className="max-h-[360px] divide-y divide-slate-100 overflow-y-auto">
                {results.map(({ asset, result }) => (
                  <div key={asset.id} className="p-3.5">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-bold text-slate-800" title={asset.originalName}>
                          {asset.originalName}
                        </div>
                        <div className="mt-1 text-[10px] text-slate-400">
                          {asset.width || 0} × {asset.height || 0} · {formatBytes(asset.fileSize)} · {getFormat(asset.originalName) || '未知'}
                        </div>
                      </div>
                      <div className="shrink-0">
                        {result.status === 'pass' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">
                            <CheckCircle2 size={11} />通过
                          </span>
                        ) : result.status === 'fail' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-[10px] font-bold text-red-700">
                            <XCircle size={11} />不通过
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700">
                            <TriangleAlert size={11} />待选择
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                      <select
                        value={assignments[asset.id] || ''}
                        onChange={event => setAssignments(current => ({
                          ...current,
                          [asset.id]: event.target.value as Assignment,
                        }))}
                        className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 outline-none focus:border-violet-400"
                      >
                        <option value="">请选择用途</option>
                        {JIUYOU_SPECS.map(spec => (
                          <option key={spec.id} value={spec.id}>{spec.name} · {spec.dimension}</option>
                        ))}
                      </select>
                    </div>

                    {result.reasons.length > 0 && (
                      <div className={`mt-2 rounded-md px-2.5 py-1.5 text-[10px] font-medium leading-relaxed ${
                        result.status === 'fail'
                          ? 'bg-red-50 text-red-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}>
                        {result.reasons.join('；')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-sky-200 bg-gradient-to-r from-sky-50 to-violet-50 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                    <Bot size={15} className="text-sky-600" />
                    ZIP 打包 → QQ 群
                  </div>
                  <div className="mt-1 text-[10px] font-medium text-slate-500">
                    ZIP 自动附带「九游验收结果.txt」，QQ 发送复用现有 qdsc 服务。
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void refreshQqStatus()}
                  disabled={loadingStatus}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                    qqStatus?.configured
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {loadingStatus ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                  {qqStatus?.configured ? 'QQ群已连接' : qqStatus === null ? '检查连接' : 'QQ群待配置'}
                </button>
              </div>

              <label className="mt-4 block text-[10px] font-bold text-slate-500">素材包名称</label>
              <input
                value={packageName}
                onChange={event => setPackageName(event.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 outline-none focus:border-violet-400"
              />

              {!canDeliver && summary.total > 0 && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-white/80 px-3 py-2 text-[11px] font-semibold text-amber-700">
                  当前还不能打包：不通过 {summary.fail} 张 · 待选择用途 {summary.pending} 张。
                </div>
              )}

              {qqStatus?.error && !qqStatus.configured && (
                <div className="mt-2 text-[10px] font-medium text-amber-700">{qqStatus.error}</div>
              )}

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void callDelivery('download')}
                  disabled={!canDeliver || working !== null}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {working === 'download' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  下载 ZIP
                </button>
                <button
                  type="button"
                  onClick={() => void callDelivery('send')}
                  disabled={!canDeliver || working !== null || !qqStatus?.configured}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-3 text-xs font-bold text-white shadow-sm transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {working === 'send' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  {working === 'send' ? '发送中…' : '打包并发 QQ 群'}
                </button>
              </div>
            </section>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
