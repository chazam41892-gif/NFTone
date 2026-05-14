/**
 * HTTP client for services/audio_watermarker (FastAPI, port 8500 by default).
 *
 * The watermarker is a separate Python service. It must be running for these
 * calls to succeed. In development:
 *   cd services/audio_watermarker && uvicorn src.api:app --port 8500
 *
 * In production, deploy it alongside the Next.js app and set
 * NFTONES_WATERMARKER_URL to its internal URL.
 */

const WATERMARKER_URL =
  process.env.NFTONES_WATERMARKER_URL || "http://localhost:8500";

export type EmbedResult = {
  watermarkedAudio: Buffer;
  contentType: string;
  walletFingerprint: string;
  releaseId: string;
  masterSha256: string;
  derivativeSha256: string;
  alpha: number;
  format: string;
  isStereo: boolean;
};

export type DetectResult = {
  matched: boolean;
  walletId: string | null;
  walletFingerprint: string | null;
  correlation: number;
  confidence: "none" | "low" | "medium" | "high";
  walletsSearched: number;
  threshold: number;
};

export class WatermarkerError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "WatermarkerError";
  }
}

export async function watermarkerHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${WATERMARKER_URL}/api/v1/health`, {
      cache: "no-store",
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data?.status === "ok";
  } catch {
    return false;
  }
}

/**
 * Embed a wallet-derived watermark in the given audio.
 *
 * @param audio    Raw audio bytes (WAV/MP3/AAC/M4A/FLAC).
 * @param filename Original filename (used for format detection).
 * @param contentType MIME type from the upload.
 * @param releaseId Stable ID for the release (used to scope detection).
 * @param walletId  Buyer's wallet address.
 */
export async function embedWatermark(
  audio: Buffer,
  filename: string,
  contentType: string,
  releaseId: string,
  walletId: string
): Promise<EmbedResult> {
  const form = new FormData();
  const blob = new Blob([audio], { type: contentType });
  form.append("audio", blob, filename);
  form.append("release_id", releaseId);
  form.append("wallet_id", walletId);

  const res = await fetch(`${WATERMARKER_URL}/api/v1/watermark/embed`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    let detail = "";
    try {
      detail = JSON.stringify(await res.json());
    } catch {
      detail = await res.text();
    }
    throw new WatermarkerError(
      res.status,
      `Watermarker embed failed: ${res.status} ${detail}`
    );
  }

  const watermarkedAudio = Buffer.from(await res.arrayBuffer());
  return {
    watermarkedAudio,
    contentType: res.headers.get("content-type") || contentType,
    walletFingerprint: res.headers.get("x-wallet-fingerprint") || "",
    releaseId: res.headers.get("x-release-id") || releaseId,
    masterSha256: res.headers.get("x-master-sha256") || "",
    derivativeSha256: res.headers.get("x-derivative-sha256") || "",
    alpha: Number(res.headers.get("x-alpha") || 0),
    format: res.headers.get("x-format") || "",
    isStereo: res.headers.get("x-is-stereo") === "1",
  };
}

/**
 * Detect which wallet a suspected leaked audio belongs to.
 */
export async function detectWatermark(
  audio: Buffer,
  filename: string,
  contentType: string,
  releaseId?: string
): Promise<DetectResult> {
  const form = new FormData();
  const blob = new Blob([audio], { type: contentType });
  form.append("audio", blob, filename);
  if (releaseId) form.append("release_id", releaseId);

  const res = await fetch(`${WATERMARKER_URL}/api/v1/watermark/detect`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    let detail = "";
    try {
      detail = JSON.stringify(await res.json());
    } catch {
      detail = await res.text();
    }
    throw new WatermarkerError(
      res.status,
      `Watermarker detect failed: ${res.status} ${detail}`
    );
  }

  const data = await res.json();
  return {
    matched: Boolean(data.matched),
    walletId: data.wallet_id ?? null,
    walletFingerprint: data.wallet_fingerprint ?? null,
    correlation: Number(data.correlation ?? 0),
    confidence: data.confidence ?? "none",
    walletsSearched: Number(data.wallets_searched ?? 0),
    threshold: Number(data.threshold ?? 0),
  };
}
