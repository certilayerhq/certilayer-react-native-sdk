/**
 * @file transport/sender.ts
 * @layer L1 — React Native SDK
 * @description Sends event batches to the L2 Ingestion Gateway.
 * Classifies failures so the caller knows whether a retry makes sense.
 */

import type { EventBatch } from '../types'

export interface SendResult {
  ok: boolean
  status?: number
  /** true for network errors, timeouts, 429 and 5xx */
  retryable: boolean
  /** parsed Retry-After (capped), when the server sent one */
  retryAfterMs?: number
}

const DEFAULT_TIMEOUT_MS = 10_000
const MAX_RETRY_AFTER_MS = 60_000

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined
  const secs = Number(value)
  if (!Number.isNaN(secs)) return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, secs * 1000))
  const date = Date.parse(value)
  if (Number.isNaN(date)) return undefined
  return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, date - Date.now()))
}

export async function sendBatch(
  endpoint: string,
  apiKey: string,
  batch: EventBatch,
  idempotencyKey?: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<SendResult> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      // The L2 Ingestion Gateway authenticates via X-API-Key, NOT Authorization: Bearer.
      'X-API-Key': apiKey,
    }
    // Header (not body field) so a strict gateway schema is unaffected.
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey

    const response = await fetch(`${endpoint}/v1/ingest`, {
      method: 'POST',
      headers,
      body: JSON.stringify(batch),
      signal: ctrl.signal,
    })

    if (response.ok) return { ok: true, status: response.status, retryable: false }
    if (response.status === 429) {
      return {
        ok: false,
        status: 429,
        retryable: true,
        retryAfterMs: parseRetryAfter(response.headers.get('Retry-After')),
      }
    }
    if (response.status >= 500) return { ok: false, status: response.status, retryable: true }
    // Other 4xx: the batch itself is rejected, retrying will not help.
    return { ok: false, status: response.status, retryable: false }
  } catch {
    return { ok: false, retryable: true } // network error or timeout
  } finally {
    clearTimeout(timer)
  }
}
