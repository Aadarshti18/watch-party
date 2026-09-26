# Watch Party

Watch YouTube videos in sync with friends. Create a room, share the code, and
everyone sees the same play/pause/seek/video exactly when the host or a
moderator triggers it.

**Live app:** `ADD_YOUR_DEPLOYED_URL_HERE` — see [Deployment](#deployment) below;
this repo is ready to deploy but hasn't been deployed for you (no hosting
account was provided).

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Architecture overview](#architecture-overview)
- [Roles & permissions](#roles--permissions)
- [WebSocket event reference](#websocket-event-reference)
- [Running locally](#running-locally)
- [Deployment](#deployment)
- [Testing](#testing)
- [Known limitations / trade-offs](#known-limitations--trade-offs)
- [Code walkthrough cheat sheet](#code-walkthrough-cheat-sheet)

## Features

- Create a room (you become **Host**) or join one with a 6-character code or
  a shareable `/r/<code>` link.
- Real-time sync of play, pause, seek, and video changes via WebSockets
  (Socket.IO), driven by a single server-side source of truth per room.
- Roles: **Host** (auto, room creator), **Moderator** (promoted by host),
  **Participant** (default for joiners, watch-only).
- Host can promote/demote participants, remove participants, and transfer
  host to someone else.
- Backend rejects unauthorized control events server-side (never trusts the
  client) — a Participant emitting `change_video` gets a `FORBIDDEN` error,
  not silent failure.
- **Request-to-control flow**: a Participant can request play/pause/seek/
  change-video; the Host or a Moderator sees the request and can approve
  (it's applied and synced to everyone) or deny it.
- Live participant list showing everyone's role.
- Basic room chat (bonus feature from the brief).
- Deployable as a single service (Express serves the built React app and the
  Socket.IO server together) so you only need one Render/Railway service.

## Tech stack

| Layer     | Technology                          |
| --------- | ------------------------------------ |
| Frontend  | React 18 + TypeScript + Vite         |
| Backend   | Node.js + Express                    |
| Real-time | Socket.IO (WebSocket, with polling fallback) |
| Video     | YouTube IFrame Player API            |
| State     | In-memory on the server (see [Known limitations](#known-limitations--trade-offs)) |

## Project structure

```
watch-party/
├── server/                    # Express + Socket.IO backend
│   ├── src/
│   │   ├── server.js          # entry point: HTTP server, Express, Socket.IO wiring
│   │   ├── models/
│   │   │   ├── Room.js        # one watch-party room: participants, playback, pending requests, chat
│   │   │   └── Participant.js # one connected user
│   │   ├── managers/
│   │   │   └── RoomManager.js # owns all Rooms, socketId -> roomId index
│   │   ├── sockets/
│   │   │   └── socketHandler.js # registers every socket.io event, enforces RBAC
│   │   └── utils/
│   │       ├── roles.js       # role constants + permission-check functions
│   │       └── idGenerator.js # room code / uuid generation
│   └── test-integration.js    # end-to-end test against a running server (see Testing)
└── client/                    # React + TypeScript frontend
    └── src/
        ├── App.tsx             # switches between Home and Room, handles /r/:code links
        ├── socket.ts           # singleton Socket.IO client
        ├── types.ts            # shared TS types mirroring server payloads
        ├── pages/
        │   ├── Home.tsx        # create / join form
        │   └── Room.tsx        # container: owns room state, wires socket events to components
        └── components/
            ├── YouTubePlayer.tsx    # wraps window.YT.Player; the only code that touches it directly
            ├── Controls.tsx         # play/pause/seek/change-video UI
            ├── ParticipantList.tsx  # roster + host-only role/remove/transfer controls
            ├── PendingRequests.tsx  # host/moderator approval queue
            └── Chat.tsx              # room chat
```

## Architecture overview

**One WebSocket connection per browser tab, one Room per party.** The server
holds all state in memory: `RoomManager` owns every `Room`; each `Room` owns
its `Participant`s, its playback state (`videoId`, `playState`,
`currentTime`), a queue of pending control requests, and recent chat
messages. `RoomManager` also keeps a `socketId -> roomId` index so a
disconnect can find and clean up the right room in O(1).

**The server is the single source of truth for playback**, on purpose. When
the host clicks play, the client does *not* update its own player directly —
it emits `play` to the server. The server validates the sender's role,
updates the room's playback state, and broadcasts `sync_state` to *everyone
in the room, including the sender*. Every client (host included) reacts to
`sync_state` the same way, in one place
(`YouTubePlayer.applyRemoteState`). This avoids having two different code
paths ("apply my own action" vs "apply someone else's action") that can
drift out of sync — there's only one path, and the person who triggered the
action just sees their own change come back over the wire a few
milliseconds later.

**Drift correction:** on every `sync_state`, the client compares its
player's actual current time to the server's `currentTime` and only calls
`seekTo` if they differ by more than 1.5 seconds, so small network jitter
doesn't cause visible stutter.

**RBAC is enforced only on the backend.** The frontend disables/relabels
controls for participants as a UX nicety, but every privileged socket event
(`play`, `pause`, `seek`, `change_video`, `assign_role`,
`remove_participant`, `transfer_host`, `approve_request`, `deny_request`)
re-checks the sender's role in `Room.getParticipant(socket.id)` before doing
anything. A participant could open devtools and emit `change_video`
directly — the server still rejects it with a `FORBIDDEN` error.

**Request-to-control** is implemented as its own small workflow rather than
a permission escalation: a Participant's `request_control` event stores a
pending request `{ action, payload }` on the `Room` and notifies only the
host/moderator sockets. `approve_request` re-runs the *exact same*
`applyControlAction()` function used by the direct `play`/`pause`/`seek`/
`change_video` handlers, so approval behaves identically to the host doing
it themselves.

## Roles & permissions

| Role | Assigned by | Can control playback (play/pause/seek/change video) | Can assign roles | Can remove participants | Can transfer host | Can review control requests |
| --- | --- | --- | --- | --- | --- | --- |
| Host | automatic (room creator) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Moderator | Host | ✅ | ❌ | ❌ | ❌ | ✅ |
| Participant | default for joiners | ❌ (must request) | ❌ | ❌ | ❌ | ❌ |

The brief lists "Viewer" as an alias of Participant; this implementation
uses a single `participant` role rather than two identical roles, to keep
every permission check in `server/src/utils/roles.js` unambiguous.

## WebSocket event reference

Event names and payloads follow the brief closely. Two intentional
deviations, both to make the "create vs. join" distinction and the
request-approval requirement explicit and testable:

- The brief's single `join_room` (which auto-assigns Host to the creator) is
  split into **`create_room`** (always Host) and **`join_room`** (always
  Participant). Both use Socket.IO acknowledgement callbacks so the client
  gets a typed success/error response instead of guessing from a broadcast.
- Extra events (`transfer_host`, `request_control`, `approve_request`,
  `deny_request`, `pending_requests_updated`, `request_sent`,
  `request_approved`, `request_denied`, `host_transferred`, `chat_message`)
  implement the brief's optional/bonus items: host transfer, the
  request-to-control requirement, and bonus chat.

| Event | Direction | Payload | Notes |
| --- | --- | --- | --- |
| `create_room` | client → server (ack) | `{ username }` | Creates a room, sender becomes Host |
| `join_room` | client → server (ack) | `{ roomId, username }` | Sender becomes Participant |
| `leave_room` | client → server | `{}` | Explicit leave (socket stays connected) |
| `sync_state` | server → clients | `{ videoId, playState, currentTime, updatedAt }` | Broadcast on every playback change |
| `play` / `pause` | client → server | `{ currentTime }` | Requires Host/Moderator |
| `seek` | client → server | `{ time }` | Requires Host/Moderator |
| `change_video` | client → server | `{ videoId }` | Requires Host/Moderator |
| `assign_role` | client → server | `{ userId, role }` | Host only; role is `moderator` or `participant` |
| `remove_participant` | client → server | `{ userId }` | Host only |
| `transfer_host` | client → server | `{ userId }` | Host only |
| `request_control` | client → server | `{ action, payload }` | Participant asks for one-off control |
| `approve_request` / `deny_request` | client → server | `{ requestId }` | Host/Moderator only |
| `user_joined` / `user_left` | server → clients | `{ userId, username, participants }` | Roster updates |
| `role_assigned` | server → clients | `{ userId, username, role, participants }` | |
| `host_transferred` | server → clients | `{ newHostId, newHostUsername, reason, participants }` | `reason` is `manual_transfer` or `host_disconnected` |
| `participant_removed` | server → clients | `{ userId, participants, youWereRemoved? }` | Removed user gets `youWereRemoved: true` |
| `control_requested` | server → host/mods | pending request object | |
| `pending_requests_updated` | server → host/mods | array of pending requests | |
| `request_sent` / `request_approved` / `request_denied` | server → requester | `{ requestId }` | |
| `chat_message` | both directions | `{ text }` in / full message out | |
| `error` | server → client | `{ event, code, message }` | Sent whenever a permission check or validation fails |

## Running locally

Requires Node.js 18+.

```bash
# 1. Backend
cd server
cp .env.example .env      # defaults are fine for local dev
npm install
npm run dev                # nodemon, http://localhost:4000

# 2. Frontend (separate terminal)
cd client
cp .env.example .env
# set VITE_SERVER_URL=http://localhost:4000 in client/.env
npm install
npm run dev                 # http://localhost:5173
```

Open two browser tabs at `http://localhost:5173`, create a room in one, join
with the room code in the other.

### Single-service mode (what gets deployed)

`server/src/server.js` also serves `client/dist` as static files and falls
back to `index.html` for any non-API route, so in production a single
process serves both the app and the WebSocket endpoint on one origin (no
CORS/URL configuration needed on the client). To run that locally:

```bash
cd client && npm run build     # writes client/dist
cd ../server && npm start      # now serving the built app on :4000
```

## Deployment

These steps deploy the **single-service** setup (one Render/Railway web
service running `server/`, which serves the built client). Any of the
platforms in the brief work; Render is used below because it needs no CLI.

1. Push this repository to GitHub.
2. On [Render](https://render.com), **New → Web Service**, connect the repo.
3. **Root Directory**: repository root (leave blank).
4. **Build Command**:
   ```
   npm install --prefix client && npm run build --prefix client && npm install --prefix server
   ```
5. **Start Command**:
   ```
   npm start --prefix server
   ```
6. **Environment variables**:
   - `NODE_ENV=production`
   - `CLIENT_ORIGIN=*` (same-origin single-service deploy — the frontend and
     backend share a URL, so this can be permissive; tighten it to your
     exact Render URL if you split the services instead)
   - `PORT` — Render sets this automatically; the server already reads
     `process.env.PORT`.
7. Deploy. Render gives you a URL like `https://watch-party-xyz.onrender.com`
   — put that in the **Live app** line at the top of this README once you
   deploy.

**If you'd rather deploy frontend and backend separately** (e.g. frontend on
Vercel/Netlify, backend on Render/Railway): deploy `server/` as its own
service, set `CLIENT_ORIGIN` to your frontend's exact URL, then deploy
`client/` with `VITE_SERVER_URL` set to the backend's URL at build time.

## Testing

`server/test-integration.js` is a real Socket.IO client script (not a mock)
that starts three connections, creates a room, joins it, verifies a
Participant is rejected from `change_video`, promotes a Moderator, exercises
the request/approve flow, removes a participant, and checks chat — against
a running server instance.

```bash
cd server
npm install
npm start &            # start the server first
npm run test:integration
```

All 14 assertions pass against this codebase as submitted.

## Known limitations / trade-offs

- **No database.** Rooms live in server memory and are lost on restart —
  acceptable per the brief ("optional for MVP"). Swapping `RoomManager` for
  a Redis- or Postgres-backed store would be the first step toward
  persistence and horizontal scaling (see the brief's Redis Pub/Sub
  suggestion for multi-instance broadcast).
- **No authentication.** Anyone with a room code can join as a Participant;
  usernames aren't verified. Adding login would mean associating a stable
  user ID with each socket instead of trusting a display name.
- **No reconnect/resume.** If a tab refreshes, that socket disconnects and
  rejoins as a brand-new Participant (losing Host/Moderator status until
  reassigned). A production version would store a resumable session token.
- **Drift correction is threshold-based, not a full clock-sync protocol.**
  It's accurate enough for a casual watch party but two clients on very
  different network conditions could see up to ~1.5s of divergence between
  corrections.
- **Single process.** Fine for the scale in the brief's MVP; the Bonus
  Ideas section's Socket.IO Redis Adapter is the documented path to
  multiple instances.

## Code walkthrough cheat sheet

- **How Socket.IO is used:** `server/src/sockets/socketHandler.js` is the
  only file that touches `io`/`socket` directly. It's a thin dispatcher —
  every handler validates the sender's room/role, mutates a `Room`, and
  either broadcasts (`io.to(room.id).emit(...)`) or targets specific
  sockets (`io.sockets.sockets.get(userId)`), which is how a removed user
  gets a different message than the rest of the room.
- **How React is used:** `Room.tsx` is a container component: it owns all
  server-derived state and passes plain props/callbacks down to
  presentational components (`Controls`, `ParticipantList`,
  `PendingRequests`, `Chat`). `YouTubePlayer.tsx` is the only component that
  calls the YouTube IFrame API directly, exposed to `Room.tsx` via
  `useImperativeHandle` — this is why it's a `forwardRef`.
- **How WebSockets enable real-time sync:** see
  [Architecture overview](#architecture-overview) — single source of truth
  on the server, one reconciliation function on the client used for both
  local and remote changes.
- **How the role-based logic works on the backend:** `utils/roles.js`
  exports one `canX(role)` predicate per permission; `socketHandler.js`
  calls the relevant predicate before mutating anything, and always looks
  up the *current* role from `Room.getParticipant(socket.id)` rather than
  trusting anything the client claims about itself.
- **Deployment choices:** single Express service serves the built SPA and
  the Socket.IO server so there's one URL, no cross-origin WebSocket
  config, and one Render service to manage.
- **Trade-offs:** see [Known limitations](#known-limitations--trade-offs)
  above.
