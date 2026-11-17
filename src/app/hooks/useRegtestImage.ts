import { useEffect, useState } from 'react';

export default function useRegtestImage(url: string | undefined): string | undefined {
  const [image, setImage] = useState<{ url: string; objectUrl: string }>();
  useEffect(() => {
    if (!url) return undefined;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    fetch(url, { signal: controller.signal, credentials: 'omit', redirect: 'error' })
      .then((response) => (response.ok ? response.blob() : undefined))
      .then((blob) => {
        if (!blob || controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setImage({ url, objectUrl });
      })
      .catch(() => {});
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);
  return image && image.url === url ? image.objectUrl : undefined;
}
