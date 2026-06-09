import type { Section } from '@/components/desktop-rail';

// When a rail item is tapped from a standalone detail screen (e.g. a creator
// profile), we route back to the shell and have it open the requested section.
// A one-shot module-level handoff: the shell reads it once on mount.
let pendingSection: Section | null = null;

export function setPendingSection(s: Section) {
  pendingSection = s;
}

export function takePendingSection(): Section | null {
  const s = pendingSection;
  pendingSection = null;
  return s;
}
