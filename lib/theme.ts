import type { Status } from './types';

export const BG = '#0B0E17';
export const SURFACE_1 = '#121727';
export const SURFACE_2 = '#171E33';
export const BORDER = 'rgba(255,255,255,0.07)';
export const BORDER_HI = 'rgba(255,255,255,0.12)';
export const TEXT = '#EAEEF7';
export const TEXT_DIM = '#9AA6C2';
export const TEXT_FAINT = '#6B778F';
export const ACCENT = '#7C6CFF';
export const ACCENT_TEXT = '#A99BFF';
export const PULSE = '#22D3EE';

export const STATUS_COLOR: Record<Status, string> = {
  done: '#34D399',
  in_progress: '#38BDF8',
  at_risk: '#FBBF24',
  blocked: '#FB4E6D',
  not_started: '#8695AD',
};

export const STATUS_GLYPH: Record<Status, string> = {
  done: '✓',
  in_progress: '◐',
  at_risk: '!',
  blocked: '✕',
  not_started: '○',
};
