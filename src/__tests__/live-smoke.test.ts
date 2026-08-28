/**
 * @file src/__tests__/live-smoke.test.ts
 * @layer L1 — React Native SDK
 * @description Live smoke test — fires a REAL request at a REAL local
 * ingestion gateway (no mocked fetch/network). Exercises the actual
 * capture -> buffer -> normalizer -> sender pipeline end to end.
 *
 * `CertiLayerRoot.tsx` (re-exported from `../index`) imports `react` and
 * `react-native` for JSX, which don't run in a plain Node/Jest
 * environment. Since this test never renders a component — it drives
 * `CertiLayer.init/trackScreen/getTouchHandlers/stop` directly — that
 * module is mocked out entirely rather than pulling in real
 * react/react-native. `react-native` is also virtually mocked as a
 * belt-and-suspenders guard, in case `touch.ts`'s type-only
 * `GestureResponderEvent` import is ever NOT elided by a future
 * tsconfig change.
 *
 * Run:
 *   CERTILAYER_TEST_API_KEY=certilayer_live_pk_... \
 *     npx jest live-smoke --testTimeout=15000 --verbose
 *
 * Optional:
 *   CERTILAYER_TEST_ENDPOINT=http://127.0.0.1:3001 (default)
 *
 * IMPORTANT: use a PUBLIC key (certilayer_live_pk_...), never a secret
 * key — this SDK ships inside a mobile app bundle.
 */

jest.mock('../CertiLayerRoot', () => ({
  CertiLayerRoot: () => null,
}))

jest.mock(
  'react-native',
  () => ({
    View: 'View',
    StyleSheet: { absoluteFill: {}, create: (s: unknown) => s },
  }),
  { virtual: true },
)

jest.mock(
  'react',
  () => {
    const createElement = (...args: unknown[]) => ({ type: args[0], props: args[1] })
    return { __esModule: true, default: { createElement }, createElement }
  },
  { virtual: true },
)

import CertiLayer, { getTouchHandlers } from '../index'

const API_KEY = process.env.CERTILAYER_TEST_API_KEY
const ENDPOINT = process.env.CERTILAYER_TEST_ENDPOINT || 'http://127.0.0.1:3001'

if (API_KEY && !API_KEY.startsWith('certilayer_live_pk_')) {
  throw new Error(
    `[live-smoke] Refusing to run with a non-public key. Got a key starting with ` +
    `"${API_KEY.slice(0, 20)}...". This SDK is client-side (mobile) code — only ` +
    `certilayer_live_pk_... (public) keys belong here. Use the public key from ` +
    `the dashboard's API Keys page, not the secret key.`
  )
}

const describeOrSkip = API_KEY ? describe : describe.skip

describeOrSkip('React Native SDK — live smoke test', () => {
  it('captures touch + navigation signals and flushes a real batch to the gateway', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch')

    CertiLayer.init({
      apiKey: API_KEY as string,
      endpoint: ENDPOINT,
      // Large interval so the internal setInterval timer never fires —
      // we trigger the only flush ourselves via stop(), for a
      // deterministic single request.
      flushIntervalMs: 60_000,
      batchSize: 50,
      debug: true,
    })

    const sessionId = CertiLayer.getSessionId()
    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/i)

    // --- Simulate a touch gesture (start -> move x3 -> end) ---
    const handlers = getTouchHandlers()
    const touchEvent = (pageX: number, pageY: number): any => ({
      nativeEvent: {
        touches: [{ pageX, pageY }],
        changedTouches: [{ pageX, pageY }],
      },
    })

    handlers.onTouchStart(touchEvent(10, 20))
    await sleep(15)
    handlers.onTouchMove(touchEvent(40, 55))
    await sleep(15)
    handlers.onTouchMove(touchEvent(70, 90))
    await sleep(15)
    handlers.onTouchMove(touchEvent(95, 130))
    await sleep(15)
    handlers.onTouchEnd(touchEvent(100, 140))

    // --- Simulate screen navigation (2 transitions -> 2 nav signals) ---
    CertiLayer.trackScreen('Home')
    await sleep(10)
    CertiLayer.trackScreen('Profile')

    // normalizer/index.ts short-circuits to an all-zero feature vector
    // when sessionDurationMs < MIN_SESSION_DURATION_MS (500ms) — pad out
    // the session so the real normalizer logic actually runs instead of
    // hitting that early-return guard.
    await sleep(450)

    // --- Flush: stop() awaits the real fetch to the local gateway ---
    await CertiLayer.stop()

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit]

    expect(url).toBe(`${ENDPOINT}/v1/ingest`)
    expect(options.method).toBe('POST')
    const headers = options.headers as Record<string, string>
    expect(headers['X-API-Key']).toBe(API_KEY)
    // Regression guard for the Bearer-vs-X-API-Key auth bug fixed in
    // sender.ts — this SDK must never send an Authorization header.
    expect(headers['Authorization']).toBeUndefined()

    const body = JSON.parse(options.body as string)
    expect(body.sdk_type).toBe('mobile')
    expect(body.session_id).toBe(sessionId)
    expect(Array.isArray(body.signals)).toBe(true)
    expect(body.signals.length).toBeGreaterThan(0)

    // Real output of normalizer/index.ts — 34-dim canonical schema.
    expect(Array.isArray(body.features)).toBe(true)
    expect(body.features).toHaveLength(34)
    expect(body.features[2]).toBe(1) // touch_present flag
    for (const v of body.features) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }

    // The actual live network result — this is what makes it a SMOKE
    // test rather than a pure unit test. A 401 here means the gateway
    // rejected the key (revoked/wrong type); anything >=500 means the
    // gateway itself errored.
    const response = await fetchSpy.mock.results[0].value
    if (!response.ok) {
      const errorBody = await response.clone().text().catch(() => '<unreadable body>')
      throw new Error(
        `[live-smoke] Gateway rejected the batch — status ${response.status}. ` +
        `Body: ${errorBody}. Check: is the gateway running on ${ENDPOINT}? ` +
        `Is the public key valid/not revoked?`
      )
    }
    expect(response.status).toBeGreaterThanOrEqual(200)
    expect(response.status).toBeLessThan(300)

    fetchSpy.mockRestore()
  }, 15000)
})

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
