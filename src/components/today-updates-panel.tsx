'use client';

import { useMemo, useState } from 'react';
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
  const [expanded, setExpanded] = useState(false);

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

  return (
    <section id="today-updates" className="mb-4 overflow-hidden rounded-xl border border-[#cfe0fa] bg-[#f4f8ff] shadow-[0_8px_24px_rgba(37,99,235,0.06)]">
      <div className="flex items-start justify-between gap-4 px-5 py-4">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-medium text-[#2563eb]">
            <History size={14} />
            <span>今日更新</span>
          </div>
          <h2 className="text-[22px] font-semibold tracking-tight text-[#0f172a]">今天哪些素材刚更新</h2>
          <p className="mt-1 text-xs text-[#64748b]">
            {stats.changed.length > 0 ? `今天共有 ${stats.changed.length} 个素材发生变化。` : '今天还没有素材更新。'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-[#2563eb] px-4 text-sm font-medium text-white shadow-sm transition hover:bg-[#1d4ed8]"
        >
          <History size={15} />
          更新动态
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
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
