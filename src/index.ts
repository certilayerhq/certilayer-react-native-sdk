/**
 * @file index.ts
 * @layer L1 — React Native SDK
 * @description Public entry point for @certilayer/react-native.
 * Pure JS/TS behavioral capture (no native modules).
 *
 * Usage:
 *   import CertiLayer, { CertiLayerRoot } from '@certilayer/react-native'
 *   CertiLayer.init({ apiKey: 'certilayer_live_pk_...' })
 *   // wrap your app root in <CertiLayerRoot>
 *   // call CertiLayer.trackScreen(name) on navigation changes
 */

import { AppState } from 'react-native'
import type { AppStateStatus } from 'react-native'
import { makeTouchHandlers } from './capture/touch'
import { initScreenTracking, trackScreen as _trackScreen, stopScreenTracking } from './capture/screen'
import { computeFeatureVector } from './normalizer/index'
import { EventBuffer } from './buffer/event_buffer'
import { sendBatch } from './transport/sender'
import { DEFAULT_ENDPOINT, DEFAULT_FLUSH_INTERVAL_MS, DEFAULT_BATCH_SIZE, API_KEY_PREFIX } from './config'
import type { CertiLayerConfig, RawSignal, EventBatch } from './types'

export type { CertiLayerConfig, RawSignal }
export { CertiLayerRoot } from './CertiLayerRoot'

// ── Delivery policy ──────────────────────────────────────────────────────────
const MAX_ATTEMPTS = 6
const BASE_DELAY_MS = 1_000
const MAX_DELAY_MS = 60_000
const MAX_FORCE_ROUNDS = 10 // batches sent in one forced flush (stop / background)
const MIN_FLUSH_INTERVAL_MS = 2_000 // size-triggered sends: at most one per 2s
const BUFFER_CAPACITY_FACTOR = 6    // buffer holds batchSize x 6 signals

interface PendingBatch {
  payload: EventBatch // built once, resent byte-identical on retry
  id: string          // sent as Idempotency-Key
  attempts: number
}

let _config: Required<CertiLayerConfig> | null = null
let _sessionId = ''
let _buffer: EventBuffer | null = null
let _flushTimer: ReturnType<typeof setInterval> | null = null
let _appStateSub: { remove(): void } | null = null
let _running = false
let _sessionStartTs = 0

let _pending: PendingBatch | null = null // kept until the server confirms
let _retryAt = 0
let _lastSendAt = 0
let _flushing: Promise<void> | null = null // single-flight guard
let _touchHandlers: ReturnType<typeof makeTouchHandlers> | null = null

function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function emit(signal: RawSignal): void {
  if (!_running || !_buffer) return
  _buffer.push(signal)
  flushIfFull()
}

/** Send as soon as a full batch is buffered; rate-limited and backoff-aware. */
function flushIfFull(): void {
  const cfg = _config
  if (!cfg || !_buffer || _flushing) return
  if (_buffer.size < cfg.batchSize) return
  const now = Date.now()
  if (now < _retryAt || now - _lastSendAt < cfg.minFlushIntervalMs) return
  void flush()
}

function backoffMs(attempt: number): number {
  const exp = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (attempt - 1))
  return exp / 2 + Math.random() * (exp / 2) // jitter
}

function buildBatch(signals: RawSignal[]): EventBatch {
  const sessionDurationMs = _sessionStartTs > 0 ? Date.now() - _sessionStartTs : 0
  return {
    session_id: _sessionId,
    org_id: '', // resolved server-side from API key
    sdk_type: 'mobile',
    captured_at: new Date().toISOString(),
    signals,
    features: computeFeatureVector(signals, sessionDurationMs),
  }
}

