'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { BarChart3, History } from 'lucide-react';
import { TodayUpdatesPanel } from '@/components/today-updates-panel';
import type { AssetRecord, ProjectRecord, ChannelRecord } from '@/lib/file-utils';

type Mounts = {
  main: HTMLElement | null;
  sidebar: HTMLElement | null;
  header: HTMLElement | null;
};

export function WorkbenchInjector() {
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [channels, setChannels] = useState<ChannelRecord[]>([]);
  const [mounts, setMounts] = useState<Mounts>({ main: null, sidebar: null, header: null });

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

      setMounts({ main: mainMount, sidebar: sidebarMount, header: headerMount });
    };

    install();
    const timer = window.setTimeout(install, 500);
    return () => {
      window.clearTimeout(timer);
      for (const node of created) node.remove();
    };
  }, []);

  const scrollToWorkbench = () => {
    document.getElementById('today-updates')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const mainPortal = useMemo(() => mounts.main ? createPortal(
    <TodayUpdatesPanel assets={assets} projects={projects} channels={channels} />,
    mounts.main,
  ) : null, [mounts.main, assets, projects, channels]);

  const sidebarPortal = useMemo(() => mounts.sidebar ? createPortal(
    <button
      type="button"
      onClick={scrollToWorkbench}
      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors mb-0.5 text-[#aaa] hover:text-white hover:bg-[#333] border-l-2 border-transparent"
      title="素材工作台"
    >
      <BarChart3 size={16} className="shrink-0" />
      <span className="truncate">素材工作台</span>
    </button>,
    mounts.sidebar,
  ) : null, [mounts.sidebar]);

  const headerPortal = useMemo(() => mounts.header ? createPortal(
    <button
      type="button"
      onClick={scrollToWorkbench}
      className="mr-1 inline-flex h-8 items-center gap-1.5 rounded-md border border-[#3a3a3a] bg-[#252525] px-2.5 text-xs text-[#aaa] transition hover:bg-[#333] hover:text-white"
    >
      <History size={14} />
      更新动态
    </button>,
    mounts.header,
  ) : null, [mounts.header]);

  return <>{mainPortal}{sidebarPortal}{headerPortal}</>;
}
