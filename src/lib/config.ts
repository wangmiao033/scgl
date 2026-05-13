import path from 'path';

/**
 * 统一路径配置
 * 所有路径通过环境变量驱动，默认值为开发环境路径
 */

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'assets');
const THUMBNAIL_DIR = path.join(DATA_DIR, 'thumbnails');

export { UPLOAD_DIR, THUMBNAIL_DIR };
