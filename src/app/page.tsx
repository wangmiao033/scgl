'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useAssetStore } from '@/store/asset-store';
import {
  formatFileSize,
  formatDate,
  formatDimensions,
  getFileTypeLabel,
  getFileTypeColor,
  getFileExtension,
  isImageFile,
  isVideoFile,
  categorizeFile,
  IMAGE_EXTENSIONS,
  ACCEPTED_EXTENSIONS,
  type AssetRecord,
  type ProjectRecord,
  type ChannelRecord,
} from '@/lib/file-utils';

// Icons
import {
  Upload,
  Search,
  LayoutList,
  LayoutGrid,
  Trash2,
  Edit3,
  X,
  Image as ImageIcon,
  Film,
  FileText,
  File,
  FolderOpen,
  MoreVertical,
  Info,
  CheckSquare,
  Square,
  ArrowUpDown,
  Check,
  FolderPlus,
  Inbox,
  Layers,
  ChevronLeft,
  ChevronRight,
  Folder,
  FolderInput,
  Download,
  ChevronDown,
  ChevronUp,
  Keyboard,
  Copy,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  BarChart3,
  Package,
  ImagePlus,
  GitBranch,
  Plus,
} from 'lucide-react';

// UI Components
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';

// Project color palette
const PROJECT_COLORS = ['#4A90E2', '#E8A035', '#A855F7', '#F97316', '#34D399', '#F472B6', '#FBBF24', '#6B7280', '#10B981', '#8B5CF6'];

function getProjectColor(index: number): string {
  return PROJECT_COLORS[index % PROJECT_COLORS.length];
}

// Channel color palette (lighter tones for sub-items)
const CHANNEL_COLORS = ['#6BB5F0', '#F0C56B', '#C084FC', '#FB923C', '#5EEAD4', '#F9A8D4', '#FCD34D', '#9CA3AF', '#34D399', '#A78BFA'];

function getChannelColor(index: number): string {
  return CHANNEL_COLORS[index % CHANNEL_COLORS.length];
}

// Helper: get thumbnail URL or fallback to full asset
function getThumbnailUrl(fileName: string): string {
  return `/api/upload/thumbnails/${fileName}`;
}

