/**
 * @file index.ts
 * @layer L1 — React Native SDK
 * @description Public entry point for @certilayer/react-native.
 *
 * RESTRUCTURED: this SDK previously bridged to native Android/iOS modules
 * (CertiLayerModule.kt / .swift) for capture — those modules' status was
 * unverified, so this version captures behaviorally in pure JS/TS instead,
 * mirroring the Web SDK's architecture: it needs no native code and works
 * the moment you install the package.
 *
 * Usage:
 *   import CertiLayer, { CertiLayerRoot } from '@certilayer/react-native'
 *   CertiLayer.init({ apiKey: 'certilayer_live_pk_...' })
 *   // wrap your app root in <CertiLayerRoot> — see CertiLayerRoot.tsx
 *   // call CertiLayer.trackScreen(name) on navigation changes
 */

import { makeTouchHandlers } from './capture/touch'
import { initScreenTracking, trackScreen as _trackScreen, stopScreenTracking } from './capture/screen'
import { computeFeatureVector } from './normalizer/index'
import { EventBuffer } from './buffer/event_buffer'
import { sendBatch } from './transport/sender'
import { DEFAULT_ENDPOINT, DEFAULT_FLUSH_INTERVAL_MS, DEFAULT_BATCH_SIZE, API_KEY_PREFIX } from './config'
import type { CertiLayerConfig, RawSignal } from './types'

export type { CertiLayerConfig, RawSignal }
export { CertiLayerRoot } from './CertiLayerRoot'

let _config: Required<CertiLayerConfig> | null = null
let _sessionId = ''
let _buffer: EventBuffer | null = null
let _flushTimer: ReturnType<typeof setInterval> | null = null
let _running = false
let _sessionStartTs = 0

function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function emit(signal: RawSignal): void {
  if (!_buffer) return
  _buffer.push(signal)
}

async function flush(): Promise<void> {
  if (!_config || !_buffer || _buffer.isEmpty) return
  const signals = _buffer.drain(_config.batchSize)
  if (signals.length === 0) return

  const sessionDurationMs = _sessionStartTs > 0 ? Date.now() - _sessionStartTs : 0
  const features = computeFeatureVector(signals, sessionDurationMs)

  await sendBatch(_config.endpoint, _config.apiKey, {
    session_id: _sessionId,
    org_id: '', // resolved server-side from API key
    sdk_type: 'mobile',
    captured_at: new Date().toISOString(),
    signals,
    features,
  })
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
    debug: config.debug ?? false,
  }

  _sessionId = uuidv4()
  _sessionStartTs = Date.now()
  _buffer = new EventBuffer(_config.batchSize * 2)
  _running = true

  initScreenTracking(emit)

  _flushTimer = setInterval(() => { void flush() }, _config.flushIntervalMs)

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

/** Returns the current session ID — attach this to backend requests for verification. */
function getSessionId(): string {
  return _sessionId
}

/** Stop capture and flush any remaining buffered signals. Call on logout/unmount. */
async function stop(): Promise<void> {
  if (!_running) return
  _running = false

  if (_flushTimer !== null) {
    clearInterval(_flushTimer)
    _flushTimer = null
  }
  stopScreenTracking()
  await flush()
}

/** Internal — used by CertiLayerRoot to wire touch handlers to the emitter. */
export function getTouchHandlers() {
  return makeTouchHandlers(emit)
}

const CertiLayer = {
  init,
  trackScreen: trackScreenFn,
  getSessionId,
  stop,
}

export default CertiLayer
