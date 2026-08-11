import { useCallback, useRef, useState } from 'react';
import { api } from '../lib/api';

/**
 * Uploads straight from the browser to Cloudinary using a signature minted by
 * our backend. The file bytes never pass through our server, which matters on a
 * free dyno and matters more when someone uploads a 40 MB video over 4G.
 *
 * XMLHttpRequest rather than fetch, purely because fetch still has no upload
 * progress event — and on a bad mobile connection a progress bar is the
 * difference between waiting and giving up.
 */
export function useCloudinaryUpload() {
  const [items, setItems] = useState([]); // { localId, file, previewUrl, progress, status, error, result }
  const sigCache = useRef(null);
  const nextId = useRef(0);

  const getSignature = useCallback(async () => {
    // Cloudinary signatures are time-bound; re-mint if older than ~5 minutes.
    const now = Date.now();
    if (sigCache.current && now - sigCache.current.fetchedAt < 5 * 60 * 1000) {
      return sigCache.current.data;
    }
    const { data } = await api.post('/uploads/signature');
    sigCache.current = { data, fetchedAt: now };
    return data;
  }, []);

  const uploadOne = useCallback(
    async (localId, file, sig) => {
      const isVideo = file.type.startsWith('video/');
      const endpoint = `https://api.cloudinary.com/v1_1/${sig.cloudName}/${isVideo ? 'video' : 'image'}/upload`;

      const form = new FormData();
      form.append('file', file);
      form.append('api_key', sig.apiKey);
      form.append('timestamp', String(sig.timestamp));
      form.append('folder', sig.folder);
      form.append('signature', sig.signature);

      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', endpoint);

        xhr.upload.onprogress = (e) => {
          if (!e.lengthComputable) return;
          const progress = Math.round((e.loaded / e.total) * 100);
          setItems((prev) => prev.map((it) => (it.localId === localId ? { ...it, progress } : it)));
        };

        xhr.onload = () => {
          let body;
          try {
            body = JSON.parse(xhr.responseText);
          } catch {
            return reject(new Error('Cloudinary returned an unreadable response'));
          }
          if (xhr.status >= 400 || body.error) {
            return reject(new Error(body.error?.message ?? `Upload failed (${xhr.status})`));
          }
          resolve(body);
        };

        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.onabort = () => reject(new Error('Upload cancelled'));

        xhr.send(form);
      });
    },
    []
  );

  const addFiles = useCallback(
    async (fileList) => {
      const files = Array.from(fileList);
      if (!files.length) return;

      let sig;
      try {
        sig = await getSignature();
      } catch (err) {
        // One synthetic failed row so the user sees why nothing happened.
        setItems((prev) => [
          ...prev,
          {
            localId: `err-${nextId.current++}`,
            name: files[0].name,
            progress: 0,
            status: 'error',
            error: err.message,
          },
        ]);
        return;
      }

      const staged = files.map((file) => {
        const isVideo = file.type.startsWith('video/');
        const limit = isVideo ? sig.limits.maxVideoBytes : sig.limits.maxImageBytes;
        const accepted = isVideo ? sig.limits.acceptedVideo : sig.limits.acceptedImage;

        const tooBig = file.size > limit;
        const wrongType = !accepted.includes(file.type);

        return {
          localId: `f-${nextId.current++}`,
          file,
          name: file.name,
          isVideo,
          previewUrl: URL.createObjectURL(file),
          progress: 0,
          status: tooBig || wrongType ? 'error' : 'uploading',
          error: tooBig
            ? `Too large — max ${Math.round(limit / 1024 / 1024)} MB`
            : wrongType
              ? `Unsupported file type (${file.type || 'unknown'})`
              : null,
        };
      });

      setItems((prev) => [...prev, ...staged]);

      await Promise.all(
        staged
          .filter((s) => s.status === 'uploading')
          .map(async (s) => {
            try {
              const result = await uploadOne(s.localId, s.file, sig);
              setItems((prev) =>
                prev.map((it) =>
                  it.localId === s.localId
                    ? { ...it, status: 'done', progress: 100, result }
                    : it
                )
              );
            } catch (err) {
              setItems((prev) =>
                prev.map((it) =>
                  it.localId === s.localId ? { ...it, status: 'error', error: err.message } : it
                )
              );
            }
          })
      );
    },
    [getSignature, uploadOne]
  );

  const remove = useCallback((localId) => {
    setItems((prev) => {
      const target = prev.find((it) => it.localId === localId);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((it) => it.localId !== localId);
    });
  }, []);

  const reset = useCallback(() => {
    setItems((prev) => {
      prev.forEach((it) => it.previewUrl && URL.revokeObjectURL(it.previewUrl));
      return [];
    });
  }, []);

  /** Shape the backend's POST /api/reports expects. */
  const toMediaPayload = useCallback(
    () =>
      items
        .filter((it) => it.status === 'done' && it.result)
        .map((it, index) => ({
          cloudinaryPublicId: it.result.public_id,
          url: it.result.secure_url,
          thumbnailUrl: it.result.secure_url.replace(
            '/upload/',
            '/upload/c_fill,w_400,h_300,q_auto,f_auto/'
          ),
          resourceType: it.result.resource_type === 'video' ? 'video' : 'image',
          width: it.result.width,
          height: it.result.height,
          isPrimary: index === 0,
        })),
    [items]
  );

  return {
    items,
    addFiles,
    remove,
    reset,
    toMediaPayload,
    isUploading: items.some((it) => it.status === 'uploading'),
    doneCount: items.filter((it) => it.status === 'done').length,
  };
}
