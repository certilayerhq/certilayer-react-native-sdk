/**
 * @file CertiLayerRoot.tsx
 * @layer L1 — React Native SDK
 * @description Wrap your app's root component with <CertiLayerRoot> to
 * enable passive touch capture. This is the one structural change this
 * SDK requires (RN has no document-level touch listener equivalent).
 *
 * @example
 * export default function App() {
 *   return (
 *     <CertiLayerRoot>
 *       <NavigationContainer onStateChange={...}>
 *         ...
 *       </NavigationContainer>
 *     </CertiLayerRoot>
 *   )
 * }
 */

import React from 'react'
import { View, StyleSheet } from 'react-native'
import { getTouchHandlers } from './index'

export function CertiLayerRoot({ children }: { children: React.ReactNode }) {
  const handlers = getTouchHandlers()

  return (
    <View style={StyleSheet.absoluteFill} {...handlers}>
      {children}
    </View>
  )
}
