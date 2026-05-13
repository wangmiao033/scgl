import { existsSync, mkdirSync } from 'fs';
import path from 'path';

const isVercel = Boolean(process.env.VERCEL);
const projectRoot = process.cwd();
const writableRoot = isVercel ? path.join('/tmp', 'scgl') : projectRoot;

export const BUNDLED_UPLOAD_ASSETS_DIR = path.join(projectRoot, 'upload', 'assets');
export const BUNDLED_UPLOAD_THUMBNAILS_DIR = path.join(projectRoot, 'upload', 'thumbnails');
export const UPLOAD_ASSETS_DIR = path.join(writableRoot, 'upload', 'assets');
export const UPLOAD_THUMBNAILS_DIR = path.join(writableRoot, 'upload', 'thumbnails');

export function ensureUploadDirectories() {
  mkdirSync(UPLOAD_ASSETS_DIR, { recursive: true });
  mkdirSync(UPLOAD_THUMBNAILS_DIR, { recursive: true });
}

export function assetFileCandidates(filename: string) {
  return [
    path.join(UPLOAD_ASSETS_DIR, filename),
    path.join(BUNDLED_UPLOAD_ASSETS_DIR, filename),
  ];
}

export function thumbnailFileCandidates(filename: string) {
  return [
    path.join(UPLOAD_THUMBNAILS_DIR, filename),
    path.join(BUNDLED_UPLOAD_THUMBNAILS_DIR, filename),
  ];
}

export function resolveAssetFilePath(filename: string) {
  return assetFileCandidates(filename).find((filePath) => existsSync(filePath));
}

export function resolveThumbnailFilePath(filename: string) {
  return thumbnailFileCandidates(filename).find((filePath) => existsSync(filePath));
}
