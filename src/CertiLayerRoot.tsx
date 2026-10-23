/**
 * @file CertiLayerRoot.tsx
 * @layer L1 — React Native SDK
 * @description Wrap your app's root component with <CertiLayerRoot> to enable
 * passive touch capture.
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
 *
 * NOTE: touches inside <Modal> happen outside this view and are not captured.
 */

import React from 'react'
import { View, StyleSheet } from 'react-native'
import { getTouchHandlers } from './index'

export function CertiLayerRoot({ children }: { children: React.ReactNode }) {
  const handlers = React.useMemo(() => getTouchHandlers(), [])

  return (
    <View style={styles.root} collapsable={false} {...handlers}>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
})
