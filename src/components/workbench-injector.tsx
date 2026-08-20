'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BarChart3,
  ExternalLink,
  History,
  Moon,
  Sun,
  Search,
  X,
  Star,
  Clock3,
  GitBranch,
  SlidersHorizontal,
  RotateCcw,
} from 'lucide-react';
import { TodayUpdatesPanel } from '@/components/today-updates-panel';
import { useAssetStore } from '@/store/asset-store';
import type {
  AspectFilter,
  DimensionFilter,
  DateFilter,
  FileSizeFilter,
  ExtensionFilter,
} from '@/store/asset-store';
import type { AssetRecord, ProjectRecord, ChannelRecord } from '@/lib/file-utils';

type Mounts = {
  main: HTMLElement | null;
  sidebar: HTMLElement | null;
  header: HTMLElement | null;
  filters: HTMLElement | null;
};

const MATERIAL_WORKBENCH_URL = 'https://qdsc.hnchpower.cn/?view=bannerCrop';
const PINNED_KEY = 'scgl-pinned-project-ids';
const RECENT_KEY = 'scgl-recent-project-ids';

export function WorkbenchInjector() {
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [channels, setChannels] = useState<ChannelRecord[]>([]);
  const [mounts, setMounts] = useState<Mounts>({ main: null, sidebar: null, header: null, filters: null });
  const [isLight, setIsLight] = useState(true);
  const [projectQuery, setProjectQuery] = useState('');
  const [pinnedProjectIds, setPinnedProjectIds] = useState<string[]>([]);
  const [recentProjectIds, setRecentProjectIds] = useState<string[]>([]);

  const activeProjectId = useAssetStore((state) => state.activeProjectId);
  const setActiveProjectId = useAssetStore((state) => state.setActiveProjectId);
  const setActiveChannelId = useAssetStore((state) => state.setActiveChannelId);

  useEffect(() => {
    const saved = localStorage.getItem('scgl-theme');
    const light = saved ? saved === 'light' : true;
    setIsLight(light);
    document.body.classList.toggle('scgl-light', light);
    document.body.classList.add('scgl-compact-upload');

    if (localStorage.getItem('upload-zone-collapsed') === null) {
      localStorage.setItem('upload-zone-collapsed', 'true');
    }

    try {
      setPinnedProjectIds(JSON.parse(localStorage.getItem(PINNED_KEY) || '[]'));
      setRecentProjectIds(JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'));
    } catch {
      setPinnedProjectIds([]);
      setRecentProjectIds([]);
    }

    return () => {
      document.body.classList.remove('scgl-light');
      document.body.classList.remove('scgl-compact-upload');
    };
  }, []);

  useEffect(() => {
    if (!activeProjectId || activeProjectId === 'unassigned') return;
    setRecentProjectIds((current) => {
      const next = [activeProjectId, ...current.filter((id) => id !== activeProjectId)].slice(0, 6);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      return next;
    });
  }, [activeProjectId]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [assetRes, projectRes, channelRes] = await Promise.all([
          fetch('/api/assets?sortBy=date&sortOrder=desc', { cache: 'no-store' }),
          fetch('/api/projects', { cache: 'no-store' }),
          fetch('/api/channels', { cache: 'no-store' }),
        ]);
        if (!assetRes.ok || !projectRes.ok || !channelRes.ok) return;
        const [assetData, projectData, channelData] = await Promise.all([
          assetRes.json(), projectRes.json(), channelRes.json(),
        ]);
        if (!cancelled) {
          setAssets(assetData.assets || []);
          setProjects(projectData.projects || []);
          setChannels(channelData.channels || []);
        }
      } catch {
        // The main asset library remains usable even if the workbench summary fails.
      }
    };

    load();
    const timer = window.setInterval(load, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const created: HTMLElement[] = [];

    const install = () => {
      const main = document.querySelector('main.flex-1')?.firstElementChild as HTMLElement | null;
      const nav = document.querySelector('nav.flex-1') as HTMLElement | null;
      const headerControls = document.querySelector('header > div > div:last-child') as HTMLElement | null;

      let mainMount = document.querySelector('[data-scgl-workbench-main]') as HTMLElement | null;
      if (!mainMount && main) {
        mainMount = document.createElement('div');
        mainMount.setAttribute('data-scgl-workbench-main', '1');
        main.prepend(mainMount);
        created.push(mainMount);
      }

      let sidebarMount = document.querySelector('[data-scgl-workbench-sidebar]') as HTMLElement | null;
      if (!sidebarMount && nav) {
        sidebarMount = document.createElement('div');
        sidebarMount.setAttribute('data-scgl-workbench-sidebar', '1');
        const buttons = Array.from(nav.children).filter((el) => el.tagName === 'BUTTON');
        if (buttons[1]?.nextSibling) nav.insertBefore(sidebarMount, buttons[1].nextSibling);
        else nav.appendChild(sidebarMount);
        created.push(sidebarMount);
      }

      let headerMount = document.querySelector('[data-scgl-workbench-header]') as HTMLElement | null;
      if (!headerMount && headerControls) {
        headerMount = document.createElement('div');
        headerMount.setAttribute('data-scgl-workbench-header', '1');
        headerControls.prepend(headerMount);
        created.push(headerMount);
      }

      let filterMount = document.querySelector('[data-scgl-advanced-filters]') as HTMLElement | null;
      if (!filterMount && main) {
        filterMount = document.createElement('div');
        filterMount.setAttribute('data-scgl-advanced-filters', '1');
        const content = Array.from(main.children).find((el) => {
          const node = el as HTMLElement;
          return node.classList.contains('rounded-lg')
            && node.classList.contains('border')
            && node.classList.contains('overflow-hidden');
        });
        if (content) main.insertBefore(filterMount, content);
        else main.appendChild(filterMount);
        created.push(filterMount);
      }

      setMounts({ main: mainMount, sidebar: sidebarMount, header: headerMount, filters: filterMount });
    };

    install();
    const timer = window.setTimeout(install, 600);
    return () => {
      window.clearTimeout(timer);
      for (const node of created) node.remove();
    };
  }, []);

  const scrollToWorkbench = () => {
    document.getElementById('today-updates')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const toggleTheme = () => {
    setIsLight((current) => {
      const next = !current;
      document.body.classList.toggle('scgl-light', next);
      localStorage.setItem('scgl-theme', next ? 'light' : 'dark');
      return next;
    });
  };

  const openProject = (projectId: string) => {
    setActiveProjectId(projectId);
    setActiveChannelId(null);
    setProjectQuery('');
  };

  const openChannel = (projectId: string, channelId: string) => {
    setActiveProjectId(projectId);
    setActiveChannelId(channelId);
    setProjectQuery('');
  };

  const togglePin = (projectId: string) => {
    setPinnedProjectIds((current) => {
      const next = current.includes(projectId)
        ? current.filter((id) => id !== projectId)
        : [projectId, ...current].slice(0, 8);
      localStorage.setItem(PINNED_KEY, JSON.stringify(next));
      return next;
    });
  };

  const mainPortal = useMemo(() => mounts.main ? createPortal(
    <TodayUpdatesPanel assets={assets} projects={projects} channels={channels} />,
    mounts.main,
  ) : null, [mounts.main, assets, projects, channels]);

  const sidebarPortal = useMemo(() => mounts.sidebar ? createPortal(
    <SidebarQuickNav
      projects={projects}
      channels={channels}
      query={projectQuery}
      setQuery={setProjectQuery}
      pinnedProjectIds={pinnedProjectIds}
      recentProjectIds={recentProjectIds}
      onOpenProject={openProject}
      onOpenChannel={openChannel}
      onTogglePin={togglePin}
    />,
    mounts.sidebar,
  ) : null, [mounts.sidebar, projects, channels, projectQuery, pinnedProjectIds, recentProjectIds]);

  const headerPortal = useMemo(() => mounts.header ? createPortal(
    <div className="mr-1 flex items-center gap-1.5">
      <button
        type="button"
        onClick={scrollToWorkbench}
        className="scgl-shell-action inline-flex h-8 items-center gap-1.5 rounded-md border border-[#3a3a3a] bg-[#252525] px-2.5 text-xs text-[#aaa] transition hover:bg-[#333] hover:text-white"
      >
        <History size={14} />
        更新动态
      </button>
      <button
        type="button"
        onClick={toggleTheme}
        className="scgl-shell-action inline-flex h-8 items-center gap-1.5 rounded-md border border-[#3a3a3a] bg-[#252525] px-2.5 text-xs text-[#aaa] transition hover:bg-[#333] hover:text-white"
      >
        {isLight ? <Sun size={14} /> : <Moon size={14} />}
        {isLight ? '浅色' : '深色'}
      </button>
    </div>,
    mounts.header,
  ) : null, [mounts.header, isLight]);

  const filtersPortal = useMemo(() => mounts.filters ? createPortal(
    <AdvancedFiltersBar />,
    mounts.filters,
  ) : null, [mounts.filters]);

  return <>{mainPortal}{sidebarPortal}{headerPortal}{filtersPortal}</>;
}

