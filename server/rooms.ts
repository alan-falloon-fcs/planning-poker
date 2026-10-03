import { randomBytes, randomInt } from 'node:crypto';
import {
  CLOSE_REPLACED,
  ROOM_CODE_ALPHABET,
  type CardValue,
  type PlayerView,
  type RoomView,
  type ServerMessage,
} from '../shared/protocol.ts';

export const DISCONNECT_GRACE_MS = 60_000;
export const EMPTY_ROOM_TTL_MS = 10 * 60_000;

export interface Connection {
  send(msg: ServerMessage): void;
  close(code: number, reason: string): void;
}

export interface Player {
  secret: string;
  pid: string;
  name: string;
  seat: number;
  card: { n: number; v: CardValue } | null;
  conn: Connection | null;
  disconnectedAt: number;
}

export class Room {
  readonly code: string;
  faceUp = false;
  emptySince: number;
  private players = new Map<string, Player>();
  private playCount = 0;

  constructor(code: string, now: number) {
    this.code = code;
    this.emptySince = now;
  }

  get size() {
    return this.players.size;
  }

  join(secret: string, name: string, conn: Connection): Player {
    let player = this.players.get(secret);
    if (player) {
      if (player.conn && player.conn !== conn) player.conn.close(CLOSE_REPLACED, 'replaced');
      player.name = name;
    } else {
      player = {
        secret,
        pid: randomBytes(6).toString('base64url'),
        name,
        seat: this.freeSeat(),
        card: null,
        conn: null,
        disconnectedAt: 0,
      };
      this.players.set(secret, player);
    }
    player.conn = conn;
    this.broadcast();
    return player;
  }

  disconnect(player: Player, conn: Connection, now: number) {
    if (player.conn !== conn) return;
    player.conn = null;
    player.disconnectedAt = now;
    this.broadcast();
  }

  rename(player: Player, name: string) {
    player.name = name;
    this.broadcast();
  }

  play(player: Player, card: CardValue) {
    if (player.card?.v === card) return;
    player.card = { n: ++this.playCount, v: card };
    this.broadcast();
  }

  unplay(player: Player) {
    if (!player.card) return;
    player.card = null;
    this.broadcast();
  }

  flip() {
    this.faceUp = !this.faceUp;
    this.broadcast();
  }

  clear() {
    for (const p of this.players.values()) p.card = null;
    this.broadcast();
  }

  /** Removes players whose grace period has lapsed. Returns true when the room has expired. */
  sweep(now: number): boolean {
    let changed = false;
    for (const [secret, p] of this.players) {
      if (!p.conn && now - p.disconnectedAt >= DISCONNECT_GRACE_MS) {
        this.players.delete(secret);
        changed = true;
      }
    }
    if (changed) this.broadcast();
    if (this.players.size > 0 || changed) this.emptySince = now;
    return now - this.emptySince >= EMPTY_ROOM_TTL_MS;
  }

  viewFor(viewer: Player): RoomView {
    const players: PlayerView[] = [...this.players.values()].map((p) => ({
      pid: p.pid,
      name: p.name,
      seat: p.seat,
      connected: p.conn !== null,
      card: p.card && { n: p.card.n, v: this.faceUp || p === viewer ? p.card.v : null },
    }));
    return { you: viewer.pid, faceUp: this.faceUp, players };
  }

  private freeSeat(): number {
    const taken = new Set([...this.players.values()].map((p) => p.seat));
    let seat = 0;
    while (taken.has(seat)) seat++;
    return seat;
  }

  private broadcast() {
    for (const p of this.players.values()) {
      p.conn?.send({ t: 'state', state: this.viewFor(p) });
    }
  }
}

export class Lobby {
  private rooms = new Map<string, Room>();

  get(code: string, now: number): Room {
    let room = this.rooms.get(code);
    if (!room) {
      room = new Room(code, now);
      this.rooms.set(code, room);
    }
    return room;
  }

  newCode(): string {
    let code: string;
    do {
      code = Array.from({ length: 6 }, () => ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)]).join('');
    } while (this.rooms.has(code));
    return code;
  }

  sweep(now: number) {
    for (const [code, room] of this.rooms) {
      if (room.sweep(now)) this.rooms.delete(code);
    }
  }

  has(code: string) {
    return this.rooms.has(code);
  }
}
