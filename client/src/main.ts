import './style.css';
import {
  CARDS,
  CLOSE_REPLACED,
  cleanName,
  graphemes,
  type CardValue,
  type ClientMessage,
  type PlayerView,
  type RoomView,
  type ServerMessage,
} from '../../shared/protocol.ts';
import { computeGeometry, handSlots, seatPoint, spotPoint, type Geometry, type Point } from './layout.ts';

const SEAT_COLORS = ['#e85d75', '#f29e4c', '#e9c46a', '#8ac926', '#2ec4b6', '#3a86ff', '#8e6cf0', '#d16ba5', '#ff7f50', '#4dd0e1'];
const INK: Record<CardValue, string> = {
  '1': '#2a9d8f',
  '2': '#3f9e5a',
  '4': '#7b5cd6',
  '8': '#d62839',
  '?': '#5f6b7a',
  '☕': '#8d5a3b',
};
const PICKS = ['🐑', '🐄', '🚜', '🥝', '🐕', '🌾', '🦉', '🐝', '🍀', '⛰️', '🌊', '🚀'];
const MOVE_MS = 650;
const DEFAULT_SEATS = 10;

const room = location.pathname.split('/')[2] ?? '';
const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const store = {
  get(area: Storage | undefined, key: string): string | null {
    try {
      return area?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  set(area: Storage | undefined, key: string, value: string) {
    try {
      area?.setItem(key, value);
    } catch {}
  },
};
const local = (() => {
  try {
    return localStorage;
  } catch {
    return undefined;
  }
})();
const session = (() => {
  try {
    return sessionStorage;
  } catch {
    return undefined;
  }
})();

function randomSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const secretKey = `pp:secret:${room}`;
let secret = store.get(session, secretKey) ?? randomSecret();
store.set(session, secretKey, secret);

let name = cleanName(store.get(local, 'pp:name') ?? '');
let editing = !name;
let state: RoomView | null = null;
let socket: WebSocket | null = null;
let online = false;
let retry = 0;
let g: Geometry = computeGeometry(innerWidth, innerHeight, DEFAULT_SEATS);
let coinTurns: number | null = null;
let lastFaceUp: boolean | null = null;

// ---------- network ----------

function send(msg: ClientMessage) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
}

function connect() {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?room=${room}`);
  socket = ws;
  ws.onopen = () => {
    retry = 0;
    online = true;
    if (name && (state || !editing)) send({ t: 'join', secret, name });
    renderStatus();
  };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data) as ServerMessage;
    if (msg.t === 'state') {
      state = msg.state;
      render();
    }
  };
  ws.onclose = (ev) => {
    if (socket !== ws) return;
    online = false;
    if (ev.code === CLOSE_REPLACED) {
      secret = randomSecret();
      store.set(session, secretKey, secret);
      state = null;
    }
    renderStatus();
    setTimeout(connect, Math.min(5000, 400 * 2 ** retry++));
  };
}

// ---------- helpers ----------

const me = (): PlayerView | undefined => state?.players.find((p) => p.pid === state!.you);
const seatColor = (seat: number) => SEAT_COLORS[seat % SEAT_COLORS.length];
const seatCount = () => Math.max(DEFAULT_SEATS, ...(state?.players.map((p) => p.seat + 1) ?? []));

function translate(p: Point, extra = '') {
  return `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -50%) ${extra}`;
}

/** Small, stable tilt so cards on the table look dropped by hand. */
function tilt(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return (x - Math.floor(x) - 0.5) * 10;
}

function setAvatar(el: HTMLElement, text: string) {
  el.textContent = text;
  el.dataset.len = String(Math.min(3, graphemes(text).length));
  el.classList.toggle('emoji', /\p{Extended_Pictographic}/u.test(text));
}

// ---------- table ----------

function renderTable() {
  const set = (id: string, rx: number, ry: number, dy = 0, extra: Record<string, number> = {}) => {
    const el = document.getElementById(id)!;
    el.setAttribute('cx', String(g.cx));
    el.setAttribute('cy', String(g.cy + dy));
    el.setAttribute('rx', String(Math.max(0, rx)));
    el.setAttribute('ry', String(Math.max(0, ry)));
    for (const [k, v] of Object.entries(extra)) el.setAttribute(k, String(v));
  };
  set('t-shadow', g.tx + g.rail * 1.1, g.ty + g.rail * 1.1, g.rail * 0.45);
  set('t-rail', g.tx + g.rail, g.ty + g.rail);
  set('t-rail-shine', g.tx + g.rail * 0.55, g.ty + g.rail * 0.55, 0, { 'stroke-width': g.rail * 0.35 });
  set('t-felt', g.tx, g.ty);
  set('t-light', g.tx, g.ty);
  set('t-line', g.tx * 0.82, g.ty * 0.78);
}

// ---------- seats ----------

const seatsEl = $('#seats');
const seatEls: HTMLElement[] = [];

function renderSeats() {
  const bySeat = new Map(state?.players.map((p) => [p.seat, p]));
  const you = state?.you;
  for (let i = 0; i < Math.max(g.seats, seatEls.length); i++) {
    let el = seatEls[i];
    if (!el) {
      el = document.createElement('div');
      el.className = 'seat';
      el.innerHTML = '<span class="ghost"></span><span class="avatar"></span><span class="badge"></span>';
      seatsEl.append(el);
      seatEls[i] = el;
    }
    if (i >= g.seats) {
      el.classList.remove('taken');
      el.classList.add('gone');
      continue;
    }
    el.classList.remove('gone');
    const p = bySeat.get(i);
    el.style.setProperty('--c', seatColor(i));
    el.style.setProperty('--size', `${g.avatar}px`);
    el.style.transform = translate(seatPoint(g, i));
    el.classList.toggle('taken', !!p);
    el.classList.toggle('me', !!p && p.pid === you);
    el.classList.toggle('away', !!p && !p.connected);
    const avatar = el.querySelector<HTMLElement>('.avatar')!;
    if (p) setAvatar(avatar, p.name);
    if (p?.pid === you) {
      el.setAttribute('role', 'button');
      el.tabIndex = 0;
      el.title = 'Change your initials';
    } else {
      el.removeAttribute('role');
      el.removeAttribute('tabindex');
      el.title = '';
    }
  }
}

function startEditing() {
  if (!me()) return;
  editing = true;
  render();
  setTimeout(() => nameInput.select(), 50);
}

seatsEl.addEventListener('click', (ev) => {
  if ((ev.target as HTMLElement).closest('.seat.me')) startEditing();
});
seatsEl.addEventListener('keydown', (ev) => {
  if ((ev.key === 'Enter' || ev.key === ' ') && (ev.target as HTMLElement).closest('.seat.me')) {
    ev.preventDefault();
    startEditing();
  }
});

// ---------- coin & clear ----------

const coinEl = $<HTMLButtonElement>('#coin');
const clearEl = $<HTMLButtonElement>('#clear');

function renderCenter() {
  const faceUp = state?.faceUp ?? false;
  coinEl.style.setProperty('--coin', `${g.coin}px`);
  coinEl.style.transform = translate({ x: g.cx, y: g.cy });
  clearEl.style.setProperty('--coin', `${g.coin * 0.62}px`);
  clearEl.style.transform = translate({ x: g.cx + g.coin * 1.05, y: g.cy + g.coin * 0.3 });

  if (coinTurns === null || lastFaceUp === null) {
    coinTurns = faceUp ? 0 : 1;
  } else if (faceUp !== lastFaceUp) {
    coinTurns += 3;
    const toss = coinEl.querySelector<HTMLElement>('.coin-toss')!;
    toss.classList.remove('toss');
    void toss.offsetWidth;
    toss.classList.add('toss');
  }
  lastFaceUp = faceUp;
  coinEl.querySelector<HTMLElement>('.coin-inner')!.style.transform = `rotateY(${coinTurns * 180}deg)`;
  const label = faceUp ? 'Turn cards face-down' : 'Turn cards face-up';
  coinEl.title = label;
  coinEl.setAttribute('aria-label', label);
  coinEl.disabled = !state;

  clearEl.disabled = !state?.players.some((p) => p.card);
}

coinEl.addEventListener('click', () => send({ t: 'flip' }));
clearEl.addEventListener('click', () => send({ t: 'clear' }));

// ---------- cards ----------

const cardsEl = $('#cards');
const cardEls = new Map<string, HTMLElement>();

interface Pose extends Point {
  h: number;
  rot: number;
  opacity?: number;
}

interface CardSpec {
  key: string;
  kind: 'hand' | 'mine' | 'table';
  value: CardValue | null;
  owner: PlayerView;
  down: boolean;
  pose: Pose;
  /** Where the card comes from when it first appears, and returns to when it leaves. */
  origin: Pose;
  z: number;
  delay: number;
  label: string;
}

const CARD_HTML =
  '<div class="lift"><div class="wobble"><div class="flipper">' +
  '<div class="face front"><span class="corner tl"></span><span class="value"></span><span class="corner br"></span></div>' +
  '<div class="face back"><span class="corner tl"></span><span class="corner br"></span></div>' +
  '</div></div></div>';

function pose(el: HTMLElement, p: Pose) {
  el.style.setProperty('--h', `${p.h}px`);
  el.style.transform = translate(p, `rotate(${p.rot.toFixed(2)}deg)`);
  el.style.opacity = String(p.opacity ?? 1);
}

function cardSpecs(): CardSpec[] {
  if (!state) return [];
  const specs: CardSpec[] = [];
  const you = me();
  const faceUp = state.faceUp;

  for (const p of state.players) {
    if (!p.card || p === you) continue;
    const seat = seatPoint(g, p.seat);
    specs.push({
      key: `o:${p.pid}:${p.card.n}`,
      kind: 'table',
      value: p.card.v,
      owner: p,
      down: !faceUp,
      pose: { ...spotPoint(g, p.seat), h: g.tableCardH, rot: tilt(p.card.n) },
      origin: { ...seat, h: g.tableCardH * 0.45, rot: 0, opacity: 0 },
      z: 10 + p.seat,
      delay: 0,
      label: `${p.name}'s card`,
    });
  }

  if (you) {
    const inHand = CARDS.filter((c) => c !== you.card?.v);
    const slots = handSlots(g, inHand.length);
    const hidden = editing ? g.H * 0.6 + g.handCardH : 0;
    CARDS.forEach((c, i) => {
      const onTable = you.card?.v === c;
      const slotIndex = inHand.indexOf(c);
      const slot = onTable ? null : slots[slotIndex];
      specs.push({
        key: `m:${c}`,
        kind: onTable ? 'mine' : 'hand',
        value: c,
        owner: you,
        down: onTable && !faceUp,
        pose: slot
          ? { x: slot.x, y: slot.y + hidden, h: g.handCardH, rot: slot.rot }
          : { ...spotPoint(g, you.seat), h: g.tableCardH, rot: tilt(you.seat * 13 + i) },
        origin: { x: g.W / 2, y: g.H + g.handCardH, h: g.handCardH, rot: 0 },
        z: onTable ? 10 + you.seat : 100 + slotIndex,
        delay: i * 45,
        label: onTable ? `Take back ${c}` : `Play ${c}`,
      });
    });
  }
  return specs;
}

