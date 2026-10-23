/**
 * @file capture/screen.ts
 * @layer L1 — React Native SDK
 * @description Screen-transition tracking. React Native has no universal
 * navigation hook — the app must call trackScreen() explicitly, typically
 * from its navigation library's onStateChange callback.
 */

import type { RawSignal, ScreenSignal } from '../types'

type Emitter = (signal: RawSignal) => void

let currentScreen = ''
let screenEntryTs = 0
let emitter: Emitter | null = null

export function initScreenTracking(emit: Emitter, initialScreen = 'unknown'): void {
  emitter = emit
  currentScreen = initialScreen
  screenEntryTs = Date.now()
}

/**
 * Report a screen transition. Call this from your navigation library's
 * state-change callback (e.g. React Navigation's onStateChange).
 * Empty names and repeats of the current screen are ignored.
 *
 * With nested navigators, resolve the leaf route first:
 *   const getLeaf = (s: any): string | undefined =>
 *     s?.routes?.[s.index ?? 0]?.state ? getLeaf(s.routes[s.index ?? 0].state)
 *                                      : s?.routes?.[s.index ?? 0]?.name
 */
export function trackScreen(screenName: string): void {
  if (!emitter) return
  if (!screenName || typeof screenName !== 'string') return
  if (screenName === currentScreen) return

  const ts = Date.now()
  const duration_ms = screenEntryTs > 0 ? ts - screenEntryTs : 0

  const payload: ScreenSignal = {
    from_screen: currentScreen,
    to_screen: screenName,
    duration_ms,
  }
  emitter({ kind: 'navigation', ts_ms: ts, data: payload as unknown as Record<string, unknown> })

  currentScreen = screenName
  screenEntryTs = ts
}

export function stopScreenTracking(): void {
  emitter = null
  currentScreen = ''
  screenEntryTs = 0
}
