'use client';

import { useEffect, useState } from 'react';
import { useAssetStore } from '@/store/asset-store';

const EXPANDED_PROJECTS_KEY = 'project-expanded-ids';
const RECENT_EXPANDED_KEY = 'scgl-recent-projects-expanded';

export function SidebarAccordionController() {
  const projects = useAssetStore((state) => state.projects);
  const activeProjectId = useAssetStore((state) => state.activeProjectId);
  const [recentExpanded, setRecentExpanded] = useState(false);

  useEffect(() => {
    setRecentExpanded(localStorage.getItem(RECENT_EXPANDED_KEY) === 'true');
  }, []);

  // Keep the project tree compact: whenever the active project changes,
  // collapse every other project and open only the active one.
  useEffect(() => {
    let timer: number | undefined;

    const syncProjectAccordion = () => {
      const nav = document.querySelector('nav.flex-1') as HTMLElement | null;
      if (!nav || projects.length === 0) return;

      const targetProjectId = activeProjectId && activeProjectId !== 'unassigned'
        ? activeProjectId
        : null;

      const projectRows = Array.from(nav.querySelectorAll<HTMLButtonElement>('button'))
        .filter((button) => {
          if (button.closest('[data-scgl-workbench-sidebar]')) return false;
          return Boolean(button.querySelector('svg.lucide-chevron-down'));
        });

      for (const project of projects) {
        const row = projectRows.find((button) =>
          Array.from(button.querySelectorAll('span')).some(
            (span) => span.textContent?.trim() === project.name,
          ),
        );
        if (!row) continue;

        const chevron = row.querySelector('svg.lucide-chevron-down');
        if (!chevron) continue;

        const isExpanded = chevron.classList.contains('rotate-0');
        const shouldExpand = targetProjectId === project.id;

        if (isExpanded !== shouldExpand) {
          chevron.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        }
      }

      localStorage.setItem(
        EXPANDED_PROJECTS_KEY,
        JSON.stringify(targetProjectId ? [targetProjectId] : []),
      );
    };

    // The sidebar is rendered client-side, so run once after React has flushed.
    timer = window.setTimeout(syncProjectAccordion, 80);
    const secondPass = window.setTimeout(syncProjectAccordion, 260);

    return () => {
      if (timer) window.clearTimeout(timer);
      window.clearTimeout(secondPass);
    };
  }, [activeProjectId, projects]);

  // The injected "最近" section is a shortcut block. Keep it collapsed by
  // default, but allow the user to expand it and remember that preference.
  useEffect(() => {
    let observer: MutationObserver | null = null;

    const bindRecentSection = () => {
      const sidebar = document.querySelector('[data-scgl-workbench-sidebar]');
      if (!sidebar) return;

      const heading = Array.from(sidebar.querySelectorAll<HTMLElement>('div')).find(
        (node) => node.textContent?.trim() === '最近'
          && node.className.includes('uppercase')
          && node.className.includes('tracking-wider'),
      );
      if (!heading) return;

      const list = heading.nextElementSibling as HTMLElement | null;
      if (!list) return;

      heading.setAttribute('data-scgl-recent-toggle', '1');
      heading.setAttribute('data-expanded', recentExpanded ? 'true' : 'false');
      heading.setAttribute('role', 'button');
      heading.setAttribute('tabindex', '0');
      heading.setAttribute('aria-expanded', recentExpanded ? 'true' : 'false');
      heading.title = recentExpanded ? '收起最近项目' : '展开最近项目';
      list.hidden = !recentExpanded;

      const toggle = () => {
        setRecentExpanded((current) => {
          const next = !current;
          localStorage.setItem(RECENT_EXPANDED_KEY, String(next));
          return next;
        });
      };

      heading.onclick = toggle;
      heading.onkeydown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggle();
        }
      };
    };

    bindRecentSection();
    observer = new MutationObserver(bindRecentSection);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer?.disconnect();
  }, [recentExpanded]);

  return null;
}
