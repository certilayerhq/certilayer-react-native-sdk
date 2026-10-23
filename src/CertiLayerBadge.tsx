/**
 * @file CertiLayerBadge.tsx
 * @layer L1 — React Native SDK
 * @description "Secured by CertiLayer" badge — same look as the Web SDK badge.
 * Requires the optional peer dependency `react-native-svg`.
 * Import from '@certilayer/react-native/badge' (not from the main entry).
 *
 * @example
 * <CertiLayerRoot>
 *   <App />
 *   <CertiLayerBadge position="bottom-right" />
 * </CertiLayerRoot>
 */

import React, { useEffect, useRef } from 'react'
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
} from 'react-native'
import Svg, { G, Path } from 'react-native-svg'

export type BadgeTheme = 'light' | 'dark' | 'auto'
export type BadgePosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'

export interface CertiLayerBadgeProps {
  /** 'auto' follows the device color scheme. Default: 'auto'. */
  theme?: BadgeTheme
  /** Default: 'bottom-right'. */
  position?: BadgePosition
  /** Pulsing green status dot. Default: true. */
  showPulse?: boolean
  /** Distance from the screen edge in dp. Add your safe-area inset here. Default: 16. */
  offset?: number
  zIndex?: number
}

const URL = 'https://certilayer.net'

const PALETTE = {
  light: {
    background: 'rgba(255, 255, 255, 0.96)',
    border: 'rgba(17, 24, 39, 0.12)',
    text: '#555963',
    brand: '#6441C8',
    icon: '#7047D7',
    shadowOpacity: 0.07,
    indicator: '#35B879',
  },
  dark: {
    background: 'rgba(20, 20, 24, 0.94)',
    border: 'rgba(255, 255, 255, 0.11)',
    text: '#C4C4CC',
    brand: '#D0C5FF',
    icon: '#B6A3FF',
    shadowOpacity: 0.16,
    indicator: '#35B879',
  },
} as const

function positionStyle(position: BadgePosition, offset: number) {
  return {
    ...(position.startsWith('top') ? { top: offset } : { bottom: offset }),
    ...(position.endsWith('left') ? { left: offset } : { right: offset }),
  }
}

function PulseDot({ color }: { color: string }) {
  const opacity = useRef(new Animated.Value(0.9)).current

  useEffect(() => {
    let cancelled = false
    let loop: Animated.CompositeAnimation | null = null

    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (cancelled || reduce) return
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(opacity, {
              toValue: 0.4,
              duration: 1400,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0.9,
              duration: 1400,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
        )
        loop.start()
      })
      .catch(() => {})

    return () => {
      cancelled = true
      loop?.stop()
    }
  }, [opacity])

  return <Animated.View style={[styles.pulse, { backgroundColor: color, opacity }]} />
}

export function CertiLayerBadge({
  theme = 'auto',
  position = 'bottom-right',
  showPulse = true,
  offset = 16,
  zIndex = 9999,
}: CertiLayerBadgeProps) {
  const scheme = useColorScheme()
  const mode = theme === 'auto' ? (scheme === 'dark' ? 'dark' : 'light') : theme
  const c = PALETTE[mode]

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel="Secured by CertiLayer. Learn more."
      onPress={() => {
        Linking.openURL(URL).catch(() => {})
      }}
      style={({ pressed }) => [
        styles.base,
        positionStyle(position, offset),
        {
          backgroundColor: c.background,
          borderColor: c.border,
          shadowOpacity: c.shadowOpacity,
          zIndex,
          opacity: pressed ? 0.88 : 1,
        },
      ]}
    >
      <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
        <G stroke={c.icon} strokeWidth={1.55} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M8.1 4.1A9.1 9.1 0 0 1 21 12" />
          <Path d="M4.5 7.1A9.1 9.1 0 0 1 6.6 5" />
          <Path d="M3 12a9 9 0 0 1 .4-2.6" />
          <Path d="M5.2 13.1c.1 3.2-.5 5.3-1.4 7" />
          <Path d="M8 10.3a4.5 4.5 0 0 1 8.3 2.4c0 3.3-.6 6-1.8 8" />
          <Path d="M9.2 14c0 2.5-.3 4.7-1.2 6.8" />
          <Path d="M11.8 8.7a4.1 4.1 0 0 1 3.7 4.1" />
          <Path d="M12 12.2c0 2.4-.1 4.9-.8 7.2" />
          <Path d="M19.7 15.8c-.3 1.6-.8 3.1-1.5 4.4" />
        </G>
      </Svg>

      <Text allowFontScaling={false} style={[styles.text, styles.secured, { color: c.text }]}>
        Secured by
      </Text>
      <Text allowFontScaling={false} style={[styles.text, styles.brand, { color: c.brand }]}>
        CertiLayer
      </Text>

      {showPulse ? <PulseDot color={c.indicator} /> : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 5,
    elevation: 2,
  },
  text: {
    fontSize: 11,
    fontWeight: '500',
    includeFontPadding: false,
  },
  secured: { marginLeft: 8 },
  brand: { fontWeight: '600', marginLeft: 3 },
  pulse: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginLeft: 8,
  },
})
