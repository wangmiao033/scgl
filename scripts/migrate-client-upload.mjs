import { readFile, writeFile } from 'node:fs/promises';

const pagePath = 'src/app/page.tsx';
let source = await readFile(pagePath, 'utf8');

const blobImport = "import { upload } from '@vercel/blob/client';";
if (!source.includes(blobImport)) {
  const importAnchor = "import { toast } from 'sonner';";
  if (!source.includes(importAnchor)) {
    throw new Error('Unable to find the sonner import anchor in src/app/page.tsx');
  }
  source = source.replace(importAnchor, `${importAnchor}\n${blobImport}`);
}

if (!source.includes('// SCGL_VERCEL_BLOB_UPLOAD')) {
  const startMarker = '  const handleFiles = useCallback(async (files: FileList | File[]) => {';
  const endMarker = '\n  const handleDrop = useCallback(';
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);

  if (start === -1 || end === -1) {
    throw new Error('Unable to find UploadZone.handleFiles in src/app/page.tsx');
  }

  const replacement = String.raw`  // SCGL_VERCEL_BLOB_UPLOAD
  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const validFiles = fileArray.filter((file) => {
      const ext = getFileExtension(file.name);
      return ACCEPTED_EXTENSIONS.has(ext);
    });

    if (validFiles.length === 0) {
      toast.error('没有支持的文件类型');
      return;
    }

    if (validFiles.length < fileArray.length) {
      toast.warning((fileArray.length - validFiles.length) + ' 个文件类型不支持，已跳过');
    }

    setIsUploading(true);
    setUploadProgress(0);

    const projectId = activeProjectId && activeProjectId !== 'unassigned' ? activeProjectId : null;
    const channelId = activeChannelId && activeChannelId !== 'unassigned' ? activeChannelId : null;
    const totalBytes = validFiles.reduce((sum, file) => sum + file.size, 0);
    let completedBytes = 0;
    let uploadedCount = 0;
    let failedCount = 0;

    for (const file of validFiles) {
      const ext = getFileExtension(file.name);
      const uniqueFileName = crypto.randomUUID() + '.' + ext;

      try {
        const blob = await upload('assets/' + uniqueFileName, file, {
          access: 'private',
          handleUploadUrl: '/api/assets/upload',
          contentType: file.type || undefined,
          multipart: file.size > 4 * 1024 * 1024,
          onUploadProgress: ({ loaded }) => {
            if (totalBytes > 0) {
              const progress = Math.round(((completedBytes + loaded) / totalBytes) * 100);
              setUploadProgress(Math.min(progress, 99));
            }
          },
        });

        const registerResponse = await fetch('/api/assets/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pathname: blob.pathname,
            originalName: file.name,
            fileSize: file.size,
            mimeType: file.type || blob.contentType || 'application/octet-stream',
            projectId,
            channelId,
          }),
        });

        if (!registerResponse.ok) {
          const errorBody = await registerResponse.json().catch(() => null);
          throw new Error(errorBody?.error || 'Failed to register uploaded file');
        }

        uploadedCount += 1;
      } catch (error) {
        console.error('Upload failed:', error);
        failedCount += 1;
      } finally {
        completedBytes += file.size;
        if (totalBytes > 0) {
          setUploadProgress(Math.round((completedBytes / totalBytes) * 100));
        }
      }
    }

    if (uploadedCount > 0) {
      triggerRefresh();
      setHasUploadedOnce(true);
    }

    if (failedCount === 0) {
      toast.success('成功上传 ' + uploadedCount + ' 个文件');
    } else if (uploadedCount > 0) {
      toast.warning('成功上传 ' + uploadedCount + ' 个文件，' + failedCount + ' 个失败');
    } else {
      toast.error('上传失败，请重试');
    }

    setTimeout(() => {
      setIsUploading(false);
      setUploadProgress(0);
    }, 600);
  }, [setIsUploading, setUploadProgress, triggerRefresh, activeProjectId, activeChannelId]);
`;

  source = source.slice(0, start) + replacement + source.slice(end);
}

await writeFile(pagePath, source, 'utf8');
