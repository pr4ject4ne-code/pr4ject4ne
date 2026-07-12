/**
 * Client helper: upload a single image file to /api/uploads and return its public
 * URL. Safe to import from client components (no server-only deps). Throws with a
 * user-facing message on failure (unauthenticated, unconfigured, too large, etc.).
 */
export async function uploadFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.set('file', file);
  const res = await fetch('/api/uploads', { method: 'POST', body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) {
    throw new Error(data.error ?? 'Upload failed. Please try again.');
  }
  return data.url as string;
}