// Helper: download a file programmatically
function downloadFile(asset: AssetRecord) {
  const link = document.createElement('a');
  link.href = `/api/upload/assets/${asset.fileName}?download=1`;
  link.download = asset.originalName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Helper: copy text to clipboard
async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label}已复制`);
  } catch {
    toast.error('复制失败');
  }
}

// Helper: copy image to clipboard
async function copyImage(asset: AssetRecord) {
  try {
    const response = await fetch(`/api/upload/assets/${asset.fileName}`);
    const blob = await response.blob();
    const itemType = asset.mimeType || 'image/png';
    await navigator.clipboard.write([
      new ClipboardItem({ [itemType]: blob }),
    ]);
    toast.success('图片已复制到剪贴板');
  } catch {
    toast.error('复制图片失败，请重试');
  }
}

// ─── SVG Logo Component ──────────────────────────────────────────
function AppLogo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4A90E2" />
          <stop offset="100%" stopColor="#A855F7" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="28" height="28" rx="6" stroke="url(#logoGradient)" strokeWidth="2.5" fill="none" />
      <rect x="6" y="6" width="20" height="20" rx="3" fill="url(#logoGradient)" opacity="0.15" />
      <circle cx="13" cy="13" r="4" stroke="url(#logoGradient)" strokeWidth="2" fill="none" />
      <path d="M6 22 L12 17 L17 20 L22 15 L26 18" stroke="url(#logoGradient)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="23" cy="10" r="2.5" fill="url(#logoGradient)" opacity="0.7" />
    </svg>
  );
}

// ─── Hover Mini Preview ──────────────────────────────────────────
function HoverPreview({
  asset,
  visible,
  position,
}: {
  asset: AssetRecord;
  visible: boolean;
  position: { x: number; y: number };
}) {
  const isImage = isImageFile(asset.originalName);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const imgSrc = getThumbnailUrl(asset.fileName);

  if (!visible) return null;

  // Calculate position to stay within viewport
  const previewWidth = 320;
  const previewHeight = 220;
  let left = position.x + 16;
  let top = position.y - previewHeight / 2;

  if (left + previewWidth > typeof window !== 'undefined' ? window.innerWidth - 16 : 1000) {
    left = position.x - previewWidth - 16;
  }
  if (top < 8) top = 8;
  if (typeof window !== 'undefined' && top + previewHeight > window.innerHeight - 8) {
    top = (typeof window !== 'undefined' ? window.innerHeight : 800) - previewHeight - 8;
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ duration: 0.15 }}
      className="fixed z-[100] pointer-events-none"
      style={{ left, top }}
    >
      <div className="bg-[#2D2D2D] border border-[#444] rounded-lg shadow-2xl overflow-hidden" style={{ width: previewWidth }}>
        {isImage && !imgError ? (
          <div className="relative" style={{ height: previewHeight }}>
            {!imgLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#1E1E1E]">
                <div className="w-6 h-6 border-2 border-[#4A90E2] border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            <img
              src={imgSrc}
              alt={asset.originalName}
              loading="lazy"
              className={`w-full h-full object-contain bg-[#1E1E1E] transition-opacity duration-200 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center bg-[#1E1E1E]" style={{ height: previewHeight }}>
            <div className="flex flex-col items-center gap-3 text-[#777]">
              <File size={40} />
              <span className="text-xs">不支持预览</span>
            </div>
          </div>
        )}
        <div className="px-3 py-2 border-t border-[#3a3a3a] bg-[#252525]">
          <p className="text-xs text-[#ccc] truncate">{asset.originalName}</p>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-[10px] text-[#666]">{formatDimensions(asset.width, asset.height)}</span>
            <span className="text-[10px] text-[#666]">{formatFileSize(asset.fileSize)}</span>
            <Badge variant="secondary" className="text-[9px] bg-[#333] text-[#888] border-[#444] px-1.5 py-0 ml-auto">
              {getFileTypeLabel(asset.originalName)}
            </Badge>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── File Type Icon Component ────────────────────────────────────
function FileTypeIcon({ filename, size = 20 }: { filename: string; size?: number }) {
  const ext = getFileExtension(filename);
  const color = getFileTypeColor(filename);

  if (IMAGE_EXTENSIONS.has(ext)) {
    return <ImageIcon size={size} style={{ color }} strokeWidth={1.5} />;
  }
  if (isVideoFile(filename)) {
    return <Film size={size} style={{ color }} strokeWidth={1.5} />;
  }
  if (ext === 'pdf') {
    return <FileText size={size} style={{ color }} strokeWidth={1.5} />;
  }
  return <File size={size} style={{ color }} strokeWidth={1.5} />;
}

// ─── Upload Zone (Collapsible) with drag preview ─────────────────
function UploadZone() {
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragFiles, setDragFiles] = useState<{ name: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isUploading, setIsUploading, uploadProgress, setUploadProgress, triggerRefresh, activeProjectId, activeChannelId } = useAssetStore();

  // Collapsible upload zone with localStorage persistence
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [hasUploadedOnce, setHasUploadedOnce] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('upload-zone-collapsed');
    if (saved === 'true') {
      setIsCollapsed(true);
    }
  }, []);

  const handleCollapseToggle = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    localStorage.setItem('upload-zone-collapsed', String(next));
  };

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const validFiles = fileArray.filter((f) => {
      const ext = getFileExtension(f.name);
      return ACCEPTED_EXTENSIONS.has(ext);
    });

    if (validFiles.length === 0) {
      toast.error('没有支持的文件类型');
      return;
    }

    if (validFiles.length < fileArray.length) {
      toast.warning(`${fileArray.length - validFiles.length} 个文件类型不支持，已跳过`);
    }

    setIsUploading(true);
    setUploadProgress(10);

    try {
      const formData = new FormData();
      validFiles.forEach((f) => formData.append('files', f));

      // Add projectId if we're in a specific project context
      if (activeProjectId && activeProjectId !== 'unassigned') {
        formData.append('projectId', activeProjectId);
      }
      // Add channelId if we're in a specific channel context
      if (activeChannelId && activeChannelId !== 'unassigned') {
        formData.append('channelId', activeChannelId);
      }

      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 15, 90));
      }, 200);

      const response = await fetch('/api/assets/upload', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);

      if (!response.ok) throw new Error('Upload failed');

      setUploadProgress(100);
      const data = await response.json();
      toast.success(`成功上传 ${data.count} 个文件`);
      triggerRefresh();

      // After first successful upload, mark so collapse is available
      setHasUploadedOnce(true);

      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
      }, 500);
    } catch {
      toast.error('上传失败，请重试');
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, [setIsUploading, setUploadProgress, triggerRefresh, activeProjectId, activeChannelId]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      setDragFiles([]);
      if (isCollapsed) setIsCollapsed(false);
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles, isCollapsed]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
    // Collect file names for preview
    const files: { name: string }[] = [];
    if (e.dataTransfer.items) {
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        const entry = e.dataTransfer.items[i];
        if (entry.kind === 'file') {
          files.push({ name: entry.name });
        }
      }
    } else if (e.dataTransfer.files) {
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        files.push({ name: e.dataTransfer.files[i].name });
      }
    }
    setDragFiles(files);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    setDragFiles([]);
  }, []);

  // Collapsed thin bar
  if (isCollapsed) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-4"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => { handleCollapseToggle(); fileInputRef.current?.click(); }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={Array.from(ACCEPTED_EXTENSIONS).map(e => `.${e}`).join(',')}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <div className={`
          cursor-pointer rounded-md border border-dashed px-4 py-2
          transition-all duration-200 text-center
          ${isDragOver
            ? 'border-[#4A90E2] bg-[#4A90E2]/10'
            : 'border-[#444] bg-[#252525] hover:border-[#555] hover:bg-[#2a2a2a]'
          }
        `}>
          <div className="flex items-center justify-center gap-2 text-sm text-[#888]">
            <Upload size={14} />
            <span>点击或拖拽上传文件</span>
            <ChevronDown size={14} className="text-[#555]" />
          </div>
        </div>
      </motion.div>
    );
  }

  const maxPreviewFiles = 5;
  const extraCount = dragFiles.length - maxPreviewFiles;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      className="mb-4"
    >
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`
          relative cursor-pointer rounded-lg border-2 border-dashed px-6 py-6
          transition-all duration-200 text-center overflow-hidden
          ${isDragOver
            ? 'border-[#4A90E2] bg-[#4A90E2]/10'
            : 'border-[#444] bg-[#252525] hover:border-[#555] hover:bg-[#2a2a2a]'
          }
          ${isUploading ? 'pointer-events-none' : ''}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={Array.from(ACCEPTED_EXTENSIONS).map(e => `.${e}`).join(',')}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = '';
          }}
        />

        {isUploading && (
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${uploadProgress}%` }}
            className="absolute bottom-0 left-0 h-1 bg-[#4A90E2]"
          />
        )}

        <div className="flex flex-col items-center gap-2">
          <motion.div
            animate={isDragOver ? { scale: 1.1, y: -5 } : { scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300 }}
          >
            <Upload
              size={28}
              className={isDragOver ? 'text-[#4A90E2]' : 'text-[#666]'}
            />
          </motion.div>
          <div>
            <p className="text-sm text-[#ccc] font-medium">
              {isDragOver ? `松开鼠标上传 ${dragFiles.length} 个文件` : '拖拽文件到此处上传'}
            </p>
            <p className="text-[11px] text-[#555] mt-1">
              支持 PSD, JPG, PNG, GIF, SVG, WebP, BMP, TIFF, AI, EPS, PDF, MP4, MOV, AVI
            </p>
          </div>

          {/* Drag file list preview */}
          <AnimatePresence>
            {isDragOver && dragFiles.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-2 w-full max-w-xs"
              >
                <div className="bg-[#1E1E1E]/80 rounded-md p-2 max-h-32 overflow-y-auto custom-scrollbar">
                  {dragFiles.slice(0, maxPreviewFiles).map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-[#aaa] py-0.5">
                      <FileTypeIcon filename={f.name} size={12} />
                      <span className="truncate">{f.name}</span>
                    </div>
                  ))}
                  {extraCount > 0 && (
                    <div className="text-[10px] text-[#666] pt-1 pl-5">
                      +{extraCount} 个更多文件
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Collapse toggle */}
        {hasUploadedOnce && (
          <button
            onClick={(e) => { e.stopPropagation(); handleCollapseToggle(); }}
            className="absolute top-2 right-2 p-1 rounded text-[#555] hover:text-[#888] hover:bg-[#333]/50 transition-colors"
          >
            <ChevronUp size={14} />
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ─── Type Filter Tabs ────────────────────────────────────────────
function TypeFilterTabs({ assets }: { assets: AssetRecord[] }) {
  const { typeFilter, setTypeFilter } = useAssetStore();

  const counts = useMemo(() => {
    let image = 0;
    let video = 0;
    let document = 0;
    for (const asset of assets) {
      const cat = categorizeFile(asset.originalName);
      if (cat === 'image') image++;
      else if (cat === 'video') video++;
      else if (cat === 'document') document++;
    }
    return { all: assets.length, image, video, document };
  }, [assets]);

  const tabs = [
    { key: 'all' as const, label: '全部', icon: Layers, count: counts.all },
    { key: 'image' as const, label: '图片', icon: ImageIcon, count: counts.image },
    { key: 'video' as const, label: '视频', icon: Film, count: counts.video },
    { key: 'document' as const, label: '文档', icon: FileText, count: counts.document },
  ];

  return (
    <div className="flex items-center gap-1 mb-3">
      {tabs.map((tab) => {
        const isActive = typeFilter === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => setTypeFilter(tab.key)}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150
              ${isActive
                ? 'bg-[#4A90E2] text-white shadow-sm'
                : 'text-[#888] hover:text-[#ccc] hover:bg-[#2a2a2a]'
              }
            `}
          >
            <tab.icon size={13} />
            <span>{tab.label}</span>
            <span className={`
              text-[10px] px-1.5 py-0 rounded-full tabular-nums
              ${isActive ? 'bg-white/20 text-white' : 'bg-[#333] text-[#666]'}
            `}>
              {tab.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Storage Stats Panel ─────────────────────────────────────────
function StorageStatsPanel({ assets }: { assets: AssetRecord[] }) {
  const stats = useMemo(() => {
    const totalSize = assets.reduce((sum, a) => sum + a.fileSize, 0);
    let imageSize = 0;
    let imageCount = 0;
    let videoSize = 0;
    let videoCount = 0;
    let docSize = 0;
    let docCount = 0;
    let otherSize = 0;
    let otherCount = 0;

    for (const asset of assets) {
      const cat = categorizeFile(asset.originalName);
      if (cat === 'image') {
        imageSize += asset.fileSize;
        imageCount++;
      } else if (cat === 'video') {
        videoSize += asset.fileSize;
        videoCount++;
      } else if (cat === 'document') {
        docSize += asset.fileSize;
        docCount++;
      } else {
        otherSize += asset.fileSize;
        otherCount++;
      }
    }

    const categories = [
      { label: '图片', count: imageCount, size: imageSize, color: '#A855F7', icon: ImageIcon },
      { label: '视频', count: videoCount, size: videoSize, color: '#3B82F6', icon: Film },
      { label: '文档', count: docCount, size: docSize, color: '#E8A035', icon: FileText },
      { label: '其他', count: otherCount, size: otherSize, color: '#6B7280', icon: File },
    ].filter(c => c.count > 0);

    return { totalSize, totalCount: assets.length, categories };
  }, [assets]);

  return (
    <div className="w-72 bg-[#2D2D2D] border border-[#444] rounded-lg p-4 shadow-xl">
      {/* Summary */}
      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-[#3a3a3a]">
        <div className="w-9 h-9 rounded-lg bg-[#4A90E2]/15 flex items-center justify-center">
          <Package size={18} className="text-[#4A90E2]" />
        </div>
        <div>
          <p className="text-sm font-medium text-white">{stats.totalCount} 个文件</p>
          <p className="text-[11px] text-[#888]">总大小 {formatFileSize(stats.totalSize)}</p>
        </div>
      </div>

      {/* Categories */}
      <div className="space-y-3">
        {stats.categories.map((cat) => {
          const pct = stats.totalSize > 0 ? (cat.size / stats.totalSize) * 100 : 0;
          return (
            <div key={cat.label}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <cat.icon size={13} style={{ color: cat.color }} />
                  <span className="text-xs text-[#ccc]">{cat.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[#666]">{cat.count} 个</span>
                  <span className="text-[10px] text-[#888] tabular-nums">{formatFileSize(cat.size)}</span>
                </div>
              </div>
              <div className="h-1.5 bg-[#1E1E1E] rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(pct, 1)}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  className="h-full rounded-full"
                  style={{ backgroundColor: cat.color }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {stats.categories.length === 0 && (
        <p className="text-xs text-[#555] text-center py-4">暂无文件</p>
      )}
    </div>
  );
}

// ─── Rename Dialog ───────────────────────────────────────────────
function RenameDialog() {
  const { renameAsset, isRenameOpen, setRenameOpen, setRenameAsset, triggerRefresh } = useAssetStore();
  const [newName, setNewName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renameAsset && isRenameOpen) {
      setNewName(renameAsset.originalName);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [renameAsset, isRenameOpen]);

  const handleRename = async () => {
    if (!renameAsset || !newName.trim()) return;
    try {
      const response = await fetch(`/api/assets/${renameAsset.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName: newName.trim() }),
      });
      if (!response.ok) throw new Error('Rename failed');
      toast.success('重命名成功');
      setRenameOpen(false);
      setRenameAsset(null);
      triggerRefresh();
    } catch {
      toast.error('重命名失败');
    }
  };

  return (
    <Dialog open={isRenameOpen} onOpenChange={(open) => { setRenameOpen(open); if (!open) setRenameAsset(null); }}>
      <DialogContent className="bg-[#2D2D2D] border-[#444] text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle>重命名文件</DialogTitle>
          <DialogDescription className="sr-only">重命名文件对话框</DialogDescription>
        </DialogHeader>
        <div className="flex gap-3 mt-4">
          <Input
            ref={inputRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            className="bg-[#1E1E1E] border-[#444] text-white"
          />
          <Button onClick={handleRename} className="bg-[#4A90E2] hover:bg-[#3A80D2] text-white shrink-0">
            确认
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Preview Dialog (Enhanced) ───────────────────────────────────
function PreviewDialog() {
  const { previewAsset, isPreviewOpen, setPreviewOpen, setPreviewAsset, previewAssetsList, setPreviewAssetsList } = useAssetStore();
  const [imgError, setImgError] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [panPos, setPanPos] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Full size for preview dialog
  const imgSrc = previewAsset
    ? `/api/upload/assets/${previewAsset.fileName}`
    : null;

  const handleOpenChange = (open: boolean) => {
    setPreviewOpen(open);
    if (!open) {
      setPreviewAsset(null);
      setImgError(false);
      setZoom(1);
      setPanPos({ x: 0, y: 0 });
    }
  };

  const isImage = previewAsset ? isImageFile(previewAsset.originalName) : false;
  const isVideo = previewAsset ? isVideoFile(previewAsset.originalName) : false;

  // Navigation
  const currentIndex = previewAssetsList.findIndex(a => a.id === previewAsset?.id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < previewAssetsList.length - 1;

  const navigatePrev = useCallback(() => {
    if (!hasPrev) return;
    const prev = previewAssetsList[currentIndex - 1];
    setPreviewAsset(prev);
    setImgError(false);
    setZoom(1);
    setPanPos({ x: 0, y: 0 });
  }, [hasPrev, currentIndex, previewAssetsList, setPreviewAsset]);

  const navigateNext = useCallback(() => {
    if (!hasNext) return;
    const next = previewAssetsList[currentIndex + 1];
    setPreviewAsset(next);
    setImgError(false);
    setZoom(1);
    setPanPos({ x: 0, y: 0 });
  }, [hasNext, currentIndex, previewAssetsList, setPreviewAsset]);

  // Keyboard navigation inside preview
  useEffect(() => {
    if (!isPreviewOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') navigatePrev();
      else if (e.key === 'ArrowRight') navigateNext();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isPreviewOpen, navigatePrev, navigateNext]);

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!isImage) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setZoom(prev => Math.min(Math.max(prev + delta, 0.5), 3));
  }, [isImage]);

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom <= 1 || !isImage) return;
    e.preventDefault();
    setIsPanning(true);
    setDragStart({ x: e.clientX - panPos.x, y: e.clientY - panPos.y });
  }, [zoom, isImage, panPos]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    setPanPos({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  }, [isPanning, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Zoom controls
  const zoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3));
  const zoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5));
  const zoomFit = () => { setZoom(1); setPanPos({ x: 0, y: 0 }); };
  const zoomOriginal = () => { setZoom(1); setPanPos({ x: 0, y: 0 }); };

  return (
    <Dialog open={isPreviewOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-[#2D2D2D] border-[#444] text-white sm:max-w-5xl max-h-[92vh] flex flex-col p-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#3a3a3a] shrink-0">
          <DialogTitle className="flex items-center gap-3 truncate pr-4 text-sm">
            {previewAsset && <FileTypeIcon filename={previewAsset.originalName} size={18} />}
            <span className="truncate">{previewAsset?.originalName || '文件预览'}</span>
            {previewAssetsList.length > 1 && (
              <span className="text-[10px] text-[#666] shrink-0">
                {currentIndex + 1} / {previewAssetsList.length}
              </span>
            )}
          </DialogTitle>
          <div className="flex items-center gap-1 shrink-0">
            {/* Zoom controls for images */}
            {isImage && (
              <div className="flex items-center gap-0.5 mr-2">
                <Button variant="ghost" size="sm" onClick={zoomOut} className="h-7 w-7 p-0 text-[#888] hover:text-white hover:bg-[#333]" title="缩小">
                  <ZoomOut size={14} />
                </Button>
                <span className="text-[10px] text-[#888] w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
                <Button variant="ghost" size="sm" onClick={zoomIn} className="h-7 w-7 p-0 text-[#888] hover:text-white hover:bg-[#333]" title="放大">
                  <ZoomIn size={14} />
                </Button>
                <div className="w-px h-4 bg-[#444] mx-0.5" />
                <Button variant="ghost" size="sm" onClick={zoomFit} className="h-7 w-7 p-0 text-[#888] hover:text-white hover:bg-[#333]" title="适应窗口">
                  <Maximize2 size={14} />
                </Button>
                <Button variant="ghost" size="sm" onClick={zoomOriginal} className="h-7 w-7 p-0 text-[#888] hover:text-white hover:bg-[#333]" title="1:1 原始大小">
                  <RotateCcw size={14} />
                </Button>
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => { e.stopPropagation(); downloadFile(previewAsset!); }}
              className="h-7 w-7 p-0 text-[#888] hover:text-white hover:bg-[#333]"
            >
              <Download size={15} />
            </Button>
          </div>
        </div>
        <DialogDescription className="sr-only">
          文件预览：{previewAsset?.originalName || '未知'}
        </DialogDescription>

        {/* Preview area with zoom and pan */}
        <div
          ref={containerRef}
          className="flex-1 overflow-hidden flex items-center justify-center min-h-[280px] bg-[#1E1E1E] relative select-none"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {isImage && imgSrc && !imgError ? (
            <div
              style={{
                transform: `scale(${zoom}) translate(${panPos.x / zoom}px, ${panPos.y / zoom}px)`,
                transition: isPanning ? 'none' : 'transform 0.15s ease-out',
              }}
              className="origin-center"
            >
              <img
                src={imgSrc}
                alt={previewAsset?.originalName || ''}
                className="max-w-[80vw] max-h-[70vh] object-contain pointer-events-none"
                style={{ cursor: zoom > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default' }}
                onError={() => setImgError(true)}
                draggable={false}
              />
            </div>
          ) : isVideo && imgSrc ? (
            <video
              src={imgSrc}
              controls
              className="max-w-[80vw] max-h-[70vh]"
            >
              <track kind="captions" />
            </video>
          ) : (
            <div className="flex flex-col items-center gap-4 text-[#777]">
              {previewAsset && <FileTypeIcon filename={previewAsset.originalName} size={64} />}
              {imgError && <p className="text-sm text-red-400">图片加载失败</p>}
              {!imgError && <p className="text-sm">{isImage ? '加载中...' : '此文件类型不支持预览'}</p>}
            </div>
          )}

          {/* Navigation buttons */}
          {hasPrev && (
            <button
              onClick={navigatePrev}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-[#2D2D2D]/80 border border-[#444] flex items-center justify-center text-[#ccc] hover:text-white hover:bg-[#333] transition-colors z-10"
            >
              <ChevronLeft size={18} />
            </button>
          )}
          {hasNext && (
            <button
              onClick={navigateNext}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-[#2D2D2D]/80 border border-[#444] flex items-center justify-center text-[#ccc] hover:text-white hover:bg-[#333] transition-colors z-10"
            >
              <ChevronRight size={18} />
            </button>
          )}
        </div>

        {/* File info */}
        {previewAsset && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-3 bg-[#252525] border-t border-[#3a3a3a] shrink-0">
            <div>
              <p className="text-[10px] uppercase text-[#666] mb-0.5">尺寸</p>
              <p className="text-xs text-[#ccc]">{formatDimensions(previewAsset.width, previewAsset.height)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-[#666] mb-0.5">文件大小</p>
              <p className="text-xs text-[#ccc]">{formatFileSize(previewAsset.fileSize)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-[#666] mb-0.5">类型</p>
              <p className="text-xs text-[#ccc]">{getFileTypeLabel(previewAsset.originalName)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-[#666] mb-0.5">添加日期</p>
              <p className="text-xs text-[#ccc]">{formatDate(previewAsset.createdAt)}</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Move to Project Submenu (Context) ────────────────────────────
function MoveToProjectSubmenu({
  assetId,
  onClose,
}: {
  assetId: string;
  onClose?: () => void;
}) {
  const { projects, triggerRefresh } = useAssetStore();

  const handleMoveToProject = async (projectId: string | null) => {
    try {
      const response = await fetch(`/api/assets/${assetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      if (!response.ok) throw new Error('Move failed');
      toast.success(projectId ? '已移动到项目' : '已取消分类');
      triggerRefresh();
      onClose?.();
    } catch {
      toast.error('移动失败');
    }
  };

  if (projects.length === 0) {
    return (
      <ContextMenuItem disabled className="text-[#666]">
        <Folder size={14} className="mr-2" />
        暂无项目
      </ContextMenuItem>
    );
  }

  return (
    <>
      <ContextMenuItem onClick={() => handleMoveToProject(null)} className="text-[#ccc] hover:bg-[#333] focus:bg-[#333]">
        <Inbox size={14} className="mr-2" />
        未分类
      </ContextMenuItem>
      <ContextMenuSeparator className="bg-[#444]" />
      {projects.map((project, index) => (
        <ContextMenuItem
          key={project.id}
          onClick={() => handleMoveToProject(project.id)}
          className="text-[#ccc] hover:bg-[#333] focus:bg-[#333]"
        >
          <div className="w-3 h-3 rounded-full mr-2 shrink-0" style={{ backgroundColor: getProjectColor(index) }} />
          <span className="truncate">{project.name}</span>
        </ContextMenuItem>
      ))}
    </>
  );
}

// ─── Move to Project Submenu (Dropdown) ──────────────────────────
function MoveToProjectDropdownSubmenu({
  assetId,
  onClose,
}: {
  assetId: string;
  onClose?: () => void;
}) {
  const { projects, triggerRefresh } = useAssetStore();

  const handleMoveToProject = async (projectId: string | null) => {
    try {
      const response = await fetch(`/api/assets/${assetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      if (!response.ok) throw new Error('Move failed');
      toast.success(projectId ? '已移动到项目' : '已取消分类');
      triggerRefresh();
      onClose?.();
    } catch {
      toast.error('移动失败');
    }
  };

  if (projects.length === 0) {
    return (
      <DropdownMenuItem disabled className="text-[#666]">
        <Folder size={14} className="mr-2" />
        暂无项目
      </DropdownMenuItem>
    );
  }

  return (
    <>
      <DropdownMenuItem onClick={() => handleMoveToProject(null)} className="text-[#ccc] hover:bg-[#333] focus:bg-[#333]">
        <Inbox size={14} className="mr-2" />
        未分类
      </DropdownMenuItem>
      <DropdownMenuSeparator className="bg-[#444]" />
      {projects.map((project, index) => (
        <DropdownMenuItem
          key={project.id}
          onClick={() => handleMoveToProject(project.id)}
          className="text-[#ccc] hover:bg-[#333] focus:bg-[#333]"
        >
          <div className="w-3 h-3 rounded-full mr-2 shrink-0" style={{ backgroundColor: getProjectColor(index) }} />
          <span className="truncate">{project.name}</span>
        </DropdownMenuItem>
      ))}
    </>
  );
}

// ─── Move to Channel Submenu (Context) ────────────────────────────
function MoveToChannelSubmenu({
  assetId,
  assetProjectId,
  onClose,
}: {
  assetId: string;
  assetProjectId: string | null;
  onClose?: () => void;
}) {
  const { channels, triggerRefresh, activeProjectId } = useAssetStore();

  // Show channels for the asset's project or the active project
  const projectId = assetProjectId || (activeProjectId && activeProjectId !== 'unassigned' ? activeProjectId : null);
  const projectChannels = channels.filter(ch => ch.projectId === projectId);

  const handleMoveToChannel = async (channelId: string | null) => {
    try {
      const response = await fetch(`/api/assets/${assetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId }),
      });
      if (!response.ok) throw new Error('Move failed');
      toast.success(channelId ? '已移动到渠道' : '已取消渠道分配');
      triggerRefresh();
      onClose?.();
    } catch {
      toast.error('移动失败');
    }
  };

  if (!projectId) {
    return (
      <ContextMenuItem disabled className="text-[#666]">
        <GitBranch size={14} className="mr-2" />
        请先分配到项目
      </ContextMenuItem>
    );
  }

  if (projectChannels.length === 0) {
    return (
      <ContextMenuItem disabled className="text-[#666]">
        <GitBranch size={14} className="mr-2" />
        当前项目暂无渠道
      </ContextMenuItem>
    );
  }

  return (
    <>
      <ContextMenuItem onClick={() => handleMoveToChannel(null)} className="text-[#ccc] hover:bg-[#333] focus:bg-[#333]">
        <Inbox size={14} className="mr-2" />
        未分配渠道
      </ContextMenuItem>
      <ContextMenuSeparator className="bg-[#444]" />
      {projectChannels.map((channel, index) => (
        <ContextMenuItem
          key={channel.id}
          onClick={() => handleMoveToChannel(channel.id)}
          className="text-[#ccc] hover:bg-[#333] focus:bg-[#333]"
        >
          <GitBranch size={14} className="mr-2" style={{ color: getChannelColor(index) }} />
          <span className="truncate">{channel.name}</span>
        </ContextMenuItem>
      ))}
    </>
  );
}

// ─── Move to Channel Submenu (Dropdown) ──────────────────────────
function MoveToChannelDropdownSubmenu({
  assetId,
  assetProjectId,
  onClose,
}: {
  assetId: string;
  assetProjectId: string | null;
  onClose?: () => void;
}) {
  const { channels, triggerRefresh, activeProjectId } = useAssetStore();

  const projectId = assetProjectId || (activeProjectId && activeProjectId !== 'unassigned' ? activeProjectId : null);
  const projectChannels = channels.filter(ch => ch.projectId === projectId);

  const handleMoveToChannel = async (channelId: string | null) => {
    try {
      const response = await fetch(`/api/assets/${assetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId }),
      });
      if (!response.ok) throw new Error('Move failed');
      toast.success(channelId ? '已移动到渠道' : '已取消渠道分配');
      triggerRefresh();
      onClose?.();
    } catch {
      toast.error('移动失败');
    }
  };

  if (!projectId) {
    return (
      <DropdownMenuItem disabled className="text-[#666]">
        <GitBranch size={14} className="mr-2" />
        请先分配到项目
      </DropdownMenuItem>
    );
  }

  if (projectChannels.length === 0) {
    return (
      <DropdownMenuItem disabled className="text-[#666]">
        <GitBranch size={14} className="mr-2" />
        当前项目暂无渠道
      </DropdownMenuItem>
    );
  }

  return (
    <>
      <DropdownMenuItem onClick={() => handleMoveToChannel(null)} className="text-[#ccc] hover:bg-[#333] focus:bg-[#333]">
        <Inbox size={14} className="mr-2" />
        未分配渠道
      </DropdownMenuItem>
      <DropdownMenuSeparator className="bg-[#444]" />
      {projectChannels.map((channel, index) => (
        <DropdownMenuItem
          key={channel.id}
          onClick={() => handleMoveToChannel(channel.id)}
          className="text-[#ccc] hover:bg-[#333] focus:bg-[#333]"
        >
          <GitBranch size={14} className="mr-2" style={{ color: getChannelColor(index) }} />
          <span className="truncate">{channel.name}</span>
        </DropdownMenuItem>
      ))}
    </>
  );
}

// ─── List View Row ──────────────────────────────────────────────
function AssetListRow({
  asset,
  isChecked,
  onToggleCheck,
  onHoverStart,
  onHoverEnd,
  hoverPosition,
  onSingleDelete,
  filteredAssets,
}: {
  asset: AssetRecord;
  isChecked: boolean;
  onToggleCheck: () => void;
  onHoverStart: (e: React.MouseEvent) => void;
  onHoverEnd: () => void;
  hoverPosition: { x: number; y: number } | null;
  onSingleDelete: (asset: AssetRecord) => void;
  filteredAssets: AssetRecord[];
}) {
  const { selectedAsset, setSelectedAsset, setPreviewAsset, setPreviewOpen, setRenameAsset, setRenameOpen, projects, channels, setPreviewAssetsList } = useAssetStore();
  const [showPreview, setShowPreview] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // rAF throttle for hover position
  const rafRef = useRef<number | null>(null);

  const isSelected = selectedAsset?.id === asset.id;
  const isImg = isImageFile(asset.originalName);

  const handleRename = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setRenameAsset(asset);
    setRenameOpen(true);
  };

  const handlePreview = () => {
    setSelectedAsset(asset);
    setPreviewAssetsList(filteredAssets);
    setPreviewOpen(false);
    setPreviewAsset(asset);
    setTimeout(() => setPreviewOpen(true), 0);
  };

  const handleRowMouseEnter = (e: React.MouseEvent) => {
    if (isImg) {
      onHoverStart(e);
      hoverTimerRef.current = setTimeout(() => {
        setShowPreview(true);
      }, 400);
    }
  };

  const handleRowMouseMove = (e: React.MouseEvent) => {
    if (!isImg) return;
    // rAF throttle
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      onHoverStart(e);
    });
  };

  const handleRowMouseLeave = () => {
    onHoverEnd();
    setShowPreview(false);
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const handleCopyName = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    copyText(asset.originalName, '文件名');
  };

  const handleCopyImage = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    copyImage(asset);
  };

  // Get channel name
  const channelName = asset.channelId ? channels.find(c => c.id === asset.channelId)?.name : null;

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger>
          <motion.div
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handlePreview}
            onMouseEnter={handleRowMouseEnter}
            onMouseMove={handleRowMouseMove}
            onMouseLeave={handleRowMouseLeave}
            className={`
              group grid grid-cols-[32px_1fr_80px_80px_70px_90px_80px_40px] sm:grid-cols-[32px_1fr_120px_100px_100px_120px_140px_50px] items-center px-4 py-3
              cursor-pointer transition-colors duration-150 border-b border-[#2a2a2a]
              ${isChecked ? 'bg-[#4A90E2]/10 border-l-2 border-l-[#4A90E2]' : ''}
              ${isSelected ? 'bg-[#333]' : 'bg-[#1E1E1E] hover:bg-[#282828]'}
            `}
          >
            {/* Checkbox */}
            <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleCheck();
                }}
                className="text-[#666] hover:text-[#4A90E2] transition-colors p-0.5"
              >
                {isChecked ? <CheckSquare size={16} className="text-[#4A90E2]" /> : <Square size={16} />}
              </button>
            </div>

            {/* Name */}
            <div className="flex items-center gap-3 min-w-0">
              <FileTypeIcon filename={asset.originalName} size={18} />
              <span className="text-sm text-white truncate" title={asset.originalName}>
                {asset.originalName}
              </span>
            </div>

            {/* Channel */}
            <div className="text-xs text-[#888] hidden sm:block">
              {channelName ? (
                <Badge variant="secondary" className="text-[10px] bg-[#333] text-[#aaa] border-[#444] hover:bg-[#3a3a3a] max-w-[90px]">
                  <GitBranch size={10} className="mr-1 shrink-0" />
                  <span className="truncate">{channelName}</span>
                </Badge>
              ) : (
                <span className="text-[#555]">—</span>
              )}
            </div>

            {/* Dimensions */}
            <div className="text-xs text-[#777] hidden sm:block">
              {formatDimensions(asset.width, asset.height)}
            </div>

            {/* Size */}
            <div className="text-xs text-[#777]">
              {formatFileSize(asset.fileSize)}
            </div>

            {/* Type */}
            <div className="hidden sm:block">
              <Badge
                variant="secondary"
                className="text-[10px] bg-[#333] text-[#aaa] border-[#444] hover:bg-[#3a3a3a]"
              >
                {getFileTypeLabel(asset.originalName)}
              </Badge>
            </div>

            {/* Date */}
            <div className="text-xs text-[#777] hidden sm:block">
              {formatDate(asset.createdAt)}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-[#666] hover:text-white hover:bg-[#333] opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <MoreVertical size={16} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-[#2D2D2D] border-[#444]">
                  <DropdownMenuItem onClick={handlePreview} className="text-[#ccc] hover:bg-[#333] focus:bg-[#333]">
                    <Info size={14} className="mr-2" />
                    预览
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleRename} className="text-[#ccc] hover:bg-[#333] focus:bg-[#333]">
                    <Edit3 size={14} className="mr-2" />
                    重命名
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleCopyName} className="text-[#ccc] hover:bg-[#333] focus:bg-[#333]">
                    <Copy size={14} className="mr-2" />
                    复制文件名
                  </DropdownMenuItem>
                  {isImg && (
                    <DropdownMenuItem onClick={handleCopyImage} className="text-[#ccc] hover:bg-[#333] focus:bg-[#333]">
                      <Copy size={14} className="mr-2" />
                      复制图片
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => downloadFile(asset)} className="text-[#ccc] hover:bg-[#333] focus:bg-[#333]">
                    <Download size={14} className="mr-2" />
                    下载
                  </DropdownMenuItem>
                  {projects.length > 0 && (
                    <>
                      <DropdownMenuSeparator className="bg-[#444]" />
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="text-[#ccc] hover:bg-[#333] focus:bg-[#333]">
                          <FolderInput size={14} className="mr-2" />
                          移动到项目
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="bg-[#2D2D2D] border-[#444] max-h-64 overflow-y-auto">
                          <MoveToProjectDropdownSubmenu assetId={asset.id} />
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    </>
                  )}
                  {channels.length > 0 && (
                    <>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="text-[#ccc] hover:bg-[#333] focus:bg-[#333]">
                          <GitBranch size={14} className="mr-2" />
                          移动到渠道
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="bg-[#2D2D2D] border-[#444] max-h-64 overflow-y-auto">
                          <MoveToChannelDropdownSubmenu assetId={asset.id} assetProjectId={asset.projectId} />
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    </>
                  )}
                  <DropdownMenuSeparator className="bg-[#444]" />
                  <DropdownMenuItem onClick={() => onSingleDelete(asset)} className="text-red-400 hover:bg-[#333] focus:bg-[#333]">
                    <Trash2 size={14} className="mr-2" />
                    删除
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </motion.div>
        </ContextMenuTrigger>
        <ContextMenuContent className="bg-[#2D2D2D] border-[#444]">
          <ContextMenuItem onClick={handlePreview} className="text-[#ccc] hover:bg-[#333] focus:bg-[#333]">
            <Info size={14} className="mr-2" />
            预览
          </ContextMenuItem>
          <ContextMenuItem onClick={handleRename} className="text-[#ccc] hover:bg-[#333] focus:bg-[#333]">
            <Edit3 size={14} className="mr-2" />
            重命名
          </ContextMenuItem>
          <ContextMenuItem onClick={handleCopyName} className="text-[#ccc] hover:bg-[#333] focus:bg-[#333]">
            <Copy size={14} className="mr-2" />
            复制文件名
          </ContextMenuItem>
          {isImg && (
            <ContextMenuItem onClick={handleCopyImage} className="text-[#ccc] hover:bg-[#333] focus:bg-[#333]">
              <Copy size={14} className="mr-2" />
              复制图片
            </ContextMenuItem>
          )}
          <ContextMenuItem onClick={() => downloadFile(asset)} className="text-[#ccc] hover:bg-[#333] focus:bg-[#333]">
            <Download size={14} className="mr-2" />
            下载
          </ContextMenuItem>
          {projects.length > 0 && (
            <>
              <ContextMenuSeparator className="bg-[#444]" />
              <ContextMenuSub>
                <ContextMenuSubTrigger className="text-[#ccc] hover:bg-[#333] focus:bg-[#333]">
                  <FolderInput size={14} className="mr-2" />
                  移动到项目
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className="bg-[#2D2D2D] border-[#444] max-h-64 overflow-y-auto">
                  <MoveToProjectSubmenu assetId={asset.id} />
                </ContextMenuSubContent>
              </ContextMenuSub>
            </>
          )}
          {channels.length > 0 && (
            <>
              <ContextMenuSub>
                <ContextMenuSubTrigger className="text-[#ccc] hover:bg-[#333] focus:bg-[#333]">
                  <GitBranch size={14} className="mr-2" />
                  移动到渠道
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className="bg-[#2D2D2D] border-[#444] max-h-64 overflow-y-auto">
                  <MoveToChannelSubmenu assetId={asset.id} assetProjectId={asset.projectId} />
                </ContextMenuSubContent>
              </ContextMenuSub>
            </>
          )}
          <ContextMenuSeparator className="bg-[#444]" />
          <ContextMenuItem onClick={() => onSingleDelete(asset)} className="text-red-400 hover:bg-[#333] focus:bg-[#333]">
            <Trash2 size={14} className="mr-2" />
            删除
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* Hover Mini Preview */}
      {isImg && hoverPosition && (
        <HoverPreview
          key={asset.id}
          asset={asset}
          visible={showPreview}
          position={hoverPosition}
        />
      )}
    </>
  );
}

// ─── Grid View Card ─────────────────────────────────────────────
function AssetGridCard({
  asset,
  isChecked,
  onToggleCheck,
  onSingleDelete,
  filteredAssets,
}: {
  asset: AssetRecord;
  isChecked: boolean;
  onToggleCheck: () => void;
  onSingleDelete: (asset: AssetRecord) => void;
  filteredAssets: AssetRecord[];
}) {
  const { setPreviewAsset, setPreviewOpen, setRenameAsset, setRenameOpen, projects, channels, setPreviewAssetsList } = useAssetStore();
  const isImage = isImageFile(asset.originalName);
  const isVideo = isVideoFile(asset.originalName);

  const handleRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRenameAsset(asset);
    setRenameOpen(true);
  };

  const handleClick = () => {
    setPreviewAssetsList(filteredAssets);
    setPreviewOpen(false);
    setPreviewAsset(asset);
    setTimeout(() => setPreviewOpen(true), 0);
  };

  const handleCopyName = (e: React.MouseEvent) => {
    e.stopPropagation();
    copyText(asset.originalName, '文件名');
  };

  const handleCopyImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    copyImage(asset);
  };

  const channelName = asset.channelId ? channels.find(c => c.id === asset.channelId)?.name : null;

  const thumbSrc = isImage ? getThumbnailUrl(asset.fileName) : `/api/upload/assets/${asset.fileName}`;

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <motion.div
          layout
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          onClick={handleClick}
          className={`
            group relative rounded-lg overflow-hidden bg-[#252525] border-2
            hover:border-[#4A90E2]/50 transition-all duration-200 cursor-pointer
            ${isChecked ? 'border-[#4A90E2]' : 'border-[#333]'}
          `}
        >
          {/* Checkbox overlay */}
          <div
            className="absolute top-2 left-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleCheck();
              }}
              className={`p-1 rounded transition-colors ${isChecked ? 'bg-[#4A90E2]/20' : 'bg-black/40 hover:bg-black/60'}`}
            >
              {isChecked ? (
                <CheckSquare size={14} className="text-[#4A90E2]" />
              ) : (
                <Square size={14} className="text-white/70" />
              )}
            </button>
          </div>

          {/* Channel badge */}
          {channelName && (
            <div className="absolute top-2 right-2 z-10">
              <Badge variant="secondary" className="text-[9px] bg-[#2D2D2D]/90 text-[#aaa] border-[#444] px-1.5 py-0 max-w-[80px]">
                <GitBranch size={9} className="mr-0.5 shrink-0" />
                <span className="truncate">{channelName}</span>
              </Badge>
            </div>
          )}

          {/* Thumbnail */}
          <div className="aspect-square flex items-center justify-center bg-[#1E1E1E] overflow-hidden">
            {isImage ? (
              <img
                src={thumbSrc}
                alt={asset.originalName}
                loading="lazy"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            ) : isVideo ? (
              <div className="relative w-full h-full flex items-center justify-center">
                <video
                  src={`/api/upload/assets/${asset.fileName}`}
                  preload="none"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <Film size={32} className="text-white/80" />
                </div>
              </div>
            ) : (
              <FileTypeIcon filename={asset.originalName} size={48} />
            )}
          </div>

          {/* Info overlay */}
          <div className="p-3">
            <p className="text-xs text-white truncate mb-1.5" title={asset.originalName}>
              {asset.originalName}
            </p>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[#666]">{formatFileSize(asset.fileSize)}</span>
              <Badge variant="secondary" className="text-[9px] bg-[#333] text-[#888] border-[#444] px-1.5 py-0">
                {getFileTypeLabel(asset.originalName)}
              </Badge>
            </div>
          </div>

          {/* Hover actions */}
          <div className="absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10" onClick={(e) => e.stopPropagation()} style={{ right: channelName ? '72px' : undefined }}>
            <Button
              size="sm"
              variant="secondary"
              className="h-7 w-7 p-0 bg-[#2D2D2D]/90 border-[#444] hover:bg-[#333]"
              onClick={handleRename}
              title="重命名"
            >
              <Edit3 size={12} className="text-[#ccc]" />
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-7 w-7 p-0 bg-[#2D2D2D]/90 border-[#444] hover:bg-[#333]"
              onClick={() => downloadFile(asset)}
              title="下载"
            >
              <Download size={12} className="text-[#ccc]" />
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-7 w-7 p-0 bg-[#2D2D2D]/90 border-[#444] hover:bg-red-900/50"
              onClick={() => onSingleDelete(asset)}
              title="删除"
            >
              <Trash2 size={12} className="text-red-400" />
            </Button>
          </div>
        </motion.div>
      </ContextMenuTrigger>
      <ContextMenuContent className="bg-[#2D2D2D] border-[#444]">
        <ContextMenuItem onClick={handleClick} className="text-[#ccc] hover:bg-[#333] focus:bg-[#333]">
          <Info size={14} className="mr-2" />
          预览
        </ContextMenuItem>
        <ContextMenuItem onClick={handleRename} className="text-[#ccc] hover:bg-[#333] focus:bg-[#333]">
          <Edit3 size={14} className="mr-2" />
          重命名
        </ContextMenuItem>
        <ContextMenuItem onClick={handleCopyName} className="text-[#ccc] hover:bg-[#333] focus:bg-[#333]">
          <Copy size={14} className="mr-2" />
          复制文件名
        </ContextMenuItem>
        {isImage && (
          <ContextMenuItem onClick={handleCopyImage} className="text-[#ccc] hover:bg-[#333] focus:bg-[#333]">
            <Copy size={14} className="mr-2" />
            复制图片
          </ContextMenuItem>
        )}
        <ContextMenuItem onClick={() => downloadFile(asset)} className="text-[#ccc] hover:bg-[#333] focus:bg-[#333]">
          <Download size={14} className="mr-2" />
          下载
        </ContextMenuItem>
        {projects.length > 0 && (
          <>
            <ContextMenuSeparator className="bg-[#444]" />
            <ContextMenuSub>
              <ContextMenuSubTrigger className="text-[#ccc] hover:bg-[#333] focus:bg-[#333]">
                <FolderInput size={14} className="mr-2" />
                移动到项目
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="bg-[#2D2D2D] border-[#444] max-h-64 overflow-y-auto">
                <MoveToProjectSubmenu assetId={asset.id} />
              </ContextMenuSubContent>
            </ContextMenuSub>
          </>
        )}
        {channels.length > 0 && (
          <>
            <ContextMenuSub>
              <ContextMenuSubTrigger className="text-[#ccc] hover:bg-[#333] focus:bg-[#333]">
                <GitBranch size={14} className="mr-2" />
                移动到渠道
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="bg-[#2D2D2D] border-[#444] max-h-64 overflow-y-auto">
                <MoveToChannelSubmenu assetId={asset.id} assetProjectId={asset.projectId} />
              </ContextMenuSubContent>
            </ContextMenuSub>
          </>
        )}
        <ContextMenuSeparator className="bg-[#444]" />
        <ContextMenuItem onClick={() => onSingleDelete(asset)} className="text-red-400 hover:bg-[#333] focus:bg-[#333]">
          <Trash2 size={14} className="mr-2" />
          删除
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

// ─── Batch Action Bar (with Batch Move & Batch Download) ────────
function BatchActionBar({
  selectedCount,
  onClearSelection,
  onDeleteSelected,
  onMoveToProject,
  onMoveToChannel,
  onBatchDownload,
}: {
  selectedCount: number;
  onClearSelection: () => void;
  onDeleteSelected: () => void;
  onMoveToProject: (projectId: string | null) => void;
  onMoveToChannel: (channelId: string | null) => void;
  onBatchDownload: () => void;
}) {
  const { projects, channels, activeProjectId } = useAssetStore();

  if (selectedCount === 0) return null;

  // Get channels for current project
  const currentProjectId = activeProjectId && activeProjectId !== 'unassigned' ? activeProjectId : null;
  const projectChannels = channels.filter(ch => ch.projectId === currentProjectId);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="flex flex-wrap items-center justify-between gap-2 bg-[#4A90E2]/10 border border-[#4A90E2]/30 rounded-lg px-4 py-2.5 mb-4"
    >
      <div className="flex items-center gap-3">
        <CheckSquare size={16} className="text-[#4A90E2]" />
        <span className="text-sm text-[#ccc]">
          已选择 <span className="text-[#4A90E2] font-semibold">{selectedCount}</span> 个文件
        </span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          className="h-8 px-3 text-xs text-[#999] hover:text-white hover:bg-[#333]"
        >
          取消选择
        </Button>
        {projects.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-xs text-[#ccc] hover:text-white hover:bg-[#333]"
              >
                <FolderInput size={14} className="mr-1.5" />
                移动到项目
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 bg-[#2D2D2D] border-[#444] p-1" align="end">
              <div className="max-h-64 overflow-y-auto custom-scrollbar">
                <button
                  onClick={() => onMoveToProject(null)}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-[#ccc] hover:bg-[#333] transition-colors text-left"
                >
                  <Inbox size={14} className="shrink-0 text-[#888]" />
                  <span className="truncate">未分类</span>
                </button>
                <div className="h-px bg-[#444] my-1 mx-1" />
                {projects.map((project, index) => (
                  <button
                    key={project.id}
                    onClick={() => onMoveToProject(project.id)}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-[#ccc] hover:bg-[#333] transition-colors text-left"
                  >
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: getProjectColor(index) }} />
                    <span className="truncate">{project.name}</span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}
        {currentProjectId && projectChannels.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-xs text-[#ccc] hover:text-white hover:bg-[#333]"
              >
                <GitBranch size={14} className="mr-1.5" />
                移动到渠道
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 bg-[#2D2D2D] border-[#444] p-1" align="end">
              <div className="max-h-64 overflow-y-auto custom-scrollbar">
                <button
                  onClick={() => onMoveToChannel(null)}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-[#ccc] hover:bg-[#333] transition-colors text-left"
                >
                  <Inbox size={14} className="shrink-0 text-[#888]" />
                  <span className="truncate">未分配渠道</span>
                </button>
                <div className="h-px bg-[#444] my-1 mx-1" />
                {projectChannels.map((channel, index) => (
                  <button
                    key={channel.id}
                    onClick={() => onMoveToChannel(channel.id)}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-[#ccc] hover:bg-[#333] transition-colors text-left"
                  >
                    <GitBranch size={14} className="shrink-0" style={{ color: getChannelColor(index) }} />
                    <span className="truncate">{channel.name}</span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onBatchDownload}
          className="h-8 px-3 text-xs text-[#ccc] hover:text-white hover:bg-[#333]"
        >
          <Download size={14} className="mr-1.5" />
          批量下载
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDeleteSelected}
          className="h-8 px-3 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/30"
        >
          <Trash2 size={14} className="mr-1.5" />
          批量删除
        </Button>
      </div>
    </motion.div>
  );
}

// ─── Confirm Delete Dialog ──────────────────────────────────────
function ConfirmDeleteDialog({
  open,
  onOpenChange,
  count,
  targetName,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  targetName?: string;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#2D2D2D] border-[#444] text-white sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>确认删除</DialogTitle>
          <DialogDescription className="sr-only">确认删除文件</DialogDescription>
        </DialogHeader>
        <p className="text-sm text-[#ccc] mt-2">
          {targetName ? (
            <>
              确定要删除文件 <span className="text-red-400 font-semibold">&quot;{targetName}&quot;</span> 吗？此操作不可撤销。
            </>
          ) : (
            <>
              确定要删除 <span className="text-red-400 font-semibold">{count}</span> 个文件吗？此操作不可撤销。
            </>
          )}
        </p>
        <div className="flex justify-end gap-3 mt-4">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-[#999] hover:text-white hover:bg-[#333]"
          >
            取消
          </Button>
          <Button
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            <Trash2 size={14} className="mr-1.5" />
            确认删除
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create Project Dialog ───────────────────────────────────────
function CreateProjectDialog() {
  const { isCreateProjectOpen, setCreateProjectOpen, triggerRefresh, setProjects } = useAssetStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isCreateProjectOpen) {
      setName('');
      setDescription('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isCreateProjectOpen]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setIsCreating(true);
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined }),
      });
      if (!response.ok) throw new Error('Create failed');
      toast.success('项目创建成功');
      setCreateProjectOpen(false);
      triggerRefresh();
      // Refresh projects list
      const projectsRes = await fetch('/api/projects');
      if (projectsRes.ok) {
        const projectsData = await projectsRes.json();
        setProjects(projectsData.projects);
      }
    } catch {
      toast.error('创建项目失败');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={isCreateProjectOpen} onOpenChange={setCreateProjectOpen}>
      <DialogContent className="bg-[#2D2D2D] border-[#444] text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle>创建项目</DialogTitle>
          <DialogDescription className="sr-only">创建新项目对话框</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 mt-4">
          <div>
            <label className="text-xs text-[#888] mb-1 block">项目名称 *</label>
            <Input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="输入项目名称"
              className="bg-[#1E1E1E] border-[#444] text-white placeholder:text-[#555]"
            />
          </div>
          <div>
            <label className="text-xs text-[#888] mb-1 block">项目描述（可选）</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="输入项目描述"
              className="bg-[#1E1E1E] border-[#444] text-white placeholder:text-[#555] min-h-[60px] resize-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="ghost"
              onClick={() => setCreateProjectOpen(false)}
              className="text-[#999] hover:text-white hover:bg-[#333]"
            >
              取消
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!name.trim() || isCreating}
              className="bg-[#4A90E2] hover:bg-[#3A80D2] text-white disabled:opacity-50"
            >
              {isCreating ? '创建中...' : '创建'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Rename Project Dialog ───────────────────────────────────────
function RenameProjectDialog() {
  const { renameProject, setRenameProject, triggerRefresh, setProjects } = useAssetStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isOpen = !!renameProject;

  useEffect(() => {
    if (renameProject) {
      setName(renameProject.name);
      setDescription(renameProject.description || '');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [renameProject]);

  const handleRename = async () => {
    if (!renameProject || !name.trim()) return;
    setIsSaving(true);
    try {
      const response = await fetch(`/api/projects/${renameProject.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || '' }),
      });
      if (!response.ok) throw new Error('Rename failed');
      toast.success('项目已更新');
      setRenameProject(null);
      triggerRefresh();
      const projectsRes = await fetch('/api/projects');
      if (projectsRes.ok) {
        const projectsData = await projectsRes.json();
        setProjects(projectsData.projects);
      }
    } catch {
      toast.error('更新项目失败');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) setRenameProject(null); }}>
      <DialogContent className="bg-[#2D2D2D] border-[#444] text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle>编辑项目</DialogTitle>
          <DialogDescription className="sr-only">编辑项目对话框</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 mt-4">
          <div>
            <label className="text-xs text-[#888] mb-1 block">项目名称 *</label>
            <Input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRename()}
              placeholder="输入项目名称"
              className="bg-[#1E1E1E] border-[#444] text-white placeholder:text-[#555]"
            />
          </div>
          <div>
            <label className="text-xs text-[#888] mb-1 block">项目描述（可选）</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="输入项目描述"
              className="bg-[#1E1E1E] border-[#444] text-white placeholder:text-[#555] min-h-[60px] resize-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="ghost"
              onClick={() => setRenameProject(null)}
              className="text-[#999] hover:text-white hover:bg-[#333]"
            >
              取消
            </Button>
            <Button
              onClick={handleRename}
              disabled={!name.trim() || isSaving}
              className="bg-[#4A90E2] hover:bg-[#3A80D2] text-white disabled:opacity-50"
            >
              {isSaving ? '保存中...' : '保存'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create Channel Dialog ───────────────────────────────────────
function CreateChannelDialog() {
  const { isCreateChannelOpen, setCreateChannelOpen, activeProjectId, triggerRefresh, setChannels } = useAssetStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isCreateChannelOpen) {
      setName('');
      setDescription('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isCreateChannelOpen]);

  const handleCreate = async () => {
    if (!name.trim() || !activeProjectId || activeProjectId === 'unassigned') return;
    setIsCreating(true);
    try {
      const response = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), projectId: activeProjectId, description: description.trim() || undefined }),
      });
      if (!response.ok) throw new Error('Create failed');
      toast.success('渠道创建成功');
      setCreateChannelOpen(false);
      triggerRefresh();
      // Refresh channels list
      const channelsRes = await fetch(`/api/channels?projectId=${activeProjectId}`);
      if (channelsRes.ok) {
        const channelsData = await channelsRes.json();
        setChannels(channelsData.channels);
      }
    } catch {
      toast.error('创建渠道失败');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={isCreateChannelOpen} onOpenChange={setCreateChannelOpen}>
      <DialogContent className="bg-[#2D2D2D] border-[#444] text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch size={18} className="text-[#4A90E2]" />
            创建渠道
          </DialogTitle>
          <DialogDescription className="sr-only">创建新渠道对话框</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 mt-4">
          <div>
            <label className="text-xs text-[#888] mb-1 block">渠道名称 *</label>
            <Input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="输入渠道名称"
              className="bg-[#1E1E1E] border-[#444] text-white placeholder:text-[#555]"
            />
          </div>
          <div>
            <label className="text-xs text-[#888] mb-1 block">渠道描述（可选）</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="输入渠道描述"
              className="bg-[#1E1E1E] border-[#444] text-white placeholder:text-[#555] min-h-[60px] resize-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="ghost"
              onClick={() => setCreateChannelOpen(false)}
              className="text-[#999] hover:text-white hover:bg-[#333]"
            >
              取消
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!name.trim() || isCreating}
              className="bg-[#4A90E2] hover:bg-[#3A80D2] text-white disabled:opacity-50"
            >
              {isCreating ? '创建中...' : '创建'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Rename Channel Dialog ───────────────────────────────────────
function RenameChannelDialog() {
  const { renameChannel, setRenameChannel, triggerRefresh, setChannels, activeProjectId } = useAssetStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isOpen = !!renameChannel;

  useEffect(() => {
    if (renameChannel) {
      setName(renameChannel.name);
      setDescription(renameChannel.description || '');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [renameChannel]);

  const handleRename = async () => {
    if (!renameChannel || !name.trim()) return;
    setIsSaving(true);
    try {
      const response = await fetch(`/api/channels/${renameChannel.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || '' }),
      });
      if (!response.ok) throw new Error('Rename failed');
      toast.success('渠道已更新');
      setRenameChannel(null);
      triggerRefresh();
      // Refresh channels
      const projectId = activeProjectId || renameChannel.projectId;
      const channelsRes = await fetch(`/api/channels?projectId=${projectId}`);
      if (channelsRes.ok) {
        const channelsData = await channelsRes.json();
        setChannels(channelsData.channels);
      }
    } catch {
      toast.error('更新渠道失败');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) setRenameChannel(null); }}>
      <DialogContent className="bg-[#2D2D2D] border-[#444] text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch size={18} className="text-[#4A90E2]" />
            编辑渠道
          </DialogTitle>
          <DialogDescription className="sr-only">编辑渠道对话框</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 mt-4">
          <div>
            <label className="text-xs text-[#888] mb-1 block">渠道名称 *</label>
            <Input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRename()}
              placeholder="输入渠道名称"
              className="bg-[#1E1E1E] border-[#444] text-white placeholder:text-[#555]"
            />
          </div>
          <div>
            <label className="text-xs text-[#888] mb-1 block">渠道描述（可选）</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="输入渠道描述"
              className="bg-[#1E1E1E] border-[#444] text-white placeholder:text-[#555] min-h-[60px] resize-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="ghost"
              onClick={() => setRenameChannel(null)}
              className="text-[#999] hover:text-white hover:bg-[#333]"
            >
              取消
            </Button>
            <Button
              onClick={handleRename}
              disabled={!name.trim() || isSaving}
              className="bg-[#4A90E2] hover:bg-[#3A80D2] text-white disabled:opacity-50"
            >
              {isSaving ? '保存中...' : '保存'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Project Sidebar with Channels ──────────────────────────────
function ProjectSidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const {
    projects, activeProjectId, activeChannelId,
    setActiveProjectId, setActiveChannelId,
    setCreateProjectOpen, setRenameProject,
    setCreateChannelOpen, setRenameChannel,
    triggerRefresh, setProjects, setChannels,
    channels,
  } = useAssetStore();
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteChannelConfirmId, setDeleteChannelConfirmId] = useState<string | null>(null);

  // Persist sidebar state to localStorage
  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    if (saved === 'true' && !collapsed) {
      onToggle();
    } else if (saved !== 'true' && collapsed) {
      onToggle();
    }
  }, []);

  const handleToggle = () => {
    localStorage.setItem('sidebar-collapsed', String(!collapsed));
    onToggle();
  };

  const handleDeleteProject = async (id: string) => {
    try {
      const response = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Delete failed');
      const data = await response.json();
      toast.success(`项目已删除，${data.unlinkedCount} 个文件已取消分类`);
      if (activeProjectId === id) setActiveProjectId(null);
      setDeleteConfirmId(null);
      triggerRefresh();
      const projectsRes = await fetch('/api/projects');
      if (projectsRes.ok) {
        const projectsData = await projectsRes.json();
        setProjects(projectsData.projects);
      }
    } catch {
      toast.error('删除项目失败');
    }
  };

  const handleDeleteChannel = async (id: string) => {
    try {
      const response = await fetch(`/api/channels/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Delete failed');
      const data = await response.json();
      toast.success(`渠道已删除，${data.unlinkedCount} 个文件已取消分配`);
      if (activeChannelId === id) setActiveChannelId(null);
      setDeleteChannelConfirmId(null);
      triggerRefresh();
      // Refresh channels
      if (activeProjectId && activeProjectId !== 'unassigned') {
        const channelsRes = await fetch(`/api/channels?projectId=${activeProjectId}`);
        if (channelsRes.ok) {
          const channelsData = await channelsRes.json();
          setChannels(channelsData.channels);
        }
      }
    } catch {
      toast.error('删除渠道失败');
    }
  };

  // Track expanded state per project via localStorage
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const saved = localStorage.getItem('project-expanded-ids');
      if (saved) {
        setExpandedProjects(new Set(JSON.parse(saved)));
      }
    } catch {
      // ignore
    }
  }, []);

  const toggleProjectExpanded = (projectId: string) => {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      localStorage.setItem('project-expanded-ids', JSON.stringify(Array.from(next)));
      return next;
    });
  };

  // When clicking a project, also expand it
  const handleProjectClick = (projectId: string) => {
    setActiveProjectId(projectId);
    setActiveChannelId(null);
    // Auto-expand
    setExpandedProjects(prev => {
      if (prev.has(projectId)) return prev;
      const next = new Set(prev);
      next.add(projectId);
      localStorage.setItem('project-expanded-ids', JSON.stringify(Array.from(next)));
      return next;
    });
  };

  // Get channels for a specific project
  const getProjectChannels = (projectId: string) => channels.filter(ch => ch.projectId === projectId);

  if (collapsed) {
    return (
      <div className="w-12 bg-[#252525] border-r border-[#333] flex flex-col items-center py-3 gap-2 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleToggle}
          className="h-8 w-8 p-0 text-[#666] hover:text-white hover:bg-[#333]"
          title="展开侧栏"
        >
          <ChevronRight size={16} />
        </Button>
        <button
          onClick={() => setActiveProjectId(null)}
          className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors ${
            activeProjectId === null
              ? 'bg-[#4A90E2]/20 text-[#4A90E2]'
              : 'text-[#666] hover:text-white hover:bg-[#333]'
          }`}
          title="全部素材"
        >
          <Layers size={16} />
        </button>
        <button
          onClick={() => setActiveProjectId('unassigned')}
          className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors ${
            activeProjectId === 'unassigned'
              ? 'bg-[#4A90E2]/20 text-[#4A90E2]'
              : 'text-[#666] hover:text-white hover:bg-[#333]'
          }`}
          title="未分类"
        >
          <Inbox size={16} />
        </button>
        <div className="w-6 border-t border-[#333] my-1" />
        {projects.map((project, index) => (
          <ContextMenu key={project.id}>
            <ContextMenuTrigger>
              <button
                onClick={() => handleProjectClick(project.id)}
                className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors ${
                  activeProjectId === project.id && activeChannelId === null
                    ? 'bg-[#4A90E2]/20'
                    : 'text-[#666] hover:text-white hover:bg-[#333]'
                }`}
                title={project.name}
              >
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getProjectColor(index) }} />
              </button>
            </ContextMenuTrigger>
            <ContextMenuContent className="bg-[#2D2D2D] border-[#444]">
              <ContextMenuItem onClick={() => { setRenameProject(project); }} className="text-[#ccc] hover:bg-[#333] focus:bg-[#333]">
                <Edit3 size={14} className="mr-2" />
                重命名
              </ContextMenuItem>
              <ContextMenuItem onClick={() => setDeleteConfirmId(project.id)} className="text-red-400 hover:bg-[#333] focus:bg-[#333]">
                <Trash2 size={14} className="mr-2" />
                删除项目
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        ))}
      </div>
    );
  }

  return (
    <div className="w-60 bg-[#252525] border-r border-[#333] flex flex-col shrink-0">
      {/* Sidebar Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-[#333]">
        <span className="text-xs font-medium text-[#888] uppercase tracking-wider">项目</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleToggle}
          className="h-7 w-7 p-0 text-[#555] hover:text-white hover:bg-[#333]"
        >
          <ChevronLeft size={14} />
        </Button>
      </div>

      {/* Project List */}
      <nav className="flex-1 overflow-y-auto custom-scrollbar py-2 px-1.5">
        {/* All Assets */}
        <button
          onClick={() => { setActiveProjectId(null); setActiveChannelId(null); }}
          className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors mb-0.5 ${
            activeProjectId === null && activeChannelId === null
              ? 'bg-[#4A90E2]/15 text-[#4A90E2] border-l-2 border-[#4A90E2]'
              : 'text-[#aaa] hover:text-white hover:bg-[#333] border-l-2 border-transparent'
          }`}
        >
          <Layers size={16} className="shrink-0" />
          <span className="truncate">全部素材</span>
        </button>

        {/* Unassigned */}
        <button
          onClick={() => { setActiveProjectId('unassigned'); setActiveChannelId(null); }}
          className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors mb-0.5 ${
            activeProjectId === 'unassigned'
              ? 'bg-[#4A90E2]/15 text-[#4A90E2] border-l-2 border-[#4A90E2]'
              : 'text-[#aaa] hover:text-white hover:bg-[#333] border-l-2 border-transparent'
          }`}
        >
          <Inbox size={16} className="shrink-0" />
          <span className="truncate">未分类</span>
        </button>

        {/* Separator */}
        <div className="h-px bg-[#333] my-2 mx-2" />

        {/* Projects with collapsible channels */}
        {projects.map((project, index) => {
          const isExpanded = expandedProjects.has(project.id);
          const isActiveProject = activeProjectId === project.id;
          const projectChannels = getProjectChannels(project.id);

          return (
            <div key={project.id}>
              {/* Project row */}
              <ContextMenu>
                <ContextMenuTrigger>
                  <button
                    onClick={() => handleProjectClick(project.id)}
                    className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-sm transition-colors mb-0.5 group ${
                      isActiveProject && activeChannelId === null
                        ? 'bg-[#4A90E2]/15 text-[#4A90E2] border-l-2 border-[#4A90E2]'
                        : 'text-[#aaa] hover:text-white hover:bg-[#333] border-l-2 border-transparent'
                    }`}
                  >
                    <div
                      className="w-3 h-3 rounded-full shrink-0 cursor-pointer"
                      style={{ backgroundColor: getProjectColor(index) }}
                      onClick={(e) => { e.stopPropagation(); toggleProjectExpanded(project.id); }}
                    />
                    <span className="truncate flex-1 text-left">{project.name}</span>
                    {project._count && project._count.assets > 0 && (
                      <span className="text-[10px] text-[#666] bg-[#333] px-1.5 py-0.5 rounded-full tabular-nums">
                        {project._count.assets}
                      </span>
                    )}
                    <ChevronDown
                      size={12}
                      className={`shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-0' : '-rotate-90'}`}
                      onClick={(e) => { e.stopPropagation(); toggleProjectExpanded(project.id); }}
                    />
                  </button>
                </ContextMenuTrigger>
                <ContextMenuContent className="bg-[#2D2D2D] border-[#444]">
                  <ContextMenuItem onClick={() => { setRenameProject(project); }} className="text-[#ccc] hover:bg-[#333] focus:bg-[#333]">
                    <Edit3 size={14} className="mr-2" />
                    重命名
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => setDeleteConfirmId(project.id)} className="text-red-400 hover:bg-[#333] focus:bg-[#333]">
                    <Trash2 size={14} className="mr-2" />
                    删除项目
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>

              {/* Channels under this project */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden ml-4 pl-2 border-l border-[#333]"
                  >
                    {/* All project assets */}
                    <button
                      onClick={() => { setActiveProjectId(project.id); setActiveChannelId(null); }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors mb-0.5 ${
                        isActiveProject && activeChannelId === null
                          ? 'bg-[#4A90E2]/10 text-[#4A90E2]'
                          : 'text-[#888] hover:text-white hover:bg-[#333]'
                      }`}
                    >
                      <Layers size={13} className="shrink-0" />
                      <span className="truncate">全部项目素材</span>
                    </button>

                    {/* Unassigned channel */}
                    <button
                      onClick={() => { setActiveProjectId(project.id); setActiveChannelId('unassigned'); }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors mb-0.5 ${
                        isActiveProject && activeChannelId === 'unassigned'
                          ? 'bg-[#4A90E2]/10 text-[#4A90E2]'
                          : 'text-[#888] hover:text-white hover:bg-[#333]'
                      }`}
                    >
                      <Inbox size={13} className="shrink-0" />
                      <span className="truncate">未分配渠道</span>
                    </button>

                    {/* Channel list */}
                    {projectChannels.map((channel, chIndex) => (
                      <ContextMenu key={channel.id}>
                        <ContextMenuTrigger>
                          <button
                            onClick={() => { setActiveProjectId(project.id); setActiveChannelId(channel.id); }}
                            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors mb-0.5 ${
                              activeChannelId === channel.id
                                ? 'bg-[#4A90E2]/10 text-[#4A90E2]'
                                : 'text-[#888] hover:text-white hover:bg-[#333]'
                            }`}
                          >
                            <GitBranch size={13} className="shrink-0" style={{ color: getChannelColor(chIndex) }} />
                            <span className="truncate flex-1 text-left">{channel.name}</span>
                            {channel._count && channel._count.assets > 0 && (
                              <span className="text-[10px] text-[#666] tabular-nums">
                                {channel._count.assets}
                              </span>
                            )}
                          </button>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="bg-[#2D2D2D] border-[#444]">
                          <ContextMenuItem onClick={() => { setRenameChannel(channel); }} className="text-[#ccc] hover:bg-[#333] focus:bg-[#333]">
                            <Edit3 size={14} className="mr-2" />
                            重命名
                          </ContextMenuItem>
                          <ContextMenuItem onClick={() => setDeleteChannelConfirmId(channel.id)} className="text-red-400 hover:bg-[#333] focus:bg-[#333]">
                            <Trash2 size={14} className="mr-2" />
                            删除渠道
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    ))}

                    {/* Create channel button */}
                    <button
                      onClick={() => { setActiveProjectId(project.id); setCreateChannelOpen(true); }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-[#666] hover:text-[#aaa] hover:bg-[#333] transition-colors mb-0.5"
                    >
                      <Plus size={13} className="shrink-0" />
                      <span className="truncate">创建渠道</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}

        {projects.length === 0 && (
          <p className="text-xs text-[#555] text-center py-4">暂无项目</p>
        )}
      </nav>

      {/* Create Project Button */}
      <div className="p-2 border-t border-[#333]">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCreateProjectOpen(true)}
          className="w-full h-9 gap-2 text-xs text-[#888] hover:text-white hover:bg-[#333] justify-center"
        >
          <FolderPlus size={14} />
          创建项目
        </Button>
      </div>

      {/* Delete Project Confirm Dialog */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <DialogContent className="bg-[#2D2D2D] border-[#444] text-white sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>删除项目</DialogTitle>
            <DialogDescription className="sr-only">确认删除项目</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-[#ccc] mt-2">
            确定要删除该项目吗？项目中的文件不会被删除，但会取消分类。
          </p>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="ghost" onClick={() => setDeleteConfirmId(null)} className="text-[#999] hover:text-white hover:bg-[#333]">
              取消
            </Button>
            <Button
              onClick={() => deleteConfirmId && handleDeleteProject(deleteConfirmId)}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              <Trash2 size={14} className="mr-1.5" />
              删除
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Channel Confirm Dialog */}
      <Dialog open={!!deleteChannelConfirmId} onOpenChange={(open) => { if (!open) setDeleteChannelConfirmId(null); }}>
        <DialogContent className="bg-[#2D2D2D] border-[#444] text-white sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>删除渠道</DialogTitle>
            <DialogDescription className="sr-only">确认删除渠道</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-[#ccc] mt-2">
            确定要删除该渠道吗？渠道中的文件不会被删除，但会取消渠道分配。
          </p>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="ghost" onClick={() => setDeleteChannelConfirmId(null)} className="text-[#999] hover:text-white hover:bg-[#333]">
              取消
            </Button>
            <Button
              onClick={() => deleteChannelConfirmId && handleDeleteChannel(deleteChannelConfirmId)}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              <Trash2 size={14} className="mr-1.5" />
              删除
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────
export default function AssetManagerPage() {
  const {
    viewMode, setViewMode,
    searchQuery, setSearchQuery,
    sortBy, setSortBy, sortOrder, setSortOrder,
    assets, setAssets,
    typeFilter, setTypeFilter,
    refreshKey,
    triggerRefresh,
    activeProjectId, activeChannelId,
    setActiveProjectId, setActiveChannelId,
    projects, setProjects,
    channels, setChannels,
    selectedAsset, setSelectedAsset,
    isPreviewOpen, setPreviewOpen,
  } = useAssetStore();

  const [isLoading, setIsLoading] = useState(true);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isBatchDownloading, setIsBatchDownloading] = useState(false);

  // Single delete target
  const [singleDeleteTarget, setSingleDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // Persist sidebar state on mount
  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    if (saved === 'true') {
      setSidebarCollapsed(true);
    }
  }, []);

  // Debounced search
  const [searchInput, setSearchInput] = useState(searchQuery);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync searchInput with searchQuery when it changes externally
  useEffect(() => {
    setSearchInput(searchQuery);
  }, [searchQuery]);

  const handleSearchInputChange = useCallback((value: string) => {
    setSearchInput(value);
    setIsSearching(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchQuery(value);
      setIsSearching(false);
    }, 300);
  }, [setSearchQuery]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      // Escape: clear selection or close dialogs
      if (e.key === 'Escape') {
        if (isPreviewOpen) {
          setPreviewOpen(false);
        } else if (checkedIds.size > 0) {
          setCheckedIds(new Set());
        }
        return;
      }

      // Delete/Backspace: batch delete confirmation
      if ((e.key === 'Delete' || e.key === 'Backspace') && checkedIds.size > 0) {
        e.preventDefault();
        handleBatchDelete();
        return;
      }

      // Ctrl/Cmd + A: Select all
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        toggleAll();
        return;
      }

      // 1 or L: List view
      if (e.key === '1' || e.key.toLowerCase() === 'l') {
        setViewMode('list');
        return;
      }

      // 2 or G: Grid view
      if (e.key === '2' || e.key.toLowerCase() === 'g') {
        setViewMode('grid');
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [checkedIds, isPreviewOpen, setPreviewOpen, setViewMode, assets]);

  // Fetch projects
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const response = await fetch('/api/projects');
        if (response.ok) {
          const data = await response.json();
          setProjects(data.projects);
        }
      } catch (error) {
        console.error('Failed to fetch projects:', error);
      }
    };
    fetchProjects();
  }, [setProjects, refreshKey]);

  // Fetch channels for active project
  useEffect(() => {
    if (!activeProjectId || activeProjectId === 'unassigned') {
      setChannels([]);
      return;
    }
    const fetchChannels = async () => {
      try {
        const response = await fetch(`/api/channels?projectId=${activeProjectId}`);
        if (response.ok) {
          const data = await response.json();
          setChannels(data.channels);
        }
      } catch (error) {
        console.error('Failed to fetch channels:', error);
      }
    };
    fetchChannels();
  }, [activeProjectId, setChannels, refreshKey]);

  // Fetch assets
  useEffect(() => {
    const fetchAssets = async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        if (searchQuery) params.set('search', searchQuery);
        params.set('sortBy', sortBy);
        params.set('sortOrder', sortOrder);
        if (activeProjectId) params.set('projectId', activeProjectId);
        if (activeChannelId) params.set('channelId', activeChannelId);

        const response = await fetch(`/api/assets?${params.toString()}`);
        if (!response.ok) throw new Error('Failed to fetch');
        const data = await response.json();
        setAssets(data.assets);
      } catch (error) {
        console.error('Failed to fetch assets:', error);
        toast.error('加载文件列表失败');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAssets();
  }, [searchQuery, sortBy, sortOrder, refreshKey, setAssets, activeProjectId, activeChannelId]);

  // Clear selection when search, sort, project, channel or type filter changes
  useEffect(() => {
    setCheckedIds(new Set());
  }, [searchQuery, sortBy, sortOrder, activeProjectId, activeChannelId, typeFilter]);

  // Filter assets by type on the frontend
  const filteredAssets = useMemo(() => {
    if (typeFilter === 'all') return assets;
    return assets.filter(a => categorizeFile(a.originalName) === typeFilter);
  }, [assets, typeFilter]);

  // ─── Batch operations ─────────────────────────────────────────
  const toggleCheck = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (checkedIds.size === filteredAssets.length) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(filteredAssets.map((a) => a.id)));
    }
  };

  const clearSelection = () => setCheckedIds(new Set());

  const handleBatchDelete = () => {
    if (checkedIds.size === 0) return;
    setPendingDeleteIds(Array.from(checkedIds));
    setConfirmDeleteOpen(true);
  };

  const executeBatchDelete = async () => {
    try {
      const response = await fetch('/api/assets', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: pendingDeleteIds }),
      });
      if (!response.ok) throw new Error('Batch delete failed');
      const data = await response.json();
      toast.success(`成功删除 ${data.deletedCount} 个文件`);
      setCheckedIds(new Set());
      triggerRefresh();
    } catch {
      toast.error('批量删除失败，部分文件可能未删除');
      triggerRefresh();
    }
  };

  // Single delete handler
  const handleSingleDelete = (asset: AssetRecord) => {
    setSingleDeleteTarget({ id: asset.id, name: asset.originalName });
  };

  const executeSingleDelete = async () => {
    if (!singleDeleteTarget) return;
    try {
      const response = await fetch(`/api/assets/${singleDeleteTarget.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Delete failed');
      toast.success('文件已删除');
      if (selectedAsset?.id === singleDeleteTarget.id) setSelectedAsset(null);
      triggerRefresh();
    } catch {
      toast.error('删除失败');
    }
  };

  // Batch move to project
  const handleBatchMoveToProject = async (projectId: string | null) => {
    if (checkedIds.size === 0) return;
    try {
      const response = await fetch('/api/assets/batch-move', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(checkedIds), projectId }),
      });
      if (!response.ok) throw new Error('Batch move failed');
      const data = await response.json();
      toast.success(`已将 ${data.updatedCount} 个文件移动到${projectId ? '项目' : '未分类'}`);
      setCheckedIds(new Set());
      triggerRefresh();
    } catch {
      toast.error('移动失败');
    }
  };

  // Batch move to channel
  const handleBatchMoveToChannel = async (channelId: string | null) => {
    if (checkedIds.size === 0) return;
    try {
      const response = await fetch('/api/assets/batch-move', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(checkedIds), channelId }),
      });
      if (!response.ok) throw new Error('Batch move failed');
      const data = await response.json();
      toast.success(`已将 ${data.updatedCount} 个文件${channelId ? '移动到渠道' : '取消渠道分配'}`);
      setCheckedIds(new Set());
      triggerRefresh();
    } catch {
      toast.error('移动失败');
    }
  };

  // Task 7: Batch download
  const handleBatchDownload = async () => {
    if (checkedIds.size === 0) return;
    setIsBatchDownloading(true);
    try {
      const response = await fetch('/api/assets/batch-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(checkedIds) }),
      });

      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `assets-${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`成功下载 ${checkedIds.size} 个文件`);
    } catch {
      toast.error('批量下载失败');
    } finally {
      setIsBatchDownloading(false);
    }
  };

  // ─── Hover preview ────────────────────────────────────────────
  const handleHoverStart = (e: React.MouseEvent) => {
    setHoverPosition({ x: e.clientX, y: e.clientY });
  };

  const handleHoverEnd = () => {
    setHoverPosition(null);
  };

  const isAllChecked = filteredAssets.length > 0 && checkedIds.size === filteredAssets.length;

  // Get active project label for header
  const activeProjectLabel = activeProjectId === null
    ? '全部素材'
    : activeProjectId === 'unassigned'
      ? '未分类'
      : projects.find(p => p.id === activeProjectId)?.name || '项目';

  // Get active channel label for header
  const activeChannelLabel = activeChannelId === null
    ? null
    : activeChannelId === 'unassigned'
      ? '未分配渠道'
      : channels.find(c => c.id === activeChannelId)?.name || null;

  return (
    <div className="min-h-screen bg-[#1E1E1E] flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-[#2D2D2D] border-b border-[#333]">
        <div className="px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AppLogo size={26} />
            <h1
              className="text-base sm:text-lg font-semibold tracking-tight"
              style={{
                background: 'linear-gradient(135deg, #4A90E2, #A855F7)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              素材管理库
            </h1>
            {(activeProjectId !== null || activeChannelId !== null) && (
              <div className="flex items-center gap-1.5">
                {activeProjectId !== null && (
                  <Badge variant="secondary" className="text-[10px] bg-[#4A90E2]/20 text-[#4A90E2] border-[#4A90E2]/30 px-2 py-0.5">
                    {activeProjectLabel}
                  </Badge>
                )}
                {activeChannelLabel && (
                  <>
                    <span className="text-[10px] text-[#555]">&gt;</span>
                    <Badge variant="secondary" className="text-[10px] bg-[#A855F7]/20 text-[#A855F7] border-[#A855F7]/30 px-2 py-0.5">
                      <GitBranch size={10} className="mr-1" />
                      {activeChannelLabel}
                    </Badge>
                  </>
                )}
              </div>
            )}
            {filteredAssets.length > 0 && (
              <span className="text-xs text-[#666] bg-[#333] px-2 py-0.5 rounded-full">
                {filteredAssets.length} 个文件
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {/* Storage Stats Trigger */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-[#555] hover:text-[#999] hover:bg-[#333]">
                  <BarChart3 size={16} />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto bg-[#2D2D2D] border-[#444] p-0" align="end">
                <StorageStatsPanel assets={assets} />
              </PopoverContent>
            </Popover>
            {/* Keyboard shortcut hint */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-[#555] hover:text-[#999] hover:bg-[#333]">
                  <Keyboard size={16} />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 bg-[#2D2D2D] border-[#444] p-3" align="end">
                <p className="text-xs font-medium text-[#aaa] mb-2">键盘快捷键</p>
                <div className="space-y-1.5 text-xs text-[#888]">
                  <div className="flex justify-between"><span>删除选中</span><kbd className="bg-[#333] px-1.5 py-0.5 rounded text-[10px] text-[#aaa]">Delete</kbd></div>
                  <div className="flex justify-between"><span>全选</span><kbd className="bg-[#333] px-1.5 py-0.5 rounded text-[10px] text-[#aaa]">Ctrl+A</kbd></div>
                  <div className="flex justify-between"><span>关闭/取消</span><kbd className="bg-[#333] px-1.5 py-0.5 rounded text-[10px] text-[#aaa]">Esc</kbd></div>
                  <div className="flex justify-between"><span>列表视图</span><kbd className="bg-[#333] px-1.5 py-0.5 rounded text-[10px] text-[#aaa]">1 / L</kbd></div>
                  <div className="flex justify-between"><span>网格视图</span><kbd className="bg-[#333] px-1.5 py-0.5 rounded text-[10px] text-[#aaa]">2 / G</kbd></div>
                  <div className="flex justify-between"><span>预览翻页</span><kbd className="bg-[#333] px-1.5 py-0.5 rounded text-[10px] text-[#aaa]">← →</kbd></div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </header>

      {/* Body: Sidebar + Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <ProjectSidebar
          collapsed={sidebarCollapsed}
          onToggle={() => {
            setSidebarCollapsed(!sidebarCollapsed);
            localStorage.setItem('sidebar-collapsed', String(!sidebarCollapsed));
          }}
        />

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-4">
            {/* Upload Zone */}
            <UploadZone />

            {/* Batch Action Bar */}
            <AnimatePresence>
              {checkedIds.size > 0 && (
                <BatchActionBar
                  selectedCount={checkedIds.size}
                  onClearSelection={clearSelection}
                  onDeleteSelected={handleBatchDelete}
                  onMoveToProject={handleBatchMoveToProject}
                  onMoveToChannel={handleBatchMoveToChannel}
                  onBatchDownload={handleBatchDownload}
                />
              )}
            </AnimatePresence>

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
              {/* Search with debounce */}
              <div className="relative flex-1 max-w-md">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666]" />
                <Input
                  placeholder="搜索文件名..."
                  value={searchInput}
                  onChange={(e) => handleSearchInputChange(e.target.value)}
                  className="pl-9 pr-8 h-9 bg-[#252525] border-[#3a3a3a] text-white text-sm placeholder:text-[#555] focus-visible:ring-[#4A90E2]/30 focus-visible:border-[#4A90E2]/50"
                />
                {(searchInput || isSearching) && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {isSearching && (
                      <div className="w-3 h-3 border-2 border-[#4A90E2] border-t-transparent rounded-full animate-spin" />
                    )}
                    {searchInput && !isSearching && (
                      <button
                        onClick={() => handleSearchInputChange('')}
                        className="text-[#555] hover:text-[#999] transition-colors"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* Select All */}
                {filteredAssets.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleAll}
                    className={`h-9 px-3 gap-2 text-xs transition-colors ${
                      isAllChecked
                        ? 'bg-[#4A90E2]/10 text-[#4A90E2] hover:bg-[#4A90E2]/20'
                        : 'text-[#888] hover:text-white hover:bg-[#333]'
                    }`}
                  >
                    {isAllChecked ? <CheckSquare size={14} /> : <Square size={14} />}
                    全选
                  </Button>
                )}

                {/* Sort */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 px-3 gap-2 bg-[#252525] border-[#3a3a3a] text-[#ccc] text-xs hover:text-white hover:bg-[#333]"
                    >
                      <ArrowUpDown size={14} />
                      排序
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[200px] bg-[#2D2D2D] border-[#444] p-1">
                    <DropdownMenuLabel className="text-[11px] text-[#666] font-normal px-2 py-1.5">排列顺序</DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-[#444]" />
                    <DropdownMenuItem
                      onClick={() => { setSortBy('date'); setSortOrder('desc'); }}
                      className={`flex items-center justify-between rounded-sm px-2 py-2 text-sm cursor-pointer ${
                        sortBy === 'date' && sortOrder === 'desc'
                          ? 'bg-[#4A90E2] text-white'
                          : 'text-[#ccc] hover:bg-[#333] focus:bg-[#333]'
                      }`}
                    >
                      <span>添加日期从新到旧</span>
                      {sortBy === 'date' && sortOrder === 'desc' && <Check size={14} className="text-white" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => { setSortBy('date'); setSortOrder('asc'); }}
                      className={`flex items-center justify-between rounded-sm px-2 py-2 text-sm cursor-pointer ${
                        sortBy === 'date' && sortOrder === 'asc'
                          ? 'bg-[#4A90E2] text-white'
                          : 'text-[#ccc] hover:bg-[#333] focus:bg-[#333]'
                      }`}
                    >
                      <span>添加日期从旧到新</span>
                      {sortBy === 'date' && sortOrder === 'asc' && <Check size={14} className="text-white" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => { setSortBy('name'); setSortOrder('asc'); }}
                      className={`flex items-center justify-between rounded-sm px-2 py-2 text-sm cursor-pointer ${
                        sortBy === 'name' && sortOrder === 'asc'
                          ? 'bg-[#4A90E2] text-white'
                          : 'text-[#ccc] hover:bg-[#333] focus:bg-[#333]'
                      }`}
                    >
                      <span>文件名 A - Z</span>
                      {sortBy === 'name' && sortOrder === 'asc' && <Check size={14} className="text-white" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => { setSortBy('size'); setSortOrder('desc'); }}
                      className={`flex items-center justify-between rounded-sm px-2 py-2 text-sm cursor-pointer ${
                        sortBy === 'size' && sortOrder === 'desc'
                          ? 'bg-[#4A90E2] text-white'
                          : 'text-[#ccc] hover:bg-[#333] focus:bg-[#333]'
                      }`}
                    >
                      <span>素材大小从大到小</span>
                      {sortBy === 'size' && sortOrder === 'desc' && <Check size={14} className="text-white" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => { setSortBy('type'); setSortOrder('asc'); }}
                      className={`flex items-center justify-between rounded-sm px-2 py-2 text-sm cursor-pointer ${
                        sortBy === 'type' && sortOrder === 'asc'
                          ? 'bg-[#4A90E2] text-white'
                          : 'text-[#ccc] hover:bg-[#333] focus:bg-[#333]'
                      }`}
                    >
                      <span>种类 A - Z</span>
                      {sortBy === 'type' && sortOrder === 'asc' && <Check size={14} className="text-white" />}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* View Toggle */}
                <div className="flex items-center bg-[#252525] border border-[#3a3a3a] rounded-md overflow-hidden">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setViewMode('list')}
                    className={`h-9 w-9 p-0 rounded-none transition-colors ${
                      viewMode === 'list'
                        ? 'bg-[#4A90E2]/20 text-[#4A90E2]'
                        : 'text-[#666] hover:text-white hover:bg-[#333]'
                    }`}
                  >
                    <LayoutList size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setViewMode('grid')}
                    className={`h-9 w-9 p-0 rounded-none transition-colors ${
                      viewMode === 'grid'
                        ? 'bg-[#4A90E2]/20 text-[#4A90E2]'
                        : 'text-[#666] hover:text-white hover:bg-[#333]'
                    }`}
                  >
                    <LayoutGrid size={16} />
                  </Button>
                </div>
              </div>
            </div>

            {/* Type Filter Tabs */}
            {!isLoading && assets.length > 0 && (
              <TypeFilterTabs assets={assets} />
            )}

            {/* Content Area */}
            <div className="rounded-lg border border-[#2a2a2a] overflow-hidden">
              {isLoading ? (
                <div className="animate-pulse space-y-1">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 px-4 py-3 bg-[#1E1E1E]">
                      <div className="h-4 w-4 rounded bg-[#333]" />
                      <div className="h-4 w-48 rounded bg-[#333]" />
                      <div className="h-3 w-20 rounded bg-[#2a2a2a] ml-auto" />
                      <div className="h-3 w-16 rounded bg-[#2a2a2a]" />
                    </div>
                  ))}
                </div>
              ) : filteredAssets.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center py-20 text-[#555]"
                >
                  {typeFilter !== 'all' ? (
                    <>
                      <ImagePlus size={48} className="mb-4 text-[#444]" />
                      <p className="text-sm">
                        当前筛选下没有{typeFilter === 'image' ? '图片' : typeFilter === 'video' ? '视频' : '文档'}文件
                      </p>
                    </>
                  ) : (
                    <>
                      <FolderOpen size={48} className="mb-4 text-[#444]" />
                      <p className="text-sm">
                        {searchQuery ? '没有找到匹配的文件' : '暂无文件，拖拽文件到上方区域开始上传'}
                      </p>
                    </>
                  )}
                </motion.div>
              ) : viewMode === 'list' ? (
                <div>
                  {/* Table Header */}
                  <div className="grid grid-cols-[32px_1fr_80px_80px_70px_90px_80px_40px] sm:grid-cols-[32px_1fr_120px_100px_100px_120px_140px_50px] items-center px-4 py-2.5 bg-[#252525] border-b border-[#333] text-[11px] uppercase text-[#666] font-medium tracking-wider select-none">
                    <div className="flex items-center justify-center">
                      <button
                        onClick={toggleAll}
                        className="text-[#666] hover:text-[#4A90E2] transition-colors p-0.5"
                      >
                        {isAllChecked ? <CheckSquare size={14} className="text-[#4A90E2]" /> : <Square size={14} />}
                      </button>
                    </div>
                    <span>名称</span>
                    <span className="hidden sm:block">渠道</span>
                    <span className="hidden sm:block">尺寸</span>
                    <span>大小</span>
                    <span className="hidden sm:block">种类</span>
                    <span className="hidden sm:block">添加日期</span>
                    <span></span>
                  </div>

                  {/* File Rows */}
                  <div className="max-h-[calc(100vh-400px)] overflow-y-auto custom-scrollbar">
                    <AnimatePresence mode="popLayout">
                      {filteredAssets.map((asset) => (
                        <AssetListRow
                          key={asset.id}
                          asset={asset}
                          isChecked={checkedIds.has(asset.id)}
                          onToggleCheck={() => toggleCheck(asset.id)}
                          onHoverStart={handleHoverStart}
                          onHoverEnd={handleHoverEnd}
                          hoverPosition={hoverPosition}
                          onSingleDelete={handleSingleDelete}
                          filteredAssets={filteredAssets}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              ) : (
                <div className="max-h-[calc(100vh-400px)] overflow-y-auto custom-scrollbar p-4">
                  <motion.div
                    layout
                    className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3"
                  >
                    <AnimatePresence mode="popLayout">
                      {filteredAssets.map((asset) => (
                        <AssetGridCard
                          key={asset.id}
                          asset={asset}
                          isChecked={checkedIds.has(asset.id)}
                          onToggleCheck={() => toggleCheck(asset.id)}
                          onSingleDelete={handleSingleDelete}
                          filteredAssets={filteredAssets}
                        />
                      ))}
                    </AnimatePresence>
                  </motion.div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Dialogs */}
      <PreviewDialog />
      <RenameDialog />
      <CreateProjectDialog />
      <RenameProjectDialog />
      <CreateChannelDialog />
      <RenameChannelDialog />
      {/* Batch delete confirmation */}
      <ConfirmDeleteDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        count={pendingDeleteIds.length}
        onConfirm={executeBatchDelete}
      />
      {/* Single delete confirmation */}
      <ConfirmDeleteDialog
        open={!!singleDeleteTarget}
        onOpenChange={(open) => { if (!open) setSingleDeleteTarget(null); }}
        count={1}
        targetName={singleDeleteTarget?.name}
        onConfirm={executeSingleDelete}
      />
    </div>
  );
}
