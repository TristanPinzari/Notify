export function extractVideoId(url: string): string | null {
  const match = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

export function normalizeYoutubeUrl(url: string): string {
  const id = extractVideoId(url);
  return id ? `https://youtu.be/${id}` : url;
}
