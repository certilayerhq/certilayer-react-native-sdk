/**
 * @file types.ts
 * @layer L1 — React Native SDK
 * @description Shared types. This SDK captures behaviorally directly in
 * JS (touch + screen transitions) and sends signals to the L2 Ingestion
 * Gateway — it no longer bridges to native Android/iOS modules.
 */

/** Configuration passed to CertiLayer.init(). Use your PUBLIC key. */
export interface CertiLayerConfig {
  apiKey: string
  /** L2 Ingestion Gateway endpoint. @default https://ingest.certilayer.net */
  endpoint?: string
  /** How often (ms) buffered signals are flushed. @default 5000 */
  flushIntervalMs?: number
  /** Max signals per batch. @default 50 */
  batchSize?: number
  debug?: boolean
}

/** A single captured behavioral signal. */
export interface RawSignal {
  kind: 'touch' | 'navigation'
  ts_ms: number
  data: Record<string, unknown>
}

/** Touch event signal — captured via PanResponder. */
export interface TouchSignal {
  x: number
  y: number
  velocity: number
  dwell_ms: number
  phase: 'start' | 'move' | 'end'
}

/** Screen transition signal — reported via CertiLayer.trackScreen(). */
export interface ScreenSignal {
  from_screen: string
  to_screen: string
  duration_ms: number
}

/** Batch sent to the L2 Ingestion Gateway (matches RawEventBatch on the Rust side). */
export interface EventBatch {
  session_id: string
  org_id: string
  sdk_type: 'mobile'
  captured_at: string
  signals: RawSignal[]
  features: number[]
}