async function doFlush(force: boolean): Promise<void> {
  const cfg = _config
  if (!cfg) return
  const rounds = force ? MAX_FORCE_ROUNDS : 1

  for (let i = 0; i < rounds; i++) {
    if (!_pending) {
      if (!_buffer || _buffer.isEmpty) return
      const signals = _buffer.drain(cfg.batchSize)
      if (signals.length === 0) return
      if (cfg.debug && _buffer.dropped > 0) {
        console.warn(`[CertiLayer] ${_buffer.dropped} signals dropped so far (buffer full)`)
      }
      _pending = { payload: buildBatch(signals), id: uuidv4(), attempts: 0 }
    }
    if (!force && Date.now() < _retryAt) return

    const pending = _pending
    _lastSendAt = Date.now()
    const res = await sendBatch(cfg.endpoint, cfg.apiKey, pending.payload, pending.id)

    if (res.ok) {
      _pending = null
      _retryAt = 0
      continue
    }

    if (res.retryable) {
      pending.attempts += 1
      if (pending.attempts >= MAX_ATTEMPTS) {
        if (cfg.debug) console.warn('[CertiLayer] dropping batch after max retries')
        _pending = null
        _retryAt = 0
      } else {
        _retryAt = Date.now() + (res.retryAfterMs !== undefined
          ? res.retryAfterMs * (1 + Math.random() * 0.2)
          : backoffMs(pending.attempts))
      }
    } else {
      if (cfg.debug) console.warn('[CertiLayer] batch rejected, not retrying', res.status)
      _pending = null
      _retryAt = 0
    }
    return
  }
}

/** Single-flight: concurrent callers share the in-progress flush. */
function flush(force = false): Promise<void> {
  if (_flushing) return _flushing
  _flushing = doFlush(force).finally(() => {
    _flushing = null
  })
  return _flushing
}

function onAppStateChange(state: AppStateStatus): void {
  // The OS may suspend us right after this, so try to send what we have now.
  if (state === 'background' || state === 'inactive') void flush(true)
}

/** Initialize the SDK. Call once at app startup with your PUBLIC key. */
function init(config: CertiLayerConfig): void {
  if (_running) {
    console.warn('[CertiLayer] init() called more than once — ignoring.')
    return
  }
  if (!config.apiKey.startsWith(API_KEY_PREFIX)) {
    console.warn(`[CertiLayer] API key should start with "${API_KEY_PREFIX}"`)
  }

  _config = {
    apiKey: config.apiKey,
    endpoint: config.endpoint ?? DEFAULT_ENDPOINT,
    flushIntervalMs: config.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS,
    batchSize: config.batchSize ?? DEFAULT_BATCH_SIZE,
    minFlushIntervalMs: config.minFlushIntervalMs ?? MIN_FLUSH_INTERVAL_MS,
    maxBufferSize: config.maxBufferSize
      ?? (config.batchSize ?? DEFAULT_BATCH_SIZE) * BUFFER_CAPACITY_FACTOR,
    debug: config.debug ?? false,
  }

  _sessionId = uuidv4()
  _sessionStartTs = Date.now()
  _buffer = new EventBuffer(_config.maxBufferSize)
  _retryAt = 0
  _running = true

  initScreenTracking(emit)

  _flushTimer = setInterval(() => { void flush() }, _config.flushIntervalMs)
  _appStateSub = AppState.addEventListener('change', onAppStateChange)

  if (_config.debug) {
    console.log('[CertiLayer] Initialized', { sessionId: _sessionId, endpoint: _config.endpoint })
  }
}

/** Report a screen transition — call from your navigation library's state-change callback. */
function trackScreenFn(screenName: string): void {
  if (!_running) {
    console.warn('[CertiLayer] trackScreen() called before init()')
    return
  }
  _trackScreen(screenName)
}

/** Returns the current session ID, or '' when no session is running. */
function getSessionId(): string {
  return _running ? _sessionId : ''
}

/** Stop capture and flush remaining signals. Call on logout/unmount. init() can be called again afterwards. */
async function stop(): Promise<void> {
  if (!_running) return
  _running = false // emit() stops accepting signals

  if (_flushTimer !== null) {
    clearInterval(_flushTimer)
    _flushTimer = null
  }
  if (_appStateSub) {
    _appStateSub.remove()
    _appStateSub = null
  }
  stopScreenTracking()

  if (_flushing) await _flushing
  await flush(true)
}

/** Internal — used by CertiLayerRoot. Same instance for the app's lifetime. */
export function getTouchHandlers() {
  if (!_touchHandlers) _touchHandlers = makeTouchHandlers(emit)
  return _touchHandlers
}

const CertiLayer = {
  init,
  trackScreen: trackScreenFn,
  getSessionId,
  stop,
}

export default CertiLayer