function SidebarQuickNav({
  projects,
  channels,
  query,
  setQuery,
  pinnedProjectIds,
  recentProjectIds,
  onOpenProject,
  onOpenChannel,
  onTogglePin,
}: {
  projects: ProjectRecord[];
  channels: ChannelRecord[];
  query: string;
  setQuery: (value: string) => void;
  pinnedProjectIds: string[];
  recentProjectIds: string[];
  onOpenProject: (id: string) => void;
  onOpenChannel: (projectId: string, channelId: string) => void;
  onTogglePin: (id: string) => void;
}) {
  const q = query.trim().toLowerCase();
  const projectMap = new Map(projects.map((project) => [project.id, project]));
  const matchingProjects = q
    ? projects.filter((project) => project.name.toLowerCase().includes(q)).slice(0, 6)
    : [];
  const matchingChannels = q
    ? channels.filter((channel) => {
        const projectName = projectMap.get(channel.projectId)?.name || '';
        return channel.name.toLowerCase().includes(q) || projectName.toLowerCase().includes(q);
      }).slice(0, 8)
    : [];
  const pinnedProjects = pinnedProjectIds.map((id) => projectMap.get(id)).filter(Boolean) as ProjectRecord[];
  const recentProjects = recentProjectIds
    .filter((id) => !pinnedProjectIds.includes(id))
    .map((id) => projectMap.get(id))
    .filter(Boolean)
    .slice(0, 4) as ProjectRecord[];

  return (
    <div className="my-2 border-y border-[#333] py-2">
      <div className="relative mx-1.5">
        <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#666]" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索项目 / 渠道"
          className="h-8 w-full rounded-md border border-[#3a3a3a] bg-[#1E1E1E] pl-8 pr-7 text-xs text-[#ccc] outline-none transition placeholder:text-[#555] focus:border-[#4A90E2]/60"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[#666] hover:text-[#aaa]"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {q ? (
        <div className="mx-1.5 mt-1.5 max-h-56 overflow-y-auto rounded-md border border-[#333] bg-[#252525] p-1 custom-scrollbar">
          {matchingProjects.map((project) => (
            <div key={project.id} className="group flex items-center gap-1 rounded-md hover:bg-[#333]">
              <button
                type="button"
                onClick={() => onOpenProject(project.id)}
                className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-xs text-[#ccc]"
              >
                <Star size={12} className={pinnedProjectIds.includes(project.id) ? 'fill-[#FBBF24] text-[#FBBF24]' : 'text-[#666]'} />
                <span className="truncate">{project.name}</span>
                <span className="ml-auto shrink-0 text-[10px] text-[#666]">{project._count?.assets || 0}</span>
              </button>
              <button
                type="button"
                onClick={() => onTogglePin(project.id)}
                className="mr-1 rounded p-1 text-[#666] opacity-0 transition hover:text-[#FBBF24] group-hover:opacity-100"
                title={pinnedProjectIds.includes(project.id) ? '取消置顶' : '置顶项目'}
              >
                <Star size={12} className={pinnedProjectIds.includes(project.id) ? 'fill-current' : ''} />
              </button>
            </div>
          ))}

          {matchingChannels.map((channel) => (
            <button
              key={channel.id}
              type="button"
              onClick={() => onOpenChannel(channel.projectId, channel.id)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-[#aaa] transition hover:bg-[#333] hover:text-white"
            >
              <GitBranch size={12} className="shrink-0 text-[#8B5CF6]" />
              <span className="min-w-0 flex-1 truncate">{projectMap.get(channel.projectId)?.name || '项目'} / {channel.name}</span>
            </button>
          ))}

          {matchingProjects.length === 0 && matchingChannels.length === 0 && (
            <p className="px-2 py-3 text-center text-[11px] text-[#666]">没有匹配的项目或渠道</p>
          )}
        </div>
      ) : (
        <div className="mx-1.5 mt-2 space-y-2">
          {pinnedProjects.length > 0 && (
            <QuickProjectSection
              label="置顶"
              icon={<Star size={11} className="fill-[#FBBF24] text-[#FBBF24]" />}
              projects={pinnedProjects.slice(0, 4)}
              onOpen={onOpenProject}
              onUnpin={onTogglePin}
            />
          )}
          {recentProjects.length > 0 && (
            <QuickProjectSection
              label="最近"
              icon={<Clock3 size={11} />}
              projects={recentProjects}
              onOpen={onOpenProject}
            />
          )}
        </div>
      )}

      <a
        href={MATERIAL_WORKBENCH_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mx-1.5 mt-2 flex items-center gap-2.5 rounded-md border-l-2 border-transparent px-2.5 py-2 text-sm text-[#aaa] transition-colors hover:bg-[#333] hover:text-white"
        title="打开素材工作台"
      >
        <BarChart3 size={16} className="shrink-0" />
        <span className="truncate flex-1">素材工作台</span>
        <ExternalLink size={12} className="shrink-0 opacity-60" />
      </a>
    </div>
  );
}

function QuickProjectSection({
  label,
  icon,
  projects,
  onOpen,
  onUnpin,
}: {
  label: string;
  icon: React.ReactNode;
  projects: ProjectRecord[];
  onOpen: (id: string) => void;
  onUnpin?: (id: string) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 px-1 text-[10px] font-medium uppercase tracking-wider text-[#666]">
        {icon}
        {label}
      </div>
      <div className="space-y-0.5">
        {projects.map((project) => (
          <div key={project.id} className="group flex items-center rounded-md hover:bg-[#333]">
            <button
              type="button"
              onClick={() => onOpen(project.id)}
              className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-xs text-[#aaa] hover:text-white"
              title={project.name}
            >
              {project.name}
            </button>
            <span className="mr-1 text-[10px] tabular-nums text-[#666]">{project._count?.assets || 0}</span>
            {onUnpin && (
              <button
                type="button"
                onClick={() => onUnpin(project.id)}
                className="mr-1 rounded p-1 text-[#666] opacity-0 transition hover:text-[#FBBF24] group-hover:opacity-100"
                title="取消置顶"
              >
                <Star size={11} className="fill-current" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AdvancedFiltersBar() {
  const rawAssets = useAssetStore((state) => state.rawAssets);
  const assets = useAssetStore((state) => state.assets);
  const aspectFilter = useAssetStore((state) => state.aspectFilter);
  const setAspectFilter = useAssetStore((state) => state.setAspectFilter);
  const dimensionFilter = useAssetStore((state) => state.dimensionFilter);
  const setDimensionFilter = useAssetStore((state) => state.setDimensionFilter);
  const dateFilter = useAssetStore((state) => state.dateFilter);
  const setDateFilter = useAssetStore((state) => state.setDateFilter);
  const fileSizeFilter = useAssetStore((state) => state.fileSizeFilter);
  const setFileSizeFilter = useAssetStore((state) => state.setFileSizeFilter);
  const extensionFilter = useAssetStore((state) => state.extensionFilter);
  const setExtensionFilter = useAssetStore((state) => state.setExtensionFilter);
  const clearAdvancedFilters = useAssetStore((state) => state.clearAdvancedFilters);
  const setSelectedAsset = useAssetStore((state) => state.setSelectedAsset);

  const activeCount = [aspectFilter, dimensionFilter, dateFilter, fileSizeFilter, extensionFilter]
    .filter((value) => value !== 'all').length;

  const change = <T,>(setter: (value: T) => void, value: T) => {
    setter(value);
    setSelectedAsset(null);
  };

  const aspectButtons: { value: AspectFilter; label: string }[] = [
    { value: 'landscape', label: '横版' },
    { value: 'portrait', label: '竖版' },
    { value: 'square', label: '1:1' },
    { value: '16:9', label: '16:9' },
    { value: '9:16', label: '9:16' },
  ];

  return (
    <div className="scgl-advanced-filter-bar mb-3 rounded-lg border border-[#333] bg-[#252525] px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-1 flex items-center gap-1.5 text-xs font-semibold text-[#aaa]">
          <SlidersHorizontal size={13} />
          快速筛选
        </div>

        <div className="flex items-center gap-1 rounded-md border border-[#3a3a3a] bg-[#1E1E1E] p-0.5">
          {aspectButtons.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => change(setAspectFilter, aspectFilter === item.value ? 'all' : item.value)}
              className={`h-7 rounded px-2 text-[11px] transition ${
                aspectFilter === item.value
                  ? 'bg-[#4A90E2] text-white'
                  : 'text-[#888] hover:bg-[#333] hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <FilterSelect<AspectFilter>
          value={aspectFilter}
          onChange={(value) => change(setAspectFilter, value)}
          ariaLabel="比例"
          options={[
            ['all', '全部比例'], ['3:5', '3:5'], ['2:3', '2:3'],
          ]}
        />
        <FilterSelect<DimensionFilter>
          value={dimensionFilter}
          onChange={(value) => change(setDimensionFilter, value)}
          ariaLabel="尺寸"
          options={[
            ['all', '全部尺寸'], ['1920x1080', '1920×1080'], ['1080x1920', '1080×1920'],
            ['1024x1024', '1024×1024'], ['960x1600', '960×1600'], ['750x1350', '750×1350'], ['640x960', '640×960'],
          ]}
        />
        <FilterSelect<DateFilter>
          value={dateFilter}
          onChange={(value) => change(setDateFilter, value)}
          ariaLabel="日期"
          options={[
            ['all', '全部日期'], ['today', '今天'], ['7d', '最近7天'], ['30d', '最近30天'],
          ]}
        />
        <FilterSelect<FileSizeFilter>
          value={fileSizeFilter}
          onChange={(value) => change(setFileSizeFilter, value)}
          ariaLabel="文件大小"
          options={[
            ['all', '全部大小'], ['lt1', '< 1MB'], ['1to5', '1–5MB'], ['gt5', '> 5MB'],
          ]}
        />
        <FilterSelect<ExtensionFilter>
          value={extensionFilter}
          onChange={(value) => change(setExtensionFilter, value)}
          ariaLabel="格式"
          options={[
            ['all', '全部格式'], ['png', 'PNG'], ['jpg', 'JPG'], ['webp', 'WebP'], ['psd', 'PSD'], ['video', '视频'],
          ]}
        />

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] tabular-nums text-[#666]">
            {activeCount > 0 ? `${assets.length} / ${rawAssets.length}` : `${rawAssets.length} 个素材`}
          </span>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={() => {
                clearAdvancedFilters();
                setSelectedAsset(null);
              }}
              className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-[#888] transition hover:bg-[#333] hover:text-white"
            >
              <RotateCcw size={11} />
              清除 {activeCount}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterSelect<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: [T, string][];
  ariaLabel: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
      className={`h-8 rounded-md border px-2 text-[11px] outline-none transition ${
        value === 'all'
          ? 'border-[#3a3a3a] bg-[#252525] text-[#888]'
          : 'border-[#4A90E2]/50 bg-[#4A90E2]/10 text-[#4A90E2]'
      }`}
    >
      {options.map(([optionValue, label]) => (
        <option key={optionValue} value={optionValue}>{label}</option>
      ))}
    </select>
  );
}
