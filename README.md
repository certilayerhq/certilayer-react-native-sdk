# @certilayer/react-native

**Passive behavioral biometrics for React Native — pure JS/TS, no native modules required.**

CertiLayer's React Native SDK captures touch behavior and screen
transitions, then streams a behavioral feature vector to your CertiLayer
account so you can verify real human sessions on mobile — no CAPTCHA, no
device fingerprinting, and no typed content.

[![npm version](https://img.shields.io/npm/v/@certilayer/react-native.svg)](https://www.npmjs.com/package/@certilayer/react-native)

---

## Pure JS/TS — no native setup

This SDK captures entirely in JavaScript, through touch props on a wrapper
view and your navigation callbacks — it does **not** bridge to native
Android/iOS modules. That means:

- No `pod install`, no native linking, no Gradle changes.
- Works the moment you install the package.
- The only structural change required is wrapping your app root in
  `<CertiLayerRoot>` (see below) — React Native has no document-level
  touch listener equivalent, so this is how the SDK observes touches
  across your whole app. The wrapper observes touches passively and does
  not claim the touch responder.

---

## Installation

```bash
npm install @certilayer/react-native
```

Requirements:

- `react` >= 17 and `react-native` >= 0.65 (peer dependencies — the SDK uses
  whatever versions are already in your project).
- `react-native-svg` — **optional**, only needed if you use
  [`<CertiLayerBadge>`](#certilayerbadge). Included in Expo by default.

---

## Quick start

```tsx
import CertiLayer, { CertiLayerRoot } from '@certilayer/react-native'
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native'

CertiLayer.init({ apiKey: 'certilayer_live_pk_xxx' })

const navigationRef = createNavigationContainerRef()

const reportScreen = () => {
  const name = navigationRef.getCurrentRoute()?.name
  if (name) CertiLayer.trackScreen(name)
}

export default function App() {
  return (
    <CertiLayerRoot>
      <NavigationContainer
        ref={navigationRef}
        onReady={reportScreen}
        onStateChange={reportScreen}
      >
        {/* your app */}
      </NavigationContainer>
    </CertiLayerRoot>
  )
}
```

Call `CertiLayer.init()` once at app startup with your **public** key —
never your secret key. Wrap your app root in `<CertiLayerRoot>` to enable
touch capture, and call `CertiLayer.trackScreen(name)` from your
navigation library's state-change callback to report screen transitions.
`navigationRef.getCurrentRoute()` returns the focused route even inside
nested navigators.

---

## Configuration

```ts
interface CertiLayerConfig {
  apiKey: string            // required — your public key
  endpoint?: string         // default: 'https://ingest.certilayer.net'
  flushIntervalMs?: number  // default: 5000
  batchSize?: number        // default: 50
  debug?: boolean           // default: false
}
```

| Option            | Default                         | Notes                                      |
| ----------------- | ------------------------------- | ------------------------------------------ |
| `apiKey`          | —                               | Required. Should start with `certilayer_`. |
| `endpoint`        | `https://ingest.certilayer.net` | Override only for self-hosted gateways.    |
| `flushIntervalMs` | `5000`                          | How often buffered signals are sent, in ms.|
| `batchSize`       | `50`                            | Max signals per batch.                     |
| `debug`           | `false`                         | Logs init and dropped batches to the console. |

---

## API reference

### `CertiLayer.init(config): void`

Initializes the SDK, generates a session ID, and starts screen-transition
tracking and the background flush timer. Calling `init()` while the SDK is
already running is a no-op (logs a warning). After `stop()` you can call
`init()` again to start a new session.

### `CertiLayer.trackScreen(screenName): void`

Reports a screen transition. Call this from your navigation library's
state-change callback (see the example above). Empty names and repeats of
the current screen are ignored. Calling it before `init()` logs a warning
and does nothing.

### `CertiLayer.getSessionId(): string`

Returns the current session ID — send this to your backend (alongside
`@certilayer/node` or another server SDK) to verify the session. Returns an
empty string when no session is running.

### `CertiLayer.stop(): Promise<void>`

Stops capture, clears the flush timer, and sends any remaining buffered
signals. Call this on logout or app teardown.

### `<CertiLayerRoot>`

Wraps your app root to enable passive touch capture. This is the one
required structural change — React Native has no document-level equivalent
to the DOM's `document.addEventListener`.

```tsx
<CertiLayerRoot>
  {/* your entire app tree */}
</CertiLayerRoot>
```

Touches inside React Native's `<Modal>` happen outside this view and are
not captured.

### `<CertiLayerBadge>`

An optional "Secured by CertiLayer" badge. Import it from the `badge`
entry point so apps that don't use it never load `react-native-svg`:

```tsx
import { CertiLayerBadge } from '@certilayer/react-native/badge'

<CertiLayerRoot>
  <App />
  <CertiLayerBadge theme="auto" position="bottom-right" />
</CertiLayerRoot>
```

| Prop        | Default          | Notes                                                              |
| ----------- | ---------------- | ------------------------------------------------------------------ |
| `theme`     | `'auto'`         | `'light'`, `'dark'`, or `'auto'` (follows the device color scheme). |
| `position`  | `'bottom-right'` | `'bottom-right'`, `'bottom-left'`, `'top-right'`, `'top-left'`.    |
| `showPulse` | `true`           | Pulsing status dot (disabled when reduced motion is on).           |
| `offset`    | `16`             | Distance from the screen edge in dp. Add your safe-area inset.     |
| `zIndex`    | `9999`           |                                                                    |

If your app has its own in-app theme switch, pass `theme` explicitly.

---

## Delivery and app lifecycle

- Signals are batched and each batch is kept until the gateway confirms it.
- Network errors, timeouts, `429` and `5xx` responses are retried with
  exponential backoff and jitter (up to 6 attempts). `Retry-After` is
  honored on `429`. Other `4xx` responses are not retried.
- Only one send is in flight at a time.
- Each batch is sent with a unique `Idempotency-Key` header, so a retry of
  the same batch can be recognized by the server.
- When the app moves to the background (or becomes inactive) and when you
  call `stop()`, the SDK immediately tries to send what it has. The OS may
  suspend the app before a request completes, so delivery in that moment is
  best-effort.
- While the device is offline the in-memory buffer is bounded; the oldest
  signals are dropped when it is full.

---

## What gets captured

| Signal       | What's recorded                                                                  |
| ------------ | -------------------------------------------------------------------------------- |
| `touch`      | Position, velocity, dwell time, and phase (start/move/end), tracked per finger   |
| `navigation` | Screen-to-screen transitions and time spent per screen, via `trackScreen()`      |

Signals are batched, converted into a behavioral feature vector on-device,
and sent to your CertiLayer ingestion endpoint.

**Not captured:** touch contact area and pressure (not available
cross-platform), and keyboard or motion signals.

**What is never captured:** this SDK has no keyboard collector. It does not
read `TextInput` contents, key presses, or any text a user types. It does
not collect names, emails, or device identifiers. The ingestion gateway
also receives the request IP address for security and rate limiting.

---

## License

© CertiLayer. All rights reserved.

## Support

- Docs: [certilayer.net/docs](https://certilayer.net/docs)
- Issues: please contact [contact@certilayer.net](mailto:contact@certilayer.net)
