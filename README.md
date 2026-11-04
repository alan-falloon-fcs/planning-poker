# Planning Poker

[![CI](https://github.com/alan-falloon-fcs/planning-poker/actions/workflows/ci.yml/badge.svg)](https://github.com/alan-falloon-fcs/planning-poker/actions/workflows/ci.yml)

A planning-poker table for a team that's already on a call. Pick a card, flip the coin, clear the table.

**Play:** https://planning-poker-qj3s.onrender.com

`/` redirects to a fresh room; share the `/room/XXXXXX` link to invite players.

## Run locally

```sh
npm install
npm start            # builds the client and serves on http://localhost:3000
```

`npm run dev` runs the same server with Vite hot reload. `PORT` overrides the port.

## Behaviour

- Rooms live in memory only. A dropped player keeps their seat and card for 60 seconds; a room with no players is removed after 10 minutes.
- While the coin is face-down the server withholds card values from everyone except the card's owner.
- Initials/emoji are remembered in `localStorage`; the per-room player secret is in `sessionStorage`, so a refresh rejoins the same seat.

## Test

```sh
npm test
npm run typecheck
```

## Deploy

The app runs on a single Render free instance, which sleeps when idle; the first visit after a sleep takes up to a minute and starts with no rooms. It must stay on one instance, since room state is in memory.

- Build command: `npm install && npm run build`
- Start command: `npx tsx server/index.ts`

Render does not deploy on push. Deploy from the Render dashboard with **Manual Deploy**, between games, since a deploy drops every room.

Dependabot opens weekly update PRs; minor and patch updates auto-merge once CI passes.

## License

[MIT](LICENSE) © Farmlands Cooperative Society
