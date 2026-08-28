# @certilayer/react-native

React Native SDK for CertiLayer — behavioral biometrics without PII.

## Installation

```sh
npm install @certilayer/react-native
cd ios && pod install
```

## Android setup

In `MainApplication.kt`, add:

```kotlin
import com.certilayer.rn.CertiLayerPackage

override fun getPackages() = listOf(CertiLayerPackage(), ...)
```

## Usage

```ts
import CertiLayer from '@certilayer/react-native';

// Init once at app startup
await CertiLayer.init({ apiKey: 'cl_live_...' });

// On a critical screen (login, checkout)
await CertiLayer.startSession();

// When you need the score
const { score, verdict } = await CertiLayer.getScore();
// verdict: 'human_verified' | 'human_likely' | 'synthetic'

// On screen exit
await CertiLayer.stopSession();
```

## HCS Thresholds

| Score | Verdict |
|-------|---------|
| ≥ 0.90 | `human_verified` |
| 0.65–0.90 | `human_likely` |
| < 0.65 | `synthetic` |
