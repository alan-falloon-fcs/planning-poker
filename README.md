# Planning Poker

A planning-poker table for a team that's already on a call. Pick a card, flip the coin, clear the table.

## Run

```sh
npm install
npm start            # builds the client and serves on http://localhost:3000
ngrok http 3000      # share the https URL it prints
```

`npm run dev` runs the same server with Vite hot reload. `PORT` overrides the port.

`/` redirects to a fresh room; share the `/room/XXXXXX` link to invite players.

## Behaviour

- Rooms live in memory only. A dropped player keeps their seat and card for 60 seconds; a room with no players is removed after 10 minutes.
- While the coin is face-down the server withholds card values from everyone except the card's owner.
- Initials/emoji are remembered in `localStorage`; the per-room player secret is in `sessionStorage`, so a refresh rejoins the same seat.

## Test

```sh
npm test
npm run typecheck
```
