/**
 * Express subrouter for NFTones — mounts under /api/nftones/* in the $LVTN
 * Node app. This is the ONLY place $LVTN exposes NFTones surfaces to its own
 * clients.
 *
 * To wire into the live server:
 *   import { mountNftones } from './integrations/nftones/mount';
 *   mountNftones(app);
 *
 * That single line is the entire integration footprint on the $LVTN side.
 * Per `fortune-500-upgrade-discipline`: feature-flagged (NFTONES_ENABLED=false
 * by default — flag OFF = all routes return 503, NFTones is never called).
 *
 * Auth: this router does NOT authenticate. Mount it BEHIND your existing
 * $LVTN auth middleware. The router trusts `req.user.wallet` to be the
 * caller's wallet — if your auth doesn't set that field, adapt this file
 * (do not weaken your auth).
 */

import type { Express, Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import multer from 'multer';

import { loadNftonesConfig } from './config';
import { embed, detect, health } from './client';

const UPLOAD_LIMIT_MB = parseInt(process.env.NFTONES_UPLOAD_LIMIT_MB || '500', 10);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_LIMIT_MB * 1024 * 1024 },
});

interface AuthedRequest extends Request {
  user?: { wallet?: string; id?: string; isAdmin?: boolean };
}

function requireWallet(req: AuthedRequest, res: Response, next: NextFunction): void {
  const wallet = req.user?.wallet;
  if (!wallet) {
    res.status(401).json({ error: 'wallet required (auth middleware must set req.user.wallet)' });
    return;
  }
  next();
}

/**
 * Build the NFTones subrouter. Returns the router; caller mounts at the path
 * of its choice (default in $LVTN: `/api/nftones`).
 */
export function buildNftonesRouter(): Router {
  const router = Router();
  const cfg = loadNftonesConfig();

  // ── Health ────────────────────────────────────────────────────────────────
  router.get('/health', async (_req, res) => {
    if (!cfg.enabled) {
      res.status(503).json({ enabled: false, reason: 'NFTONES_ENABLED=false' });
      return;
    }
    const h = await health(cfg);
    const anyUp = h.audio || h.video || h.image || h.document;
    res.status(anyUp ? 200 : 503).json({ enabled: true, services: h });
  });

  // ── Embed ─────────────────────────────────────────────────────────────────
  // POST /api/nftones/embed
  //   multipart: file=<bytes>, release_id=<string>, [alpha=<float>]
  //   req.user.wallet drives wallet binding (set by $LVTN auth middleware)
  router.post(
    '/embed',
    requireWallet,
    upload.single('file'),
    async (req: AuthedRequest, res: Response) => {
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) {
        res.status(400).json({ error: 'file required (multipart field "file")' });
        return;
      }
      const releaseId = (req.body?.release_id ?? '').toString().trim();
      if (!releaseId) {
        res.status(400).json({ error: 'release_id required' });
        return;
      }
      const alphaStr = (req.body?.alpha ?? '').toString();
      const alpha = alphaStr ? parseFloat(alphaStr) : undefined;

      const result = await embed(cfg, {
        fileBytes: file.buffer,
        fileName: file.originalname || 'upload.bin',
        contentType: file.mimetype || 'application/octet-stream',
        releaseId,
        walletId: req.user!.wallet!,
        alpha,
      });

      if (!result.ok) {
        // Honest 503 if NFTones service for this media class isn't up yet.
        res.status(result.status).json({
          error: result.reason,
          not_yet_implemented: result.notYetImplemented,
        });
        return;
      }

      res
        .status(200)
        .setHeader('Content-Type', result.contentType)
        .setHeader('X-Wallet-Fingerprint', result.walletFingerprint)
        .setHeader('X-Release-Id', result.releaseId)
        .setHeader('X-Master-Sha256', result.masterSha256)
        .setHeader('X-Derivative-Sha256', result.derivativeSha256)
        .setHeader('X-Alpha', String(result.alpha))
        .setHeader('X-Media-Class', result.mediaClass)
        .setHeader(
          'Content-Disposition',
          `attachment; filename="${result.releaseId}-${result.walletFingerprint}.${guessExt(result.contentType)}"`,
        )
        .send(result.watermarkedBytes);
    },
  );

  // ── Detect ────────────────────────────────────────────────────────────────
  // POST /api/nftones/detect
  //   multipart: file=<bytes>, [release_id=<string>]
  //   admin or creator-of-release only (caller must enforce; mount admin guard upstream if needed)
  router.post(
    '/detect',
    upload.single('file'),
    async (req: AuthedRequest, res: Response) => {
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) {
        res.status(400).json({ error: 'file required (multipart field "file")' });
        return;
      }
      const releaseId = req.body?.release_id ? req.body.release_id.toString() : undefined;

      const result = await detect(cfg, {
        fileBytes: file.buffer,
        fileName: file.originalname || 'leak.bin',
        contentType: file.mimetype || 'application/octet-stream',
        releaseId,
      });

      if (!result.ok) {
        res.status(result.status).json({
          error: result.reason,
          not_yet_implemented: result.notYetImplemented,
        });
        return;
      }
      res.json({
        matched: result.matched,
        wallet_id: result.walletId,
        wallet_fingerprint: result.walletFingerprint,
        correlation: result.correlation,
        confidence: result.confidence,
        wallets_searched: result.walletsSearched,
        threshold: result.threshold,
      });
    },
  );

  return router;
}

/**
 * Convenience: mount the router at the canonical $LVTN path with one call.
 */
export function mountNftones(app: Express, path = '/api/nftones'): void {
  app.use(path, buildNftonesRouter());
  // eslint-disable-next-line no-console
  console.log(`[nftones] adapter mounted at ${path} (enabled=${process.env.NFTONES_ENABLED || 'false'})`);
}

function guessExt(contentType: string): string {
  const ct = contentType.toLowerCase().split(';')[0].trim();
  const map: Record<string, string> = {
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/mpeg': 'mp3',
    'audio/flac': 'flac',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'application/pdf': 'pdf',
    'application/epub+zip': 'epub',
  };
  return map[ct] || 'bin';
}
