import { useEffect, useState } from 'react';
import { fetchClientPhotoSharing, type PhotoSharingState } from '../data/photoSharing';

/** Coach side: whether this client chose to share progress photos (null while loading). */
export function useClientPhotoSharing(clientId: string | undefined): PhotoSharingState | null {
  const [state, setState] = useState<PhotoSharingState | null>(null);
  useEffect(() => {
    if (!clientId) { setState(null); return; }
    let cancelled = false;
    setState(null);
    void fetchClientPhotoSharing(clientId).then(next => { if (!cancelled) setState(next); });
    return () => { cancelled = true; };
  }, [clientId]);
  return state;
}
