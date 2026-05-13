import { create } from 'zustand';
import type { AssetRecord, ProjectRecord, ChannelRecord } from '@/lib/file-utils';

type ViewMode = 'list' | 'grid';
type SortBy = 'name' | 'size' | 'date' | 'type';
type SortOrder = 'asc' | 'desc';
type TypeFilter = 'all' | 'image' | 'video' | 'document';

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
  activeProjectId: string | null; // null = all, 'unassigned' = no project, uuid = specific project
  setActiveProjectId: (id: string | null) => void;
  isCreateProjectOpen: boolean;
  setCreateProjectOpen: (open: boolean) => void;
  renameProject: ProjectRecord | null;
  setRenameProject: (project: ProjectRecord | null) => void;

  // Channels
  channels: ChannelRecord[];
  setChannels: (channels: ChannelRecord[]) => void;
  activeChannelId: string | null; // null = all (show all in current project), 'unassigned' = no channel, uuid = specific channel
  setActiveChannelId: (id: string | null) => void;
  isCreateChannelOpen: boolean;
  setCreateChannelOpen: (open: boolean) => void;
  renameChannel: ChannelRecord | null;
  setRenameChannel: (channel: ChannelRecord | null) => void;
}

export const useAssetStore = create<AssetStore>((set) => ({
  // View state
  viewMode: 'list',
  setViewMode: (mode) => set({ viewMode: mode }),

  // Search
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),

  // Sort
  sortBy: 'date',
  setSortBy: (sortBy) => set({ sortBy }),
  sortOrder: 'desc',
  setSortOrder: (order) => set({ sortOrder: order }),
  toggleSortOrder: () => set((state) => ({ sortOrder: state.sortOrder === 'asc' ? 'desc' : 'asc' })),

  // Type filter
  typeFilter: 'all',
  setTypeFilter: (filter) => set({ typeFilter: filter }),

  // Selection
  selectedAsset: null,
  setSelectedAsset: (asset) => set({ selectedAsset: asset }),

  // Preview
  previewAsset: null,
  setPreviewAsset: (asset) => set({ previewAsset: asset }),
  isPreviewOpen: false,
  setPreviewOpen: (open) => set({ isPreviewOpen: open }),
  previewAssetsList: [],
  setPreviewAssetsList: (list) => set({ previewAssetsList: list }),

  // Assets list
  assets: [],
  setAssets: (assets) => set({ assets }),

  // Upload state
  isUploading: false,
  setIsUploading: (uploading) => set({ isUploading: uploading }),
  uploadProgress: 0,
  setUploadProgress: (progress) => set({ uploadProgress: progress }),

  // Rename dialog
  renameAsset: null,
  setRenameAsset: (asset) => set({ renameAsset: asset }),
  isRenameOpen: false,
  setRenameOpen: (open) => set({ isRenameOpen: open }),

  // Refresh trigger
  refreshKey: 0,
  triggerRefresh: () => set((state) => ({ refreshKey: state.refreshKey + 1 })),

  // Projects
  projects: [],
  setProjects: (projects) => set({ projects }),
  activeProjectId: null,
  setActiveProjectId: (id) => set({ activeProjectId: id, activeChannelId: null }),
  isCreateProjectOpen: false,
  setCreateProjectOpen: (open) => set({ isCreateProjectOpen: open }),
  renameProject: null,
  setRenameProject: (project) => set({ renameProject: project }),

  // Channels
  channels: [],
  setChannels: (channels) => set({ channels }),
  activeChannelId: null,
  setActiveChannelId: (id) => set({ activeChannelId: id }),
  isCreateChannelOpen: false,
  setCreateChannelOpen: (open) => set({ isCreateChannelOpen: open }),
  renameChannel: null,
  setRenameChannel: (channel) => set({ renameChannel: channel }),
}));
