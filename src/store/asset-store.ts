import { create } from 'zustand';
import type { AssetRecord, ProjectRecord, ChannelRecord } from '@/lib/file-utils';

type ViewMode = 'list' | 'grid';
type SortBy = 'name' | 'size' | 'date' | 'type';
type SortOrder = 'asc' | 'desc';
type TypeFilter = 'all' | 'image' | 'video' | 'document';
export type AspectFilter = 'all' | 'landscape' | 'portrait' | 'square' | '16:9' | '9:16' | '3:5' | '2:3';
export type DimensionFilter = 'all' | '1920x1080' | '1080x1920' | '1024x1024' | '960x1600' | '750x1350' | '640x960';
export type DateFilter = 'all' | 'today' | '7d' | '30d';
export type FileSizeFilter = 'all' | 'lt1' | '1to5' | 'gt5';
export type ExtensionFilter = 'all' | 'png' | 'jpg' | 'webp' | 'psd' | 'video';

function extensionOf(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return ext === 'jpeg' ? 'jpg' : ext;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function applyAdvancedFilters(
  list: AssetRecord[],
  filters: Pick<AssetStore, 'aspectFilter' | 'dimensionFilter' | 'dateFilter' | 'fileSizeFilter' | 'extensionFilter'>,
) {
  const now = new Date();
  const MB = 1024 * 1024;

  return list.filter((asset) => {
    const width = asset.width || 0;
    const height = asset.height || 0;

    if (filters.dimensionFilter !== 'all') {
      const [w, h] = filters.dimensionFilter.split('x').map(Number);
      if (width !== w || height !== h) return false;
    }

    if (filters.aspectFilter !== 'all') {
      if (!width || !height) return false;
      const ratio = width / height;
      const near = (target: number, tolerance = 0.035) => Math.abs(ratio - target) <= tolerance;
      if (filters.aspectFilter === 'landscape' && ratio <= 1.05) return false;
      if (filters.aspectFilter === 'portrait' && ratio >= 0.95) return false;
      if (filters.aspectFilter === 'square' && !near(1, 0.04)) return false;
      if (filters.aspectFilter === '16:9' && !near(16 / 9)) return false;
      if (filters.aspectFilter === '9:16' && !near(9 / 16)) return false;
      if (filters.aspectFilter === '3:5' && !near(3 / 5)) return false;
      if (filters.aspectFilter === '2:3' && !near(2 / 3)) return false;
    }

    if (filters.dateFilter !== 'all') {
      const created = new Date(asset.createdAt);
      const age = now.getTime() - created.getTime();
      if (filters.dateFilter === 'today' && !isSameDay(created, now)) return false;
      if (filters.dateFilter === '7d' && age > 7 * 24 * 60 * 60 * 1000) return false;
      if (filters.dateFilter === '30d' && age > 30 * 24 * 60 * 60 * 1000) return false;
    }

    if (filters.fileSizeFilter === 'lt1' && asset.fileSize >= MB) return false;
    if (filters.fileSizeFilter === '1to5' && (asset.fileSize < MB || asset.fileSize > 5 * MB)) return false;
    if (filters.fileSizeFilter === 'gt5' && asset.fileSize <= 5 * MB) return false;

    if (filters.extensionFilter !== 'all') {
      const ext = extensionOf(asset.originalName);
      if (filters.extensionFilter === 'video') {
        if (!['mp4', 'mov', 'avi', 'webm', 'mkv'].includes(ext)) return false;
      } else if (ext !== filters.extensionFilter) {
        return false;
      }
    }

    return true;
  });
}

interface AssetStore {
  // View state
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  // Search
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  // Sort
  sortBy: SortBy;
  setSortBy: (sortBy: SortBy) => void;
  sortOrder: SortOrder;
  setSortOrder: (order: SortOrder) => void;
  toggleSortOrder: () => void;

  // Type filter
  typeFilter: TypeFilter;
  setTypeFilter: (filter: TypeFilter) => void;

  // Advanced filters
  aspectFilter: AspectFilter;
  setAspectFilter: (filter: AspectFilter) => void;
  dimensionFilter: DimensionFilter;
  setDimensionFilter: (filter: DimensionFilter) => void;
  dateFilter: DateFilter;
  setDateFilter: (filter: DateFilter) => void;
  fileSizeFilter: FileSizeFilter;
  setFileSizeFilter: (filter: FileSizeFilter) => void;
  extensionFilter: ExtensionFilter;
  setExtensionFilter: (filter: ExtensionFilter) => void;
  clearAdvancedFilters: () => void;

  // Selection
  selectedAsset: AssetRecord | null;
  setSelectedAsset: (asset: AssetRecord | null) => void;

  // Preview
  previewAsset: AssetRecord | null;
  setPreviewAsset: (asset: AssetRecord | null) => void;
  isPreviewOpen: boolean;
  setPreviewOpen: (open: boolean) => void;
  previewAssetsList: AssetRecord[];
  setPreviewAssetsList: (list: AssetRecord[]) => void;

  // Assets list
  rawAssets: AssetRecord[];
  assets: AssetRecord[];
  setAssets: (assets: AssetRecord[]) => void;

  // Upload state
  isUploading: boolean;
  setIsUploading: (uploading: boolean) => void;
  uploadProgress: number;
  setUploadProgress: (progress: number) => void;

  // Rename dialog
  renameAsset: AssetRecord | null;
  setRenameAsset: (asset: AssetRecord | null) => void;
  isRenameOpen: boolean;
  setRenameOpen: (open: boolean) => void;

  // Refresh trigger
  refreshKey: number;
  triggerRefresh: () => void;

  // Projects
  projects: ProjectRecord[];
  setProjects: (projects: ProjectRecord[]) => void;
  activeProjectId: string | null;
  setActiveProjectId: (id: string | null) => void;
  isCreateProjectOpen: boolean;
  setCreateProjectOpen: (open: boolean) => void;
  renameProject: ProjectRecord | null;
  setRenameProject: (project: ProjectRecord | null) => void;

  // Channels
  channels: ChannelRecord[];
  setChannels: (channels: ChannelRecord[]) => void;
  activeChannelId: string | null;
  setActiveChannelId: (id: string | null) => void;
  isCreateChannelOpen: boolean;
  setCreateChannelOpen: (open: boolean) => void;
  renameChannel: ChannelRecord | null;
  setRenameChannel: (channel: ChannelRecord | null) => void;
}

const defaultAdvancedFilters = {
  aspectFilter: 'all' as AspectFilter,
  dimensionFilter: 'all' as DimensionFilter,
  dateFilter: 'all' as DateFilter,
  fileSizeFilter: 'all' as FileSizeFilter,
  extensionFilter: 'all' as ExtensionFilter,
};

export const useAssetStore = create<AssetStore>((set) => ({
  viewMode: 'list',
  setViewMode: (mode) => set({ viewMode: mode }),

  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),

  sortBy: 'date',
  setSortBy: (sortBy) => set({ sortBy }),
  sortOrder: 'desc',
  setSortOrder: (order) => set({ sortOrder: order }),
  toggleSortOrder: () => set((state) => ({ sortOrder: state.sortOrder === 'asc' ? 'desc' : 'asc' })),

  typeFilter: 'all',
  setTypeFilter: (filter) => set({ typeFilter: filter }),

  ...defaultAdvancedFilters,
  setAspectFilter: (filter) => set((state) => {
    const next = { ...state, aspectFilter: filter };
    return { aspectFilter: filter, assets: applyAdvancedFilters(state.rawAssets, next) };
  }),
  setDimensionFilter: (filter) => set((state) => {
    const next = { ...state, dimensionFilter: filter };
    return { dimensionFilter: filter, assets: applyAdvancedFilters(state.rawAssets, next) };
  }),
  setDateFilter: (filter) => set((state) => {
    const next = { ...state, dateFilter: filter };
    return { dateFilter: filter, assets: applyAdvancedFilters(state.rawAssets, next) };
  }),
  setFileSizeFilter: (filter) => set((state) => {
    const next = { ...state, fileSizeFilter: filter };
    return { fileSizeFilter: filter, assets: applyAdvancedFilters(state.rawAssets, next) };
  }),
  setExtensionFilter: (filter) => set((state) => {
    const next = { ...state, extensionFilter: filter };
    return { extensionFilter: filter, assets: applyAdvancedFilters(state.rawAssets, next) };
  }),
  clearAdvancedFilters: () => set((state) => ({
    ...defaultAdvancedFilters,
    assets: applyAdvancedFilters(state.rawAssets, defaultAdvancedFilters),
  })),

  selectedAsset: null,
  setSelectedAsset: (asset) => set({ selectedAsset: asset }),

  previewAsset: null,
  setPreviewAsset: (asset) => set({ previewAsset: asset }),
  isPreviewOpen: false,
  setPreviewOpen: (open) => set({ isPreviewOpen: open }),
  previewAssetsList: [],
  setPreviewAssetsList: (list) => set({ previewAssetsList: list }),

  rawAssets: [],
  assets: [],
  setAssets: (assets) => set((state) => ({
    rawAssets: assets,
    assets: applyAdvancedFilters(assets, state),
  })),

  isUploading: false,
  setIsUploading: (uploading) => set({ isUploading: uploading }),
  uploadProgress: 0,
  setUploadProgress: (progress) => set({ uploadProgress: progress }),

  renameAsset: null,
  setRenameAsset: (asset) => set({ renameAsset: asset }),
  isRenameOpen: false,
  setRenameOpen: (open) => set({ isRenameOpen: open }),

  refreshKey: 0,
  triggerRefresh: () => set((state) => ({ refreshKey: state.refreshKey + 1 })),

  projects: [],
  setProjects: (projects) => set({ projects }),
  activeProjectId: null,
  setActiveProjectId: (id) => set({ activeProjectId: id, activeChannelId: null }),
  isCreateProjectOpen: false,
  setCreateProjectOpen: (open) => set({ isCreateProjectOpen: open }),
  renameProject: null,
  setRenameProject: (project) => set({ renameProject: project }),

  channels: [],
  setChannels: (channels) => set({ channels }),
  activeChannelId: null,
  setActiveChannelId: (id) => set({ activeChannelId: id }),
  isCreateChannelOpen: false,
  setCreateChannelOpen: (open) => set({ isCreateChannelOpen: open }),
  renameChannel: null,
  setRenameChannel: (channel) => set({ renameChannel: channel }),
}));
