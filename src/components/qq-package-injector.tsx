'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bot, Download, Loader2, PackageCheck, RefreshCw, Send } from 'lucide-react';
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

type QqStatus = {
  configured: boolean;
  appConfigured: boolean;
  groupConfigured: boolean;
  error?: string;
};

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

export function QqPackageInjector() {
  const {
    assets,
    typeFilter,
    activeProjectId,
    projects,
  } = useAssetStore();

  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [selectedAssets, setSelectedAssets] = useState<AssetRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [packageName, setPackageName] = useState('素材包');
  const [qqStatus, setQqStatus] = useState<QqStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [working, setWorking] = useState<'download' | 'send' | null>(null);

  const projectName = useMemo(() => {
    if (!activeProjectId || activeProjectId === 'unassigned') return '素材';
    return projects.find(project => project.id === activeProjectId)?.name || '素材';
  }, [activeProjectId, projects]);

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
      let host = actions.querySelector<HTMLElement>('[data-qq-package-slot="true"]');
      if (!host) {
        host = document.createElement('span');
        host.dataset.qqPackageSlot = 'true';
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
      const response = await fetch('/api/qq-package', { cache: 'no-store' });
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
    setPackageName(`${projectName}_素材_${todayStamp()}`);
    void refreshQqStatus();
  }, [open, selectedKey, projectName, refreshQqStatus]);

  const callPackage = async (action: 'download' | 'send') => {
    if (!selectedAssets.length) {
      toast.error('请先选择素材');
      return;
    }

    setWorking(action);
    try {
      const response = await fetch('/api/qq-package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          ids: selectedAssets.map(asset => asset.id),
          packageName,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || `操作失败（HTTP ${response.status}）`);
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
        toast.success(`已生成 ZIP，共 ${selectedAssets.length} 个文件`);
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
      toast.error(error instanceof Error ? error.message : '素材打包发送失败');
    } finally {
      setWorking(null);
    }
  };

  const portalButton = portalHost && selectedAssets.length > 0
    ? createPortal(
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-sky-600 px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-sky-700"
          title="将已选素材打包并发送到 QQ 群"
        >
          <Send size={14} />
          打包发 QQ 群
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
          className="w-full border-l border-slate-200 bg-[#F7F9FC] p-0 text-slate-900 sm:max-w-[520px]"
        >
          <SheetHeader className="border-b border-slate-200 bg-white px-5 py-4 text-left">
            <SheetTitle className="flex items-center gap-2 text-base font-bold text-slate-950">
              <PackageCheck size={18} className="text-sky-600" />
              素材打包发送
            </SheetTitle>
            <SheetDescription className="mt-1 text-xs text-slate-500">
              仅将当前选中的素材打成 ZIP，可下载或直接发送到 QQ 群。
            </SheetDescription>
          </SheetHeader>

          <div className="p-5">
            <section className="rounded-xl border border-sky-200 bg-gradient-to-r from-sky-50 to-violet-50 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                    <Bot size={15} className="text-sky-600" />
                    ZIP 打包 → QQ 群
                  </div>
                  <div className="mt-1 text-[10px] font-medium text-slate-500">
                    当前已选择 {selectedAssets.length} 个文件。
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
                className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 outline-none focus:border-sky-400"
              />

              {qqStatus?.error && !qqStatus.configured && (
                <div className="mt-2 text-[10px] font-medium text-amber-700">{qqStatus.error}</div>
              )}

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void callPackage('download')}
                  disabled={!selectedAssets.length || working !== null}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {working === 'download' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  下载 ZIP
                </button>
                <button
                  type="button"
                  onClick={() => void callPackage('send')}
                  disabled={!selectedAssets.length || working !== null || !qqStatus?.configured}
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
