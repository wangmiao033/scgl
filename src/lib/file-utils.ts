export interface AssetRecord {
  id: string;
  fileName: string;
  originalName: string;
  fileSize: number;
  mimeType: string;
  width: number | null;
  height: number | null;
  filePath: string;
  projectId: string | null;
  channelId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectRecord {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { assets: number };
}

export interface ChannelRecord {
  id: string;
  name: string;
  description: string | null;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  _count?: { assets: number };
}

// File type to Chinese label mapping
const fileTypeLabels: Record<string, string> = {
  'psd': 'PSD文件',
  'jpg': 'JPEG图像',
  'jpeg': 'JPEG图像',
  'png': 'PNG图像',
  'gif': 'GIF图像',
  'svg': 'SVG图像',
  'webp': 'WebP图像',
  'bmp': 'BMP图像',
  'tiff': 'TIFF图像',
  'tif': 'TIFF图像',
  'ai': 'AI文件',
  'eps': 'EPS文件',
  'pdf': 'PDF文件',
  'mp4': 'MP4视频',
  'mov': 'MOV视频',
  'avi': 'AVI视频',
  'mkv': 'MKV视频',
  'webm': 'WebM视频',
};

// File type to icon color mapping
export const fileTypeColors: Record<string, string> = {
  'psd': '#31A8FF',
  'jpg': '#E8A035',
  'jpeg': '#E8A035',
  'png': '#A855F7',
  'gif': '#F97316',
  'svg': '#FBBF24',
  'webp': '#34D399',
  'bmp': '#6B7280',
  'tiff': '#8B5CF6',
  'tif': '#8B5CF6',
  'ai': '#FF9A00',
  'eps': '#8B5CF6',
  'pdf': '#EF4444',
  'mp4': '#3B82F6',
  'mov': '#6366F1',
  'avi': '#10B981',
  'mkv': '#06B6D4',
  'webm': '#8B5CF6',
};

export const IMAGE_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'tiff', 'tif'
]);

export const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'avi', 'mkv', 'webm']);

export const DOCUMENT_EXTENSIONS = new Set(['psd', 'ai', 'eps', 'pdf', 'svg']);

export const ACCEPTED_EXTENSIONS = new Set([
  'psd', 'jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'tiff', 'tif',
  'ai', 'eps', 'pdf', 'mp4', 'mov', 'avi'
]);

// Video extensions for filter (includes mkv, webm which may not be uploadable but can be filtered)
export const VIDEO_FILTER_EXTENSIONS = new Set(['mp4', 'mov', 'avi', 'mkv', 'webm']);

export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

export function getFileTypeLabel(filename: string): string {
  const ext = getFileExtension(filename);
  return fileTypeLabels[ext] || `${ext.toUpperCase()}文件`;
}

export function getFileTypeColor(filename: string): string {
  const ext = getFileExtension(filename);
  return fileTypeColors[ext] || '#999999';
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const fileDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const timeStr = `${hours}:${minutes}`;

  if (fileDate.getTime() === today.getTime()) {
    return `今天 ${timeStr}`;
  } else if (fileDate.getTime() === yesterday.getTime()) {
    return `昨天 ${timeStr}`;
  } else {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

export function formatDimensions(width: number | null, height: number | null): string {
  if (width && height) {
    return `${width} × ${height}`;
  }
  return '--';
}

export function isImageFile(filename: string): boolean {
  return IMAGE_EXTENSIONS.has(getFileExtension(filename));
}

export function isVideoFile(filename: string): boolean {
  return VIDEO_EXTENSIONS.has(getFileExtension(filename));
}

export function isDocumentFile(filename: string): boolean {
  return DOCUMENT_EXTENSIONS.has(getFileExtension(filename));
}

export function categorizeFile(filename: string): 'image' | 'video' | 'document' | 'other' {
  const ext = getFileExtension(filename);
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (DOCUMENT_EXTENSIONS.has(ext)) return 'document';
  return 'other';
}
