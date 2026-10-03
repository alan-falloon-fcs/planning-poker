# Story Pointing Cards Game — Project Brief

A simple Sprint Pointing / Planning Poker web app

## Motivation

Existing planning poker sites are complicated, ad-ridden, buggy, or missing basic touches — and they add features nobody asked for while missing simple ones like emoji support.

**What we explicitly don't want:**

- Complicated login / accounts
- Timers
- Plain buttons standing in for cards
- No visual polish — literal text where a visual would do
- Popups or modals
- Cookie-consent banners
- Excessive menus/settings/"modes" (e.g. a dedicated spectator mode)
- Automatic average calculation, or any UI that decides when the round is "done"

The team is already on a call, with the Product Owner (PO) screen-sharing the current issue from their tracker. All the app needs to do is give players an independent, private way to pick a card and reveal it together — like a physical card game, digitized. Estimating the average, calling the round, deciding who plays — that's the PO's job in the room, not the app's.

There is deliberately **no PO role in the code**. Whoever is running the meeting is just a regular player. It's up to the humans in the call to track who has and hasn't played.

## Design Philosophy

- Simple, Lovable, Complete (SLC) — not minimal-viable, not feature-bloated.
- Should feel like playing real cards on a table: nothing appears or disappears instantly, nothing moves at unrealistic speed. Material, physical motion.
- Information is shown on cards/visuals — colorful icons and emoji, not paragraphs of text.
- Responsive across a wide range of window sizes, including small (~1/4 of a desktop screen, sitting alongside a call window and a screen-share).
- One-step join: a player following the link is only ever asked for their initials or an emoji.

## The Game

The game flow and design is essentially the same a real poker app (partypoker). An oval table in the middle, the players avatar on 'seats' around the outside. A global layout. Every client sees the same seat positions, so your seat is wherever the server put you.

There are no fixed rounds or turn, its essentally play any card at any time.

The players hand is shown near the bottom of the screen

Booted after a short timeout.

Max expected players: ~10

### Playing a card

- Click a card in your hand → it plays to the table in front of the players position with a smooth transition.
- Click a different card in your hand while you already have one played → your old card returns to your hand, the new one takes its place on the table.
- Click your own played card on the table → it returns to your hand.
- Click another player's played card → a short shake animation on that card (nothing else happens).

### The Coin

A toggle, face-up or face-down, that controls how *all* played cards are displayed (numbers visible, or hidden behind a card-back pattern).

- Any player can flip it at any time.
- If the coin is face-down when a card is played, that card animates in and sits face-down until the coin is flipped face-up.
- The game never decides when to flip — that's a human decision.

### Clear Cards button

Returns all played cards to their owners' hands. Table is emptied.

### Cards

- Fibonacci 1 to 13.
- Each card shows the owning player's initials/emoji in the top-left corner, and upside-down in the bottom-right corner — visible in both face-up and face-down states, so at a glance you can tell who has and hasn't played, even face-down.
- Face-up: the number is large and centered.
- Face-down: a simple repeating pattern, no number.

### Tabletop background

Green, felt-like texture. Must tile without a visible seam/repeat pattern at normal viewing sizes.

## Sessions & Rooms

- **Ephemeral, in-memory only** — no database, no persistence beyond server process lifetime.
- Visiting the site with no room code redirects to a **new room with a freshly generated random code** (e.g. `/` → `/room/AB12CD`).
- Sharing the resulting URL is how players join — following a room link joins that room (creating it if it's the first visit).
- The server tracks empty rooms and cleans them up after they've been empty for some period.
- **Reconnect support:** if a player's connection drops or they refresh the page, they should be able to rejoin the same room as the same player — same seat, same state.
- **Remembered identity:** the browser should remember the player's chosen initials/emoji so returning to the site (a new room, or a refresh) doesn't ask for it again unless they want to change it.

hosting local with ngrok

## Out of scope

- Accounts, auth, persistence across server restarts.
- Timers, spectator modes, average calculation, "round complete" detection.
