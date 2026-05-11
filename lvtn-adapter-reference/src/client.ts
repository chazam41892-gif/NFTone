/**
 * NFTones REST client — the ONLY $LVTN code that talks to NFTones over HTTP.
 *
 * If the NFTones contract changes, only this file changes. Anti-corruption.
 * Per MODULE_BOUNDARIES.md — every call goes through here.
 *
 * Honest scope: today only the audio service is implemented. Video/image/
 * document calls will return 503 from NFTones until those services ship.
 * The client doesn't fake success — it surfaces the 503 to the caller.
 */

import { type NftonesConfig, baseUrlForContentType } from './config';

export type MediaClass = 'audio' | 'video' | 'image' | 'document';

export interface EmbedResult {
  ok: true;
  watermarkedBytes: Buffer;
  walletFingerprint: string;
  releaseId: string;
  masterSha256: string;
  derivativeSha256: string;
  alpha: number;
  contentType: string;
  mediaClass: MediaClass;
}

export interface DetectResult {
  ok: true;
  matched: boolean;
  walletId: string | null;
  walletFingerprint: string | null;
  correlation: number;
  confidence: 'high' | 'medium' | 'low' | 'none';
  walletsSearched: number;
  threshold: number;
}

export interface ServiceError {
  ok: false;
  status: number;
  reason: string;
  /** True if the service responded with 503 indicating "not implemented yet" rather than a real outage. */
  notYetImplemented: boolean;
}

export type EmbedResponse = EmbedResult | ServiceError;
export type DetectResponse = DetectResult | ServiceError;

/**
 * Embed a watermark in `fileBytes` for `walletId` and return the watermarked
 * bytes. Routes to the correct NFTones backend by content-type.
 */
export async function embed(
  cfg: NftonesConfig,
  args: {
    fileBytes: Buffer;
    fileName: string;
    contentType: string;
    releaseId: string;
    walletId: string;
    alpha?: number;
  },
): Promise<EmbedResponse> {
  if (!cfg.enabled) {
    return { ok: false, status: 503, reason: 'NFTones adapter disabled (NFTONES_ENABLED=false)', notYetImplemented: false };
  }

  const { baseUrl, mediaClass } = baseUrlForContentType(cfg, args.contentType);
  if (mediaClass === null) {
    return {
      ok: false,
      status: 415,
      reason: `Unsupported content-type: ${args.contentType}`,
      notYetImplemented: false,
    };
  }

  const form = new FormData();
  const blob = new Blob([new Uint8Array(args.fileBytes)], { type: args.contentType });
  form.append('audio', blob, args.fileName); // field name is "audio" across all services
  form.append('release_id', args.releaseId);
  form.append('wallet_id', args.walletId);
  if (args.alpha !== undefined) form.append('alpha', String(args.alpha));

  const url = `${baseUrl}/api/v1/watermark/embed`;
  const headers: Record<string, string> = {};
  if (cfg.bearerToken) headers.Authorization = `Bearer ${cfg.bearerToken}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(url, { method: 'POST', headers, body: form, signal: controller.signal });
    if (!res.ok) {
      // Try to parse a body; default to status text.
      let reason = res.statusText;
      try {
        const j = await res.json();
        reason = j?.detail || j?.error || j?.reason || reason;
      } catch {
        /* body wasn't JSON; that's ok */
      }
      return {
        ok: false,
        status: res.status,
        reason,
        notYetImplemented: res.status === 503,
      };
    }
    const watermarkedBytes = Buffer.from(await res.arrayBuffer());
    return {
      ok: true,
      watermarkedBytes,
      walletFingerprint: res.headers.get('x-wallet-fingerprint') || '',
      releaseId: res.headers.get('x-release-id') || args.releaseId,
      masterSha256: res.headers.get('x-master-sha256') || '',
      derivativeSha256: res.headers.get('x-derivative-sha256') || '',
      alpha: parseFloat(res.headers.get('x-alpha') || '0'),
      contentType: res.headers.get('content-type') || args.contentType,
      mediaClass,
    };
  } catch (err: any) {
    return {
      ok: false,
      status: err?.name === 'AbortError' ? 504 : 502,
      reason: err?.message || 'network error talking to NFTones',
      notYetImplemented: false,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Detect which wallet a suspected leak belongs to.
 */
export async function detect(
  cfg: NftonesConfig,
  args: {
    fileBytes: Buffer;
    fileName: string;
    contentType: string;
    releaseId?: string;
  },
): Promise<DetectResponse> {
  if (!cfg.enabled) {
    return { ok: false, status: 503, reason: 'NFTones adapter disabled', notYetImplemented: false };
  }

  const { baseUrl, mediaClass } = baseUrlForContentType(cfg, args.contentType);
  if (mediaClass === null) {
    return {
      ok: false,
      status: 415,
      reason: `Unsupported content-type: ${args.contentType}`,
      notYetImplemented: false,
    };
  }

  const form = new FormData();
  const blob = new Blob([new Uint8Array(args.fileBytes)], { type: args.contentType });
  form.append('audio', blob, args.fileName);
  if (args.releaseId) form.append('release_id', args.releaseId);

  const url = `${baseUrl}/api/v1/watermark/detect`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (cfg.bearerToken) headers.Authorization = `Bearer ${cfg.bearerToken}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(url, { method: 'POST', headers, body: form, signal: controller.signal });
    if (!res.ok) {
      let reason = res.statusText;
      try {
        const j = await res.json();
        reason = j?.detail || j?.error || j?.reason || reason;
      } catch {
        /* ignore */
      }
      return { ok: false, status: res.status, reason, notYetImplemented: res.status === 503 };
    }
    const j: any = await res.json();
    return {
      ok: true,
      matched: !!j.matched,
      walletId: j.wallet_id ?? null,
      walletFingerprint: j.wallet_fingerprint ?? null,
      correlation: Number(j.correlation ?? 0),
      confidence: (j.confidence ?? 'none') as DetectResult['confidence'],
      walletsSearched: Number(j.wallets_searched ?? 0),
      threshold: Number(j.threshold ?? 0),
    };
  } catch (err: any) {
    return {
      ok: false,
      status: err?.name === 'AbortError' ? 504 : 502,
      reason: err?.message || 'network error talking to NFTones',
      notYetImplemented: false,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Liveness probe — pings whichever service base URLs are configured. */
export async function health(cfg: NftonesConfig): Promise<{
  audio: boolean;
  video: boolean;
  image: boolean;
  document: boolean;
}> {
  const probe = async (url: string): Promise<boolean> => {
    try {
      const r = await fetch(`${url}/api/v1/health`, { signal: AbortSignal.timeout(2000) });
      return r.ok;
    } catch {
      return false;
    }
  };
  const [audio, video, image, document] = await Promise.all([
    probe(cfg.audioBaseUrl),
    probe(cfg.videoBaseUrl),
    probe(cfg.imageBaseUrl),
    probe(cfg.documentBaseUrl),
  ]);
  return { audio, video, image, document };
}
