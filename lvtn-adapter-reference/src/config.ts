/**
 * NFTones adapter — configuration.
 *
 * Reads from environment so the $LVTN platform can point at different NFTones
 * deployments (local dev, co-resident on Hetzner, adjacent VM, future standalone)
 * without changing code. ALL coupling to NFTones lives in this file plus
 * `client.ts`; nothing else in the platform should know NFTones exists.
 */

export interface NftonesConfig {
  /** Base URL of the NFTones audio service. e.g. http://127.0.0.1:8500 (co-resident) */
  audioBaseUrl: string;
  /** Base URL of the NFTones video service. e.g. http://127.0.0.1:8501 */
  videoBaseUrl: string;
  /** Base URL of the NFTones image service. e.g. http://127.0.0.1:8502 */
  imageBaseUrl: string;
  /** Base URL of the NFTones document service. e.g. http://127.0.0.1:8503 */
  documentBaseUrl: string;
  /** Optional bearer token used by adapter→NFTones requests (NFTones-internal auth). */
  bearerToken: string | undefined;
  /** Master feature flag. When false, all NFTones routes return 503; nothing is called. */
  enabled: boolean;
  /** Request timeout in milliseconds. Audio embeds can be slow on long files. */
  timeoutMs: number;
}

const env = (key: string, fallback: string): string =>
  (typeof process !== 'undefined' && process.env?.[key]) || fallback;

export function loadNftonesConfig(): NftonesConfig {
  return {
    audioBaseUrl: env('NFTONES_AUDIO_BASE_URL', 'http://127.0.0.1:8500'),
    videoBaseUrl: env('NFTONES_VIDEO_BASE_URL', 'http://127.0.0.1:8501'),
    imageBaseUrl: env('NFTONES_IMAGE_BASE_URL', 'http://127.0.0.1:8502'),
    documentBaseUrl: env('NFTONES_DOCUMENT_BASE_URL', 'http://127.0.0.1:8503'),
    bearerToken: env('NFTONES_BEARER_TOKEN', '') || undefined,
    enabled: env('NFTONES_ENABLED', 'false').toLowerCase() === 'true',
    timeoutMs: parseInt(env('NFTONES_TIMEOUT_MS', '120000'), 10),
  };
}

/**
 * Pick the right NFTones service base URL for a given content-type. Falls back
 * to audio for `application/octet-stream` so we never blindly route an unknown
 * MIME to the wrong service.
 */
export function baseUrlForContentType(
  cfg: NftonesConfig,
  contentType: string | undefined,
): { baseUrl: string; mediaClass: 'audio' | 'video' | 'image' | 'document' | null } {
  const ct = (contentType || '').toLowerCase().split(';')[0].trim();
  if (ct.startsWith('audio/')) return { baseUrl: cfg.audioBaseUrl, mediaClass: 'audio' };
  if (ct.startsWith('video/')) return { baseUrl: cfg.videoBaseUrl, mediaClass: 'video' };
  if (ct.startsWith('image/')) return { baseUrl: cfg.imageBaseUrl, mediaClass: 'image' };
  if (
    ct === 'application/pdf' ||
    ct === 'application/epub+zip' ||
    ct.startsWith('application/vnd.openxmlformats-officedocument') ||
    ct === 'application/msword'
  ) {
    return { baseUrl: cfg.documentBaseUrl, mediaClass: 'document' };
  }
  return { baseUrl: cfg.audioBaseUrl, mediaClass: null };
}
