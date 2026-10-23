/**
 * @file capture/touch.ts
 * @layer L1 — React Native SDK
 * @description Touch capture via the root View's onTouch* props. These observe
 * touches without claiming the responder, so ScrollView / Pressable /
 * gesture-handler keep working.
 *
 * State is kept per pointer (identifier) inside the closure, so multi-touch
 * and multiple handler instances no longer overwrite each other.
 *
 * KNOWN LIMITATION: touch contact area / pressure is not exposed
 * cross-platform — touch_area_variance (fv[23]) stays 0.
 */

import type { GestureResponderEvent } from 'react-native'
import type { RawSignal, TouchSignal } from '../types'

type Emitter = (signal: RawSignal) => void

interface Track {
  startTs: number
  startX: number
  startY: number
}

const MAX_TRACKS = 10 // safety net if an end/cancel event is ever lost

export function makeTouchHandlers(emit: Emitter) {
  const tracks = new Map<string, Track>()
  const keyOf = (t: { identifier?: unknown }) => String(t.identifier ?? 0)

  const send = (ts: number, payload: TouchSignal) =>
    emit({ kind: 'touch', ts_ms: ts, data: payload as unknown as Record<string, unknown> })

  function finish(e: GestureResponderEvent) {
    const ts = Date.now()
    for (const t of e.nativeEvent.changedTouches) {
      const key = keyOf(t)
      const tr = tracks.get(key)
      if (!tr) continue
      send(ts, {
        x: t.pageX,
        y: t.pageY,
        velocity: 0,
        dwell_ms: ts - tr.startTs,
        phase: 'end',
      })
      tracks.delete(key)
    }
  }

  return {
    onTouchStart(e: GestureResponderEvent) {
      const ts = Date.now()
      if (tracks.size >= MAX_TRACKS) tracks.clear()
      for (const t of e.nativeEvent.changedTouches) {
        tracks.set(keyOf(t), { startTs: ts, startX: t.pageX, startY: t.pageY })
        send(ts, { x: t.pageX, y: t.pageY, velocity: 0, dwell_ms: 0, phase: 'start' })
      }
    },

    onTouchMove(e: GestureResponderEvent) {
      const ts = Date.now()
      for (const t of e.nativeEvent.changedTouches) {
        const tr = tracks.get(keyOf(t))
        if (!tr) continue
        const dt = ts - tr.startTs
        const dx = t.pageX - tr.startX
        const dy = t.pageY - tr.startY
        const distance = Math.sqrt(dx * dx + dy * dy)
        // NOTE: same semantics as before (mean speed since touch start) on purpose:
        // fv[21] was calibrated on it. Switching to instantaneous speed is a
        // data-contract change — verify against training data first.
        const velocity = dt > 0 ? distance / dt : 0
        send(ts, { x: t.pageX, y: t.pageY, velocity, dwell_ms: dt, phase: 'move' })
      }
    },

    onTouchEnd(e: GestureResponderEvent) {
      finish(e)
    },

    // The OS/native scroller can steal a touch: it still happened and had a
    // real duration, so it is reported as 'end' instead of being dropped.
    onTouchCancel(e: GestureResponderEvent) {
      finish(e)
    },
  }
}
