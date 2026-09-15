/** YouTube watch / share / embed → 11-char id. Direct files stay as-is. */

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

export function youtubeIdFromUrl(url: string | null | undefined): string | null {
  const raw = (url ?? '').trim();
  if (!raw) return null;
  if (YT_ID.test(raw)) return raw;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = parsed.pathname.split('/').filter(Boolean)[0] ?? '';
      return YT_ID.test(id) ? id : null;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      const v = parsed.searchParams.get('v');
      if (v && YT_ID.test(v)) return v;
      const parts = parsed.pathname.split('/').filter(Boolean);
      const embedAt = parts[0] === 'embed' || parts[0] === 'shorts' ? parts[1] : '';
      if (embedAt && YT_ID.test(embedAt)) return embedAt;
    }
  } catch {
    return null;
  }
  return null;
}

export function youtubeEmbedUrl(url: string | null | undefined): string | null {
  const id = youtubeIdFromUrl(url);
  return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
}

export function isDirectVideoUrl(url: string | null | undefined): boolean {
  const raw = (url ?? '').trim();
  if (!raw || youtubeIdFromUrl(raw)) return false;
  return /\.(mp4|webm|ogg)(\?|#|$)/i.test(raw);
}

export type ExerciseVideoKind = 'youtube' | 'file' | null;

export function exerciseVideoKind(url: string | null | undefined): ExerciseVideoKind {
  if (!(url ?? '').trim()) return null;
  if (youtubeIdFromUrl(url)) return 'youtube';
  return 'file';
}
