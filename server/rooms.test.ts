import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLOSE_REPLACED, type RoomView, type ServerMessage } from '../shared/protocol.ts';
import { DISCONNECT_GRACE_MS, EMPTY_ROOM_TTL_MS, Lobby, Room, type Connection } from './rooms.ts';

function fakeConn() {
  const conn = {
    last: null as RoomView | null,
    closed: null as number | null,
    send(msg: ServerMessage) {
      if (msg.t === 'state') conn.last = msg.state;
    },
    close(code: number) {
      conn.closed = code;
    },
  } satisfies Connection & Record<string, unknown>;
  return conn;
}

const SECRET_A = 'a'.repeat(32);
const SECRET_B = 'b'.repeat(32);

test('players take the lowest free seat', () => {
  const room = new Room('ROOM', 0);
  const a = room.join(SECRET_A, 'AA', fakeConn());
  const b = room.join(SECRET_B, 'BB', fakeConn());
  assert.equal(a.seat, 0);
  assert.equal(b.seat, 1);
});

test('face-down cards hide their value from everyone but the owner', () => {
  const room = new Room('ROOM', 0);
  const ca = fakeConn();
  const cb = fakeConn();
  const a = room.join(SECRET_A, 'AA', ca);
  room.join(SECRET_B, 'BB', cb);
  room.play(a, '8');

  const seenByB = cb.last!.players.find((p) => p.pid === a.pid)!;
  const seenByA = ca.last!.players.find((p) => p.pid === a.pid)!;
  assert.equal(seenByB.card?.v, null);
  assert.equal(seenByA.card?.v, '8');

  room.flip();
  assert.equal(cb.last!.players.find((p) => p.pid === a.pid)!.card?.v, '8');
});

test('playing a different card replaces the played one; clear empties the table', () => {
  const room = new Room('ROOM', 0);
  const conn = fakeConn();
  const a = room.join(SECRET_A, 'AA', conn);
  room.play(a, '3');
  const first = a.card!.n;
  room.play(a, '5');
  assert.equal(a.card?.v, '5');
  assert.notEqual(a.card!.n, first);
  room.clear();
  assert.equal(conn.last!.players[0].card, null);
});

test('reconnecting with the same secret keeps the seat and card, and closes the old socket', () => {
  const room = new Room('ROOM', 0);
  const old = fakeConn();
  const a = room.join(SECRET_A, 'AA', old);
  room.join(SECRET_B, 'BB', fakeConn());
  room.play(a, '13');

  const fresh = fakeConn();
  const again = room.join(SECRET_A, 'AA', fresh);
  assert.equal(again, a);
  assert.equal(old.closed, CLOSE_REPLACED);
  assert.equal(fresh.last!.players.find((p) => p.pid === a.pid)!.card?.v, '13');
});

test('a disconnected player keeps their seat through the grace period, then is removed', () => {
  const room = new Room('ROOM', 0);
  const conn = fakeConn();
  const watcher = fakeConn();
  const a = room.join(SECRET_A, 'AA', conn);
  room.join(SECRET_B, 'BB', watcher);
  room.disconnect(a, conn, 1000);

  assert.equal(watcher.last!.players.find((p) => p.pid === a.pid)!.connected, false);
  room.sweep(1000 + DISCONNECT_GRACE_MS - 1);
  assert.equal(room.size, 2);
  room.sweep(1000 + DISCONNECT_GRACE_MS);
  assert.equal(room.size, 1);
});

test('a stale socket closing does not disconnect the reconnected player', () => {
  const room = new Room('ROOM', 0);
  const old = fakeConn();
  const a = room.join(SECRET_A, 'AA', old);
  room.join(SECRET_A, 'AA', fakeConn());
  room.disconnect(a, old, 10);
  assert.notEqual(a.conn, null);
});

test('empty rooms are removed after the TTL', () => {
  const lobby = new Lobby();
  const room = lobby.get('ROOM', 0);
  const conn = fakeConn();
  const a = room.join(SECRET_A, 'AA', conn);
  room.disconnect(a, conn, 0);
  lobby.sweep(DISCONNECT_GRACE_MS);
  assert.ok(lobby.has('ROOM'));
  lobby.sweep(DISCONNECT_GRACE_MS + EMPTY_ROOM_TTL_MS);
  assert.ok(!lobby.has('ROOM'));
});
