/**
 * @file capture/touch.ts
 * @layer L1 — React Native SDK
 * @description Touch capture via PanResponder — this is the RN analogue
 * of the Web SDK's mouse capture, but signals are tagged 'touch' and
 * feed the REAL touch feature slice (fv[20-24]), not the mouse slice.
 *
 * KNOWN LIMITATION: PanResponder does not expose touch contact area or
 * pressure cross-platform (iOS has `force` on individual touches, Android
 * generally does not) — touch_area_variance (fv[23]) is left at 0 in this
 * version rather than approximated from an incomplete/asymmetric signal.
 */

import { GestureResponderEvent } from 'react-native'
import type { RawSignal, TouchSignal } from '../types'

type Emitter = (signal: RawSignal) => void

let touchStartTs = 0
let touchStartX = 0
let touchStartY = 0

/**
 * Standalone touch listeners for apps that can't wrap with PanResponder
 * (e.g. need to preserve exact existing gesture handling). Attach to
 * the root View's onTouchStart/onTouchMove/onTouchEnd props directly.
 */
export function makeTouchHandlers(emit: Emitter) {
  return {
    onTouchStart(e: GestureResponderEvent) {
      const t = e.nativeEvent.touches[0]
      if (!t) return
      touchStartTs = Date.now()
      touchStartX = t.pageX
      touchStartY = t.pageY

      const payload: TouchSignal = {
        x: t.pageX, y: t.pageY, velocity: 0, dwell_ms: 0, phase: 'start',
      }
      emit({ kind: 'touch', ts_ms: touchStartTs, data: payload as unknown as Record<string, unknown> })
    },

    onTouchMove(e: GestureResponderEvent) {
      const t = e.nativeEvent.touches[0]
      if (!t || touchStartTs === 0) return
      const ts = Date.now()
      const dt = ts - touchStartTs
      const dx = t.pageX - touchStartX
      const dy = t.pageY - touchStartY
      const distance = Math.sqrt(dx * dx + dy * dy)
      const velocity = dt > 0 ? distance / dt : 0

      const payload: TouchSignal = {
        x: t.pageX, y: t.pageY, velocity, dwell_ms: dt, phase: 'move',
      }
      emit({ kind: 'touch', ts_ms: ts, data: payload as unknown as Record<string, unknown> })
    },

    onTouchEnd(e: GestureResponderEvent) {
      if (touchStartTs === 0) return
      const ts = Date.now()
      const dwell = ts - touchStartTs
      const t = e.nativeEvent.changedTouches[0]

      const payload: TouchSignal = {
        x: t?.pageX ?? touchStartX,
        y: t?.pageY ?? touchStartY,
        velocity: 0,
        dwell_ms: dwell,
        phase: 'end',
      }
      emit({ kind: 'touch', ts_ms: ts, data: payload as unknown as Record<string, unknown> })
      touchStartTs = 0
    },
  }
}
