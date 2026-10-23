/**
 * @file buffer/event_buffer.ts
 * @layer L1 — React Native SDK
 * @description Ring buffer for captured signals — identical logic to
 * the Web SDK's EventBuffer.
 */

import type { RawSignal } from '../types'
import { DEFAULT_BATCH_SIZE } from '../config'

const MAX_BUFFER_SIZE = DEFAULT_BATCH_SIZE * 2

export class EventBuffer {
  private buffer: RawSignal[] = []
  private readonly maxSize: number
  private _dropped = 0

  constructor(maxSize = MAX_BUFFER_SIZE) {
    this.maxSize = maxSize
  }

  push(signal: RawSignal): void {
    if (this.buffer.length >= this.maxSize) {
      this.buffer.shift()
      this._dropped += 1
    }
    this.buffer.push(signal)
  }

  drain(count: number = DEFAULT_BATCH_SIZE): RawSignal[] {
    return this.buffer.splice(0, count)
  }

  get size(): number { return this.buffer.length }
  /** Signals discarded because the buffer was full. */
  get dropped(): number { return this._dropped }
  get isEmpty(): boolean { return this.buffer.length === 0 }
  clear(): void { this.buffer = [] }
}
