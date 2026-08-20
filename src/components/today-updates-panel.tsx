'use client';

import { useEffect, useMemo, useState } from 'react';
import { History, ChevronDown, ChevronUp } from 'lucide-react';
import type { AssetRecord, ProjectRecord, ChannelRecord } from '@/lib/file-utils';

type Props = {
  assets: AssetRecord[];
  projects: ProjectRecord[];
  channels: ChannelRecord[];
};

function isSameLocalDay(value: string | Date) {
  const d = new Date(value);
  const now = new Date();
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
}

export function TodayUpdatesPanel({ assets, projects, channels }: Props) {
  const [collapsed, setCollapsed] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('today-updates-collapsed');
    setCollapsed(saved === null ? true : saved === 'true');
  }, []);

  const setPanelCollapsed = (next: boolean) => {
    setCollapsed(next);
    localStorage.setItem('today-updates-collapsed', String(next));
  };

  const stats = useMemo(() => {
    const changed = assets.filter((asset) => isSameLocalDay(asset.updatedAt));
    const added = changed.filter((asset) => isSameLocalDay(asset.createdAt));
    const adjusted = changed.filter((asset) => {
      const created = new Date(asset.createdAt).getTime();
      const updated = new Date(asset.updatedAt).getTime();
      return updated - created > 1000;
    });
    const projectIds = new Set(changed.map((asset) => asset.projectId).filter(Boolean));
    const channelIds = new Set(changed.map((asset) => asset.channelId).filter(Boolean));

    return {
      changed,
      added: added.length,
      adjusted: adjusted.length,
      projects: projectIds.size,
      channels: channelIds.size,
    };
  }, [assets]);

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  const channelMap = useMemo(() => new Map(channels.map((c) => [c.id, c.name])), [channels]);

  if (collapsed) {
    return (
      <section id="today-updates" className="mb-3 overflow-hidden rounded-xl border border-[#d6e3f5] bg-[#f7faff] shadow-[0_1px_2px_rgba(37,99,235,0.03)]">
        <div className="flex min-h-12 items-center justify-between gap-4 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#e8f1ff] text-[#2563eb]">
              <History size={15} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="font-semibold text-[#172033]">今日更新</span>
                <span className="text-[#64748b]">变更 <b className="font-semibold text-[#2563eb]">{stats.changed.length}</b></span>
                <span className="text-[#64748b]">项目 <b className="font-semibold text-[#334155]">{stats.projects}</b></span>
                <span className="text-[#64748b]">渠道 <b className="font-semibold text-[#334155]">{stats.channels}</b></span>
                <span className="text-[#64748b]">新增 / 调整 <b className="font-semibold text-[#334155]">{stats.added} / {stats.adjusted}</b></span>
              </div>
              <p className="mt-0.5 truncate text-[11px] text-[#94a3b8]">
                {stats.changed.length > 0 ? `今天共有 ${stats.changed.length} 个素材发生变化` : '今天还没有素材更新'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setPanelCollapsed(false)}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[#d7e2f0] bg-white px-3 text-xs font-medium text-[#475569] transition hover:border-[#b9cbe4] hover:bg-[#f8fbff]"
          >
            展开
            <ChevronDown size={13} />
          </button>
        </div>
      </section>
    );
  }

  return (
    <section id="today-updates" className="mb-4 overflow-hidden rounded-xl border border-[#cfe0fa] bg-[#f4f8ff] shadow-[0_8px_24px_rgba(37,99,235,0.06)]">
      <div className="flex items-start justify-between gap-4 px-5 py-4">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-medium text-[#2563eb]">
            <History size={14} />
            <span>今日更新</span>
          </div>
          <h2 className="text-[20px] font-semibold tracking-tight text-[#0f172a]">今天哪些素材刚更新</h2>
          <p className="mt-1 text-xs text-[#64748b]">
            {stats.changed.length > 0 ? `今天共有 ${stats.changed.length} 个素材发生变化。` : '今天还没有素材更新。'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#2563eb] px-4 text-sm font-medium text-white shadow-sm transition hover:bg-[#1d4ed8]"
          >
            <History size={15} />
            更新动态
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button
            type="button"
            onClick={() => setPanelCollapsed(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d7e2f0] bg-white px-3 text-xs font-medium text-[#475569] transition hover:bg-[#f8fafc]"
          >
            收起
            <ChevronUp size={13} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 px-5 pb-5 lg:grid-cols-4">
        <StatCard label="今日变更素材" value={stats.changed.length} />
        <StatCard label="涉及项目" value={stats.projects} />
        <StatCard label="涉及渠道" value={stats.channels} />
        <StatCard label="新增 / 调整" value={`${stats.added} / ${stats.adjusted}`} />
      </div>

      {expanded && (
        <div className="border-t border-[#d9e6f8] bg-white/70 px-5 py-3">
          {stats.changed.length === 0 ? (
            <p className="py-2 text-sm text-[#64748b]">今天暂无项目或素材更新。</p>
          ) : (
            <div className="max-h-64 divide-y divide-[#e6edf7] overflow-y-auto">
              {stats.changed.slice(0, 50).map((asset) => (
                <div key={asset.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate text-[#1e293b]">{asset.originalName}</p>
                    <p className="mt-0.5 truncate text-xs text-[#64748b]">
                      {asset.projectId ? projectMap.get(asset.projectId) || '未知项目' : '未分类'}
                      {' · '}
                      {asset.channelId ? channelMap.get(asset.channelId) || '未知渠道' : '未分配渠道'}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-[#64748b]">
                    {new Date(asset.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-[#d7e2f0] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.02)]">
      <p className="text-xs text-[#64748b]">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-[#0f172a]">{value}</p>
    </div>
  );
}
