/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// "Soft outline" palette (Prayerlock-style): white surfaces, thin black
// outlines, soft drop shadows, generous rounding, warm orange accent.
export const Colors = {
  light: {
    text: '#1A1A1A',
    background: '#FFFFFF',
    backgroundElement: '#F2F1EE',
    backgroundSelected: '#F0EFEC',
    textSecondary: '#8A8A8A',
    // Brand — MTP orange
    primary: '#F4731E',
    primaryText: '#FFFFFF',
    primaryMuted: '#FFE9D8',
    accent: '#FFE3D0',
    border: '#161616',
    shadow: '#000000',
    card: '#FFFFFF',
    success: '#15A34A',
    danger: '#E11D2E',
  },
  dark: {
    text: '#F5F5F5',
    background: '#121212',
    backgroundElement: '#1E1E1E',
    backgroundSelected: '#2A2A2A',
    textSecondary: '#9A9A9A',
    // Brand — MTP orange
    primary: '#FB7322',
    primaryText: '#1A1A1A',
    primaryMuted: '#3A2515',
    accent: '#3A2515',
    border: '#3A3A3A',
    shadow: '#000000',
    card: '#1C1C1C',
    success: '#22C55E',
    danger: '#F04444',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

// Neo-brutalist: boxy, only slightly rounded (buttons/cards use md/lg).
export const Radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
} as const;

// Chunky black outlines — the brutalist signature.
export const Border = {
  width: 2.5,
  widthThick: 4,
} as const;

/**
 * Hard, blur-less offset shadow — the neo-brutalist signature.
 * Cross-platform `boxShadow` (RN 0.76+).
 */
export function brutalShadow(color: string, offset = 4) {
  return { boxShadow: `${offset}px ${offset}px 0px ${color}` } as const;
}

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

// Clearance the scrollable content must leave for the floating pill tab bar.
export const BottomTabInset = Platform.select({ ios: 104, android: 96, web: 96 }) ?? 0;
export const MaxContentWidth = 800;
