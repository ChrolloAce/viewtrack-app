import type { ImageSourcePropType } from 'react-native';

// Ten artwork badges, one per level (levels above 10 reuse the top badge).
// `color` is the badge's accent — used for the level-up glow / edge lights so
// the celebration matches the artwork.
const BADGES: { source: ImageSourcePropType; color: string }[] = [
  { source: require('../../assets/badges/badge-1.png'), color: '#C2CAD6' }, // silver
  { source: require('../../assets/badges/badge-2.png'), color: '#2BB6F2' }, // blue
  { source: require('../../assets/badges/badge-3.png'), color: '#46C24E' }, // green
  { source: require('../../assets/badges/badge-4.png'), color: '#F4731E' }, // orange
  { source: require('../../assets/badges/badge-5.png'), color: '#A855F7' }, // purple
  { source: require('../../assets/badges/badge-6.png'), color: '#F4A92E' }, // gold
  { source: require('../../assets/badges/badge-7.png'), color: '#3AA0E8' }, // sky blue
  { source: require('../../assets/badges/badge-8.png'), color: '#C04AD6' }, // violet
  { source: require('../../assets/badges/badge-9.png'), color: '#E83B3B' }, // red
  { source: require('../../assets/badges/badge-10.png'), color: '#EF3B2E' }, // scarlet
];

export function badgeFor(level: number | null | undefined) {
  const n = level && level > 0 ? level : 1;
  return BADGES[Math.min(n - 1, BADGES.length - 1)];
}
