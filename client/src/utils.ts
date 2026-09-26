export function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
  const s = Math.floor(totalSeconds % 60);
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

const YOUTUBE_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

/** Accepts a bare 11-char video ID, a youtu.be link, or a full
 * youtube.com/watch?v= link (including extra query params, timestamps,
 * playlist context, etc.) and returns just the video ID, or null. */
export function extractYouTubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (YOUTUBE_ID_PATTERN.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    if (url.hostname.includes('youtu.be')) {
      const id = url.pathname.slice(1).split('/')[0];
      return YOUTUBE_ID_PATTERN.test(id) ? id : null;
    }
    if (url.hostname.includes('youtube.com')) {
      if (url.pathname === '/watch') {
        const id = url.searchParams.get('v');
        return id && YOUTUBE_ID_PATTERN.test(id) ? id : null;
      }
      if (url.pathname.startsWith('/embed/') || url.pathname.startsWith('/shorts/')) {
        const id = url.pathname.split('/')[2];
        return YOUTUBE_ID_PATTERN.test(id) ? id : null;
      }
    }
  } catch {
    return null;
  }
  return null;
}
