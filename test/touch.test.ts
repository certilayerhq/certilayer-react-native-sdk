import { makeTouchHandlers } from '../src/capture/touch'

const ev = (touches: Array<{ identifier: string; pageX: number; pageY: number }>) =>
  ({ nativeEvent: { changedTouches: touches, touches } }) as any

describe('touch capture', () => {
  it('keeps independent state per finger', () => {
    const out: any[] = []
    const h = makeTouchHandlers((s) => out.push(s))

    h.onTouchStart(ev([{ identifier: '0', pageX: 0, pageY: 0 }]))
    h.onTouchStart(ev([{ identifier: '1', pageX: 100, pageY: 100 }]))
    h.onTouchMove(ev([{ identifier: '1', pageX: 110, pageY: 100 }]))
    h.onTouchEnd(ev([{ identifier: '0', pageX: 0, pageY: 0 }]))
    h.onTouchEnd(ev([{ identifier: '1', pageX: 110, pageY: 100 }]))

    expect(out.map((s) => s.data.phase)).toEqual(['start', 'start', 'move', 'end', 'end'])
    expect(out[2].data.x).toBe(110)
  })

  it('reports cancel as end and ignores unknown pointers', () => {
    const out: any[] = []
    const h = makeTouchHandlers((s) => out.push(s))

    h.onTouchMove(ev([{ identifier: '9', pageX: 1, pageY: 1 }])) // never started
    h.onTouchStart(ev([{ identifier: '0', pageX: 5, pageY: 5 }]))
    h.onTouchCancel(ev([{ identifier: '0', pageX: 5, pageY: 5 }]))
    h.onTouchEnd(ev([{ identifier: '0', pageX: 5, pageY: 5 }])) // already closed

    expect(out.map((s) => s.data.phase)).toEqual(['start', 'end'])
  })
})
