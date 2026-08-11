import { useRef, useState } from 'react';

export default function MediaUploader({ uploader }) {
  const { items, addFiles, remove, isUploading } = uploader;
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={[
          'rounded-xl border-2 border-dashed p-6 text-center transition-colors',
          dragging ? 'border-brand-500 bg-brand-50' : 'border-stone-300 bg-white',
        ].join(' ')}
      >
        <div className="text-3xl" aria-hidden="true">
          📸
        </div>
        <p className="mt-2 text-sm font-medium text-stone-800">
          Add photos of the dog{' '}
          <span className="font-normal text-stone-500">— and video if you have it</span>
        </p>
        <p className="mt-1 text-xs text-stone-500">
          A clear photo of the whole dog helps most. Photos up to 10 MB, video up to 60 MB.
        </p>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Choose files
        </button>

        {/* capture="environment" opens the rear camera directly on a phone,
            which is how most of these reports will actually be made. */}
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          capture="environment"
          multiple
          hidden
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {items.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((it) => (
            <li key={it.localId} className="relative overflow-hidden rounded-lg border border-stone-200 bg-stone-50">
              <div className="aspect-4/3 w-full bg-stone-100">
                {it.previewUrl &&
                  (it.isVideo ? (
                    <video src={it.previewUrl} className="size-full object-cover" muted />
                  ) : (
                    <img src={it.previewUrl} alt="" className="size-full object-cover" />
                  ))}
              </div>

              {it.status === 'uploading' && (
                <div className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1">
                  <div className="h-1 w-full overflow-hidden rounded bg-white/30">
                    <div
                      className="h-full bg-brand-400 transition-[width]"
                      style={{ width: `${it.progress}%` }}
                    />
                  </div>
                  <p className="mt-0.5 text-[10px] text-white">{it.progress}%</p>
                </div>
              )}

              {it.status === 'done' && (
                <span className="absolute left-1.5 top-1.5 rounded bg-green-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  ✓ Uploaded
                </span>
              )}

              {it.status === 'error' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-900/80 p-2 text-center">
                  <p className="text-[11px] font-medium text-white">{it.error}</p>
                </div>
              )}

              <button
                type="button"
                onClick={() => remove(it.localId)}
                aria-label={`Remove ${it.name}`}
                className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-black/60 text-xs text-white hover:bg-black/80"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {isUploading && <p className="text-xs text-stone-500">Uploading… you can keep filling the form.</p>}
    </div>
  );
}