function dress(el: HTMLElement, spec: CardSpec) {
  el.dataset.kind = spec.kind;
  el.classList.toggle('down', spec.down);
  el.classList.toggle('hand', spec.kind === 'hand');
  el.classList.toggle('mine', spec.kind === 'mine');
  el.classList.toggle('table', spec.kind === 'table');
  el.style.setProperty('--owner', seatColor(spec.owner.seat));
  el.style.setProperty('--flip-delay', `${spec.kind === 'hand' ? 0 : spec.owner.seat * 60}ms`);
  el.setAttribute('aria-label', spec.down ? `${spec.owner.name}'s face-down card` : spec.label);
  for (const corner of el.querySelectorAll<HTMLElement>('.corner')) corner.textContent = spec.owner.name;
  if (spec.value !== null) {
    const value = el.querySelector<HTMLElement>('.value')!;
    value.textContent = spec.value;
    value.dataset.len = String(spec.value.length);
    el.style.setProperty('--ink', INK[spec.value]);
  }
}

function renderCards(animate: boolean) {
  const specs = cardSpecs();
  const wanted = new Set(specs.map((s) => s.key));

  for (const [key, el] of cardEls) {
    if (wanted.has(key) || el.classList.contains('leaving')) continue;
    el.classList.add('leaving');
    const origin = JSON.parse(el.dataset.origin ?? 'null') as Pose | null;
    if (origin) pose(el, { ...origin, opacity: 0 });
    else el.style.opacity = '0';
    setTimeout(() => {
      el.remove();
      if (cardEls.get(key) === el) cardEls.delete(key);
    }, MOVE_MS + 100);
  }

  for (const spec of specs) {
    let el = cardEls.get(spec.key);
    const fresh = !el;
    if (!el) {
      el = document.createElement('div');
      el.className = 'card';
      el.dataset.key = spec.key;
      el.tabIndex = 0;
      el.setAttribute('role', 'button');
      el.innerHTML = CARD_HTML;
      el.style.transition = 'none';
      pose(el, spec.origin);
      dress(el, spec);
      cardsEl.append(el);
      cardEls.set(spec.key, el);
      void el.offsetWidth;
      el.style.transition = '';
      if (animate && spec.delay) {
        el.style.setProperty('--deal-delay', `${spec.delay}ms`);
        setTimeout(() => el!.style.removeProperty('--deal-delay'), MOVE_MS + spec.delay);
      }
    }
    el.dataset.origin = JSON.stringify(spec.origin);
    const moved = !fresh && el.dataset.kind !== spec.kind;
    dress(el, spec);
    pose(el, spec.pose);
    if (moved) {
      el.style.zIndex = '500';
      const target = String(spec.z);
      setTimeout(() => {
        if (el!.dataset.kind === spec.kind) el!.style.zIndex = target;
      }, MOVE_MS);
    } else if (el.style.zIndex !== '500') {
      el.style.zIndex = String(spec.z);
    }
  }
}

