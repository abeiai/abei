export function getAdminAudioSourceFileUrl(path: string | null) {
  const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3322/api";

  return path ? `${apiBaseUrl}${path}` : null;
}
