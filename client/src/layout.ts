import { CARDS } from '../../shared/protocol.ts';

export interface Geometry {
  W: number;
  H: number;
  cx: number;
  cy: number;
  /** Seat ellipse radii. */
  sx: number;
  sy: number;
  /** Felt ellipse radii. */
  tx: number;
  ty: number;
  rail: number;
  avatar: number;
  seats: number;
  tableCardH: number;
  handCardH: number;
  handY: number;
  coin: number;
}

export interface Point {
  x: number;
  y: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function computeGeometry(W: number, H: number, seats: number): Geometry {
  const handCardH = Math.min(clamp(H * 0.22, 64, 190), (W - 24) / (1 + (CARDS.length - 1) * 0.62) / 0.7);
  const handBand = handCardH * 1.25;
  const areaH = H - handBand;
  const avatar = clamp(Math.min(W, areaH) * 0.11, 30, 62);
  const margin = 8;
  const sx = W / 2 - avatar / 2 - margin;
  const sy = areaH / 2 - avatar / 2 - margin;
  const rail = avatar * 0.42;
  const tx = Math.max(40, sx - avatar * 0.3 - rail);
  const ty = Math.max(30, sy - avatar * 0.3 - rail);
  const tableCardH = clamp(Math.min(ty * 0.5, tx * 0.3), 40, 120);
  return {
    W,
    H,
    cx: W / 2,
    cy: areaH / 2 + margin / 2,
    sx,
    sy,
    tx,
    ty,
    rail,
    avatar,
    seats,
    tableCardH,
    handCardH,
    handY: H - handBand / 2,
    coin: clamp(tableCardH * 0.7, 30, 78),
  };
}

function angle(g: Geometry, seat: number) {
  // Half-step offset keeps the vertical centre line clear for the coin.
  return Math.PI / 2 + (2 * Math.PI * (seat + 0.5)) / g.seats;
}

export function seatPoint(g: Geometry, seat: number): Point {
  const a = angle(g, seat);
  return { x: g.cx + g.sx * Math.cos(a), y: g.cy + g.sy * Math.sin(a) };
}

export function spotPoint(g: Geometry, seat: number): Point {
  const a = angle(g, seat);
  const w = g.tableCardH * 0.7;
  const rx = Math.max(g.tx * 0.3, g.tx - w * 0.85);
  const ry = Math.max(g.ty * 0.3, g.ty - g.tableCardH * 0.68);
  return { x: g.cx + rx * Math.cos(a), y: g.cy + ry * Math.sin(a) };
}

export function handSlots(g: Geometry, n: number): (Point & { rot: number })[] {
  const w = g.handCardH * 0.7;
  const mid = (n - 1) / 2;
  const arc = g.handCardH * 0.006;
  const maxStep = w * 1.08;
  const step = n > 1 ? Math.min(maxStep, (g.W - 24 - w) / (n - 1)) : 0;
  return Array.from({ length: n }, (_, i) => {
    const d = i - mid;
    return {
      x: g.W / 2 + d * step,
      y: g.handY + (d * d - (mid * mid) / 2) * arc,
      rot: d * 2.2,
    };
  });
}
