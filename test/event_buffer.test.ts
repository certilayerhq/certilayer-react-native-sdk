/**
 * @file event_buffer.test.ts
 * @layer L1 — React Native SDK tests
 */

import { EventBuffer } from '../src/buffer/event_buffer';
import type { RawSignal } from '../src/types';

function sig(i: number): RawSignal {
  return { kind: 'touch', ts_ms: i, data: {} };
}

describe('EventBuffer (React Native)', () => {
  it('drops oldest once maxSize is reached', () => {
    const buf = new EventBuffer(2);
    buf.push(sig(1));
    buf.push(sig(2));
    buf.push(sig(3));

    const drained = buf.drain(10);
    expect(drained.map(s => s.ts_ms)).toEqual([2, 3]);
  });

  it('drain empties what it takes, leaves the rest', () => {
    const buf = new EventBuffer(10);
    for (let i = 0; i < 5; i++) buf.push(sig(i));
    expect(buf.drain(3)).toHaveLength(3);
    expect(buf.size).toBe(2);
  });
});

describe('EventBuffer dropped counter', () => {
  it('counts signals discarded when full', () => {
    const buf = new EventBuffer(2);
    for (let i = 0; i < 5; i++) buf.push(sig(i));
    expect(buf.dropped).toBe(3);
    expect(buf.size).toBe(2);
  });
});
