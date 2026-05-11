/**
 * NFTones → $LVTN webhook receiver.
 *
 * NFTones emits events when state changes (release.created, watermark.assigned,
 * audio.rendered, leak.scan.completed, compute.metered, lvtn.flow.recorded).
 * This handler translates those events into the $LVTN platform's internal
 * event bus / DB updates / notification queues.
 *
 * Mount alongside the router:
 *   app.post('/api/nftones/webhook', nftonesWebhookHandler);
 *
 * Security: NFTones signs each webhook with HMAC-SHA256 over the raw body
 * using the shared `NFTONES_WEBHOOK_SECRET`. Reject requests whose signature
 * doesn't match — that's how we prevent a malicious caller from forging
 * platform events.
 */

import crypto from 'crypto';
import type { Request, Response } from 'express';

const SECRET = process.env.NFTONES_WEBHOOK_SECRET || '';

export interface NftonesEvent {
  event:
    | 'release.created'
    | 'access.granted'
    | 'watermark.assigned'
    | 'audio.rendered'
    | 'leak.scan.started'
    | 'leak.scan.completed'
    | 'compute.metered'
    | 'lvtn.flow.recorded';
  timestamp: string; // ISO-8601 UTC
  id: string; // event UUID for idempotency
  payload: Record<string, unknown>;
}

/**
 * Express handler. Use `express.raw({ type: 'application/json' })` middleware
 * for THIS route so we have the raw body to verify the HMAC signature against.
 *
 * Example:
 *   app.post('/api/nftones/webhook',
 *     express.raw({ type: 'application/json' }),
 *     nftonesWebhookHandler);
 */
export async function nftonesWebhookHandler(req: Request, res: Response): Promise<void> {
  if (!SECRET) {
    res.status(503).json({ error: 'NFTONES_WEBHOOK_SECRET not configured' });
    return;
  }

  const signature = req.header('X-NFTones-Signature') || '';
  const raw = (req.body instanceof Buffer ? req.body : Buffer.from(JSON.stringify(req.body))) as Buffer;

  const expected = crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
  // Constant-time compare to prevent timing leaks.
  let ok = signature.length === expected.length;
  if (ok) {
    try {
      ok = crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expected, 'utf8'));
    } catch {
      ok = false;
    }
  }
  if (!ok) {
    res.status(401).json({ error: 'invalid signature' });
    return;
  }

  let event: NftonesEvent;
  try {
    event = JSON.parse(raw.toString('utf8')) as NftonesEvent;
  } catch {
    res.status(400).json({ error: 'invalid JSON' });
    return;
  }

  if (!event.event || !event.id || !event.timestamp) {
    res.status(400).json({ error: 'event must have id, event, timestamp' });
    return;
  }

  // The $LVTN platform's event bus / handlers wire in here. The reference
  // implementation just logs and acks; replace the body with your real
  // platform handlers (DB writes, notifications, $KTRS metering, $LVTN flow).
  await handleNftonesEvent(event);

  res.status(200).json({ ok: true, id: event.id });
}

/**
 * Replace this body with real $LVTN platform handlers when integrating.
 *
 * Suggested mappings:
 *   - release.created       → insert into $LVTN releases table
 *   - access.granted        → insert into $LVTN access_grants
 *   - watermark.assigned    → update buyer's purchase row
 *   - audio.rendered        → publish to delivery queue
 *   - leak.scan.completed   → notify creator + admin
 *   - compute.metered       → debit $KTRS via existing metering hook
 *   - lvtn.flow.recorded    → credit treasury / staking / liquidity per allocation
 */
async function handleNftonesEvent(event: NftonesEvent): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`[nftones-webhook] ${event.event} id=${event.id} payload-keys=${Object.keys(event.payload).join(',')}`);
  // TODO ($LVTN integration): route to internal event bus.
}
