import { NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { ACCEPTED_EXTENSIONS, getFileExtension } from '@/lib/file-utils';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as HandleUploadBody;

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith('assets/')) {
          throw new Error('Invalid upload path');
        }

        const fileName = pathname.slice('assets/'.length);
        if (!fileName || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
          throw new Error('Invalid filename');
        }

        const ext = getFileExtension(fileName);
        if (!ACCEPTED_EXTENSIONS.has(ext)) {
          throw new Error('Unsupported file type');
        }

        return {
          addRandomSuffix: false,
        };
      },
      onUploadCompleted: async () => {
        // Asset metadata is registered synchronously by /api/assets/register.
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error('Blob upload token error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to authorize upload' },
      { status: 400 }
    );
  }
}
