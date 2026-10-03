export const CARDS = ['1', '2', '3', '5', '8', '13', '?', '☕'] as const;
export type CardValue = (typeof CARDS)[number];

export const MAX_NAME_GRAPHEMES = 3;
export const MAX_NAME_LENGTH = 32;

export interface PlayedCard {
  /** Increments on every play, so a swapped card is a new card on the table. */
  n: number;
  /** null while the coin is face-down, except for the viewer's own card. */
  v: CardValue | null;
}

export interface PlayerView {
  pid: string;
  name: string;
  seat: number;
  connected: boolean;
  card: PlayedCard | null;
}

export interface RoomView {
  you: string;
  faceUp: boolean;
  players: PlayerView[];
}

export type ClientMessage =
  | { t: 'join'; secret: string; name: string }
  | { t: 'rename'; name: string }
  | { t: 'play'; card: CardValue }
  | { t: 'unplay' }
  | { t: 'flip' }
  | { t: 'clear' };

export type ServerMessage = { t: 'state'; state: RoomView } | { t: 'error'; reason: string };

/** Close code sent to a socket whose player was claimed by a newer connection. */
export const CLOSE_REPLACED = 4001;

export function isCard(v: unknown): v is CardValue {
  return typeof v === 'string' && (CARDS as readonly string[]).includes(v);
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function graphemes(s: string): string[] {
  return Array.from(segmenter.segment(s), (g) => g.segment);
}

export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = graphemes(raw.trim().replace(/\s+/g, ''))
    .slice(0, MAX_NAME_GRAPHEMES)
    .join('');
  if (!name || name.length > MAX_NAME_LENGTH) return null;
  return name.replace(/[a-z]/g, (c) => c.toUpperCase());
}

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_PATTERN = /^[A-Z0-9]{4,12}$/;
