/**
 * @file normalizer/index.ts
 * @layer L1 — React Native SDK
 * @description Converts captured touch + screen signals into the
 * canonical 34-dim feature vector. Mirrors the Web SDK's normalizer —
 * touch signals populate fv[20-24] (the real touch slice), NOT
 * fv[11-16] (mouse) — those two modalities are kept separate throughout
 * the schema. Keyboard [4-10], mouse [11-16], scroll [17-19], and
 * motion [25-28] stay at 0 in this version (see README for scope).
 */

import type { RawSignal, TouchSignal, ScreenSignal } from '../types'

const FEATURE_DIM = 34
const MIN_SESSION_DURATION_MS = 500
const EPS = 1e-9

export function computeFeatureVector(
  signals: RawSignal[],
  sessionDurationMs: number,
): number[] {
  const fv = new Array<number>(FEATURE_DIM).fill(0)

  if (sessionDurationMs < MIN_SESSION_DURATION_MS || signals.length === 0) {
    return fv
  }

  const touch = signals.filter(s => s.kind === 'touch')
  const nav   = signals.filter(s => s.kind === 'navigation')

  // ── [0-3] Presence flags ──────────────────────────────────────────────────
  fv[2] = touch.length > 0 ? 1 : 0 // touch_present

  // ── [20-24] Touch features ────────────────────────────────────────────────
  if (touch.length > 0) extractTouchFeatures(touch, fv)

  // ── [29-33] Navigation features ───────────────────────────────────────────
  if (nav.length > 0) extractNavigationFeatures(nav, sessionDurationMs, fv)

  for (let i = 0; i < FEATURE_DIM; i++) fv[i] = clamp01(fv[i])
  return fv
}

/**
 * Extract 5 touch features.
 *   fv[20] touch_dwell_mean       — mean touch-down duration
 *   fv[21] swipe_velocity_mean    — mean movement velocity during touch
 *   fv[22] swipe_angle_variance   — variance of swipe direction
 *   fv[23] touch_area_variance    — NOT AVAILABLE cross-platform, stays 0
 *   fv[24] touch_count_rate       — distinct touches per second
 */
function extractTouchFeatures(touch: RawSignal[], fv: number[]): void {
  const ends = touch.filter(s => (s.data as unknown as TouchSignal).phase === 'end')
  const moves = touch.filter(s => (s.data as unknown as TouchSignal).phase === 'move')
  const starts = touch.filter(s => (s.data as unknown as TouchSignal).phase === 'start')

  if (ends.length > 0) {
    const dwells = ends.map(s => (s.data as unknown as TouchSignal).dwell_ms).filter(d => d > 0 && d < 5000)
    if (dwells.length > 0) {
      const { mean } = meanStd(dwells)
      fv[20] = normalise(mean, 0, 1000)
    }
  }

  if (moves.length > 0) {
    const velocities = moves.map(s => (s.data as unknown as TouchSignal).velocity).filter(v => v >= 0 && v < 10)
    if (velocities.length > 0) {
      const { mean } = meanStd(velocities)
      fv[21] = normalise(mean, 0, 3)
    }
  }

  // Swipe angle variance — angle between consecutive move points
  if (moves.length >= 3) {
    const angles: number[] = []
    for (let i = 1; i < moves.length - 1; i++) {
      const p0 = moves[i - 1].data as unknown as TouchSignal
      const p1 = moves[i].data as unknown as TouchSignal
      const p2 = moves[i + 1].data as unknown as TouchSignal
      const dx1 = p1.x - p0.x, dy1 = p1.y - p0.y
      const dx2 = p2.x - p1.x, dy2 = p2.y - p1.y
      angles.push(Math.abs(Math.atan2(dx1 * dy2 - dy1 * dx2, dx1 * dx2 + dy1 * dy2)))
    }
    const { std } = meanStd(angles)
    fv[22] = clamp01(std / Math.PI)
  }

  // fv[23] touch_area_variance — intentionally left 0, see file header

  if (starts.length > 0) {
    const first = touch[0].ts_ms
    const last = touch[touch.length - 1].ts_ms
    const durationSec = (last - first) / 1000 + EPS
    fv[24] = normalise(starts.length / durationSec, 0, 5)
  }
}

/**
 * Extract 5 navigation features — same semantics as the Web SDK.
 */
function extractNavigationFeatures(nav: RawSignal[], _sessionDurationMs: number, fv: number[]): void {
  const pathCounts = new Map<string, number>()
  for (const e of nav) {
    const to = (e.data as unknown as ScreenSignal).to_screen ?? ''
    pathCounts.set(to, (pathCounts.get(to) ?? 0) + 1)
  }
  const total = nav.length + EPS
  let entropy = 0
  for (const count of pathCounts.values()) {
    const p = count / total
    entropy -= p * Math.log2(p + EPS)
  }
  const maxEntropy = Math.log2(pathCounts.size + 1)
  fv[29] = maxEntropy > 0 ? clamp01(entropy / maxEntropy) : 0

  const durations = nav.map(s => (s.data as unknown as ScreenSignal).duration_ms).filter(d => d > 0 && d < 300_000)
  if (durations.length > 0) {
    const { mean } = meanStd(durations)
    fv[30] = normalise(mean, 0, 60_000)
  }

  // fv[31] window_switch_rate — no cross-platform visibilitychange equivalent, stays 0

  if (nav.length >= 2) {
    const firstNav = nav[0].ts_ms
    const secondEvent = nav[1]?.ts_ms ?? firstNav
    fv[32] = normalise(Math.max(0, secondEvent - firstNav), 0, 10_000)
  }

  if (nav.length >= 3) {
    const gaps: number[] = []
    for (let i = 1; i < nav.length; i++) gaps.push(nav[i].ts_ms - nav[i - 1].ts_ms)
    const { mean, std } = meanStd(gaps)
    const cv = mean > 0 ? std / mean : 0
    fv[33] = clamp01(1 - normalise(cv, 0, 3))
  }
}

function meanStd(values: number[]): { mean: number; std: number } {
  if (values.length === 0) return { mean: 0, std: 0 }
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
  return { mean, std: Math.sqrt(variance) }
}

function normalise(value: number, min: number, max: number): number {
  if (max <= min) return 0
  return clamp01((value - min) / (max - min))
}

function clamp01(v: number): number {
  if (!isFinite(v) || isNaN(v)) return 0
  return Math.max(0, Math.min(1, v))
}
