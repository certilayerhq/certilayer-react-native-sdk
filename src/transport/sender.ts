/**
 * @file transport/sender.ts
 * @layer L1 — React Native SDK
 * @description Sends event batches to the L2 Ingestion Gateway.
 * React Native has fetch() built in — no sendBeacon equivalent exists,
 * so there is no unload-flush path (RN apps don't have a page-unload
 * event; flush on app background/foreground instead if needed).
 */

import type { EventBatch } from '../types'

export interface SendResult {
  ok: boolean
  status?: number
}

export async function sendBatch(
  endpoint: string,
  apiKey: string,
  batch: EventBatch,
): Promise<SendResult> {
  try {
    const response = await fetch(`${endpoint}/v1/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // The L2 Ingestion Gateway authenticates via X-API-Key, NOT
        // Authorization: Bearer (that's used by the L8 API for
        // GET /v1/session/:id, a different service). Confirmed via
        // live testing: Bearer -> 401 "Missing X-API-Key header".
        'X-API-Key':    apiKey,
      },
      body: JSON.stringify(batch),
    })
    return { ok: response.ok, status: response.status }
  } catch {
    return { ok: false }
  }
}