function shake(el: HTMLElement) {
  const wobble = el.querySelector<HTMLElement>('.wobble')!;
  wobble.classList.remove('shake');
  void wobble.offsetWidth;
  wobble.classList.add('shake');
}

function activate(el: HTMLElement) {
  const key = el.dataset.key ?? '';
  const you = me();
  if (key.startsWith('m:') && you && !el.classList.contains('leaving')) {
    const value = key.slice(2) as CardValue;
    if (el.dataset.kind === 'hand') {
      you.card = { n: (you.card?.n ?? 0) + 1, v: value };
      send({ t: 'play', card: value });
    } else {
      you.card = null;
      send({ t: 'unplay' });
    }
    render();
  } else if (key.startsWith('o:')) {
    shake(el);
  }
}

cardsEl.addEventListener('click', (ev) => {
  const el = (ev.target as HTMLElement).closest<HTMLElement>('.card');
  if (el) activate(el);
});
cardsEl.addEventListener('keydown', (ev) => {
  const el = (ev.target as HTMLElement).closest<HTMLElement>('.card');
  if (el && (ev.key === 'Enter' || ev.key === ' ')) {
    ev.preventDefault();
    activate(el);
  }
});

// ---------- join ----------

const joinEl = $<HTMLFormElement>('#join');
const nameInput = $<HTMLInputElement>('#name');
const previewEl = $('#join .preview');
const picksEl = $('#join .picks');

