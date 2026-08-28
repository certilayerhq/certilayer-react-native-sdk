# @certilayer/react-native

**Passive behavioral biometrics for React Native — pure JS/TS, no native modules required.**

CertiLayer's React Native SDK captures touch behavior and screen
transitions, then streams a behavioral feature vector to your CertiLayer
account so you can verify real human sessions on mobile — no CAPTCHA, no
device fingerprinting, no PII.

[![npm version](https://img.shields.io/npm/v/@certilayer/react-native.svg)](https://www.npmjs.com/package/@certilayer/react-native)

---

## Pure JS/TS — no native setup

This SDK captures entirely in JavaScript via React Native's `PanResponder`
and navigation callbacks — it does **not** bridge to native Android/iOS
modules. That means:

- No `pod install`, no native linking, no Gradle changes.
- Works the moment you install the package.
- The only structural change required is wrapping your app root in
  `<CertiLayerRoot>` (see below) — React Native has no document-level
  touch listener equivalent, so this is how the SDK observes touches
  across your whole app.

---

## Installation

```bash
npm install @certilayer/react-native
```

`react` and `react-native` are peer dependencies — the SDK uses whatever
versions are already in your project.

---

## Quick start

```tsx
import CertiLayer, { CertiLayerRoot } from '@certilayer/react-native'
import { NavigationContainer } from '@react-navigation/native'

CertiLayer.init({ apiKey: 'certilayer_live_pk_xxx' })

export default function App() {
  return (
    <CertiLayerRoot>
      <NavigationContainer
        onStateChange={(state) => {
          const routeName = state?.routes[state.index]?.name
          if (routeName) CertiLayer.trackScreen(routeName)
        }}
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

---

## Configuration

```ts
interface CertiLayerConfig {
  apiKey: string           // required — your public key
  endpoint?: string         // default: 'https://ingest.certilayer.net'
  flushIntervalMs?: number  // default: 5000
  batchSize?: number        // default: 50
  debug?: boolean           // default: false
}
```

| Option            | Default                          | Notes                                            |
| ------------------ | ---------------------------------- | --------------------------------------------------- |
| `apiKey`           | —                                  | Required. Should start with `certilayer_`.          |
| `endpoint`         | `https://ingest.certilayer.net`    | Override only for self-hosted gateways.             |
| `flushIntervalMs`  | `5000`                              | How often buffered signals are sent, in ms.         |
| `batchSize`        | `50`                                | Max signals per batch.                              |
| `debug`            | `false`                             | Logs session init to the console.                   |

---

## API reference

### `CertiLayer.init(config): void`

Initializes the SDK, generates a session ID, and starts screen-transition
tracking. Calling `init()` more than once is a no-op (logs a warning and
does nothing).

### `CertiLayer.trackScreen(screenName): void`

Reports a screen transition. Call this from your navigation library's
state-change callback (see the `NavigationContainer` example above).
Calling it before `init()` logs a warning and does nothing.

### `CertiLayer.getSessionId(): string`

Returns the current session ID — send this to your backend (alongside
`@certilayer/node` or another server SDK) to verify the session.

### `CertiLayer.stop(): Promise<void>`

Stops capture, clears the flush timer, and sends any remaining buffered
signals. Call this on logout or app teardown.

### `<CertiLayerRoot>`

Wraps your app root to enable passive touch capture via `PanResponder`.
This is the one required structural change — React Native has no
document-level equivalent to the DOM's `document.addEventListener`.

```tsx
<CertiLayerRoot>
  {/* your entire app tree */}
</CertiLayerRoot>
```

---

## What gets captured

| Signal       | What's recorded                                                |
| ------------ | ------------------------------------------------------------------ |
| `touch`      | Position, velocity, dwell time, and phase (start/move/end) via `PanResponder` |
| `navigation` | Screen-to-screen transitions and time spent per screen, via `trackScreen()` |

Signals are batched, converted into a behavioral feature vector on-device,
and sent to your CertiLayer ingestion endpoint. No PII is captured — no
names, emails, or device identifiers.

---

## License

© CertiLayer. All rights reserved.

## Support

- Docs: [certilayer.net/docs](https://certilayer.net/docs)
- Issues: please contact [contact@certilayer.net](mailto:contact@certilayer.net)