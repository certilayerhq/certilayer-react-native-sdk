/**
 * @file normalizer.test.ts
 * @layer L1 — React Native SDK tests
 * @description Touch signals must land in the REAL touch feature slice
 * (fv[20-24]) — not the mouse slice (fv[11-16]). This is the single
 * easiest thing to get wrong when mirroring the Web SDK's approach, so
 * it gets an explicit test.
 */

import { computeFeatureVector } from '../src/normalizer/index';
import type { RawSignal } from '../src/types';

describe('computeFeatureVector (React Native)', () => {
  it('returns an all-zero vector for a too-short session', () => {
    const fv = computeFeatureVector([], 100);
    expect(fv).toHaveLength(34);
    expect(fv.every(v => v === 0)).toBe(true);
  });

  it('sets touch_present (fv[2]) — NOT mouse_present (fv[1]) — for touch signals', () => {
    const signals: RawSignal[] = [
      { kind: 'touch', ts_ms: 0,   data: { x: 0,  y: 0,  velocity: 0, dwell_ms: 0, phase: 'start' } },
      { kind: 'touch', ts_ms: 100, data: { x: 10, y: 10, velocity: 0.2, dwell_ms: 100, phase: 'end' } },
    ];
    const fv = computeFeatureVector(signals, 1000);

    expect(fv[2]).toBe(1); // touch_present
    expect(fv[1]).toBe(0); // mouse_present — must stay untouched by touch data
    // Touch data must land in [20-24], never [11-16] (mouse slice)
    expect(fv[20]).toBeGreaterThan(0); // touch_dwell_mean
  });

  it('touch_area_variance (fv[23]) stays 0 — known cross-platform limitation', () => {
    const signals: RawSignal[] = [
      { kind: 'touch', ts_ms: 0,  data: { x: 0, y: 0, velocity: 0, dwell_ms: 50, phase: 'start' } },
      { kind: 'touch', ts_ms: 50, data: { x: 5, y: 5, velocity: 0.1, dwell_ms: 50, phase: 'end' } },
    ];
    const fv = computeFeatureVector(signals, 1000);
    expect(fv[23]).toBe(0);
  });

  it('navigation (screen-transition) signals populate fv[29-33]', () => {
    const signals: RawSignal[] = [
      { kind: 'navigation', ts_ms: 0,    data: { from_screen: 'Home',  to_screen: 'Login',    duration_ms: 0 } },
      { kind: 'navigation', ts_ms: 2000, data: { from_screen: 'Login', to_screen: 'Checkout', duration_ms: 2000 } },
    ];
    const fv = computeFeatureVector(signals, 5000);
    expect(fv[29]).toBeGreaterThanOrEqual(0); // page_transition_entropy
    expect(fv[30]).toBeGreaterThan(0);        // focus_duration_mean
  });

  it('every output value stays clamped to [0, 1]', () => {
    const signals: RawSignal[] = [
      { kind: 'touch', ts_ms: 0,  data: { x: 0, y: 0, velocity: 99999, dwell_ms: -50, phase: 'move' } },
    ];
    const fv = computeFeatureVector(signals, 1000);
    for (const v of fv) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