for (const emoji of PICKS) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = emoji;
  b.setAttribute('aria-label', emoji);
  b.addEventListener('click', () => {
    nameInput.value = emoji;
    updatePreview();
    nameInput.focus();
  });
  picksEl.append(b);
}

function updatePreview() {
  const clean = cleanName(nameInput.value);
  setAvatar(previewEl, clean ?? '');
  previewEl.classList.toggle('empty', !clean);
  joinEl.classList.toggle('ready', !!clean);
}

nameInput.addEventListener('input', updatePreview);
nameInput.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && me()) {
    editing = false;
    render();
  }
});

joinEl.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const clean = cleanName(nameInput.value);
  if (!clean) {
    nameInput.focus();
    return;
  }
  name = clean;
  store.set(local, 'pp:name', clean);
  editing = false;
  if (me()) {
    me()!.name = clean;
    send({ t: 'rename', name: clean });
  } else {
    send({ t: 'join', secret, name: clean });
  }
  nameInput.blur();
  render();
});

let wasEditing = false;
function renderJoin() {
  joinEl.classList.toggle('hidden', !editing);
  if (editing && !wasEditing) {
    nameInput.value = name ?? '';
    previewEl.style.setProperty('--c', seatColor(me()?.seat ?? 0));
    updatePreview();
    if (matchMedia('(pointer: fine)').matches) setTimeout(() => nameInput.focus(), 50);
  }
  wasEditing = editing;
}

// ---------- room link & status ----------

const linkEl = $<HTMLButtonElement>('#link');
const linkIcon = linkEl.querySelector<HTMLElement>('.link-icon')!;
let copiedTimer = 0;
linkEl.querySelector('.link-code')!.textContent = room;
linkEl.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    linkEl.classList.remove('copied');
    void linkEl.offsetWidth;
    linkEl.classList.add('copied');
    linkIcon.textContent = '✅';
    clearTimeout(copiedTimer);
    copiedTimer = window.setTimeout(() => {
      linkIcon.textContent = '🔗';
      linkEl.classList.remove('copied');
    }, 1600);
  } catch {}
});

const fullscreenEl = $<HTMLButtonElement>('#fullscreen');
if (document.fullscreenEnabled && matchMedia('(pointer: coarse)').matches) {
  fullscreenEl.classList.remove('hidden');
  fullscreenEl.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {}
  });
}

let statusTimer = 0;
function renderStatus() {
  clearTimeout(statusTimer);
  const statusEl = $('#status');
  if (online) statusEl.classList.remove('show');
  else statusTimer = window.setTimeout(() => statusEl.classList.add('show'), 1200);
}

// ---------- render ----------

let rendered = false;
function render() {
  g = computeGeometry(innerWidth, innerHeight, seatCount());
  renderTable();
  renderSeats();
  renderCenter();
  renderCards(rendered);
  renderJoin();
  rendered = true;
}

let resizeTimer = 0;
addEventListener('resize', () => {
  document.body.classList.add('resizing');
  render();
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => document.body.classList.remove('resizing'), 150);
});

render();
connect();
