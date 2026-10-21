# Tic-Tac-Toe Pro

A polished, fully responsive Tic-Tac-Toe game that runs entirely in the browser.

- **Player vs Computer** - a local AI with three difficulty levels.
- **Two Players** - share one device.
- **Online Multiplayer** - two people on two devices, playing in real time
  against a server-authoritative PostgreSQL database.

Scores, statistics, match history and preferences are stored locally. The
online mode uses Supabase (PostgreSQL + Auth + Realtime) so that the database -
not the browser - decides whether a move is legal.

> **Working on this project?** Read [`AGENTS.md`](./AGENTS.md) first. It contains the full
> engineering handoff: architecture, invariants that must not be broken, the traps that will
> bite you, the testing conventions and the visual-QA workflow.

---

## Table of contents

- [Features](#features)
- [Technology stack](#technology-stack)
- [Quick start](#quick-start)
- [Environment configuration](#environment-configuration)
- [Online multiplayer setup](#online-multiplayer-setup)
  - [1. Create the Supabase project](#1-create-the-supabase-project)
  - [2. Apply the database migration](#2-apply-the-database-migration)
  - [3. Enable anonymous sign-in](#3-enable-anonymous-sign-in)
  - [4. Configure Realtime](#4-configure-realtime)
  - [5. Configure the frontend](#5-configure-the-frontend)
  - [6. Verify the setup](#6-verify-the-setup)
- [How the online mode works](#how-the-online-mode-works)
- [Database schema](#database-schema)
- [Security model](#security-model)
- [Scripts](#scripts)
- [Testing](#testing)
- [Production build and deployment](#production-build-and-deployment)
- [Testing with two devices](#testing-with-two-devices)
- [Room lifecycle and expiry](#room-lifecycle-and-expiry)
- [Project structure](#project-structure)
- [Game rules](#game-rules)
- [AI difficulty levels](#ai-difficulty-levels)
- [Accessibility](#accessibility)
- [Known limitations](#known-limitations)

---

## Features

**Local modes (always available, no configuration needed)**

- Player vs Computer with an easy, medium and unbeatable hard AI.
- Two players on the same device.
- Scoreboard, per-mode statistics and a 20-entry match history.
- Restart round, new match, settings dialog and optional sound effects.
- Everything persists in `localStorage`.

**Online mode (needs a Supabase project)**

- Create a private room, join one with an eight character code, or open an
  invite link.
- Real-time synchronised board, turn indicator, winner and winning line.
- Server-authoritative moves: the database validates every move.
- Anonymous sign-in - no account, no email, no password.
- Rematches that require both players to agree.
- Automatic reconnection and recovery of the authoritative state.
- Separate statistics for online matches.

## Technology stack

| Concern            | Choice                                              |
| ------------------ | --------------------------------------------------- |
| UI library         | React 19                                             |
| Language           | TypeScript 6 (strict mode)                          |
| Build tool         | Vite 8                                              |
| Styling            | Tailwind CSS 4 (via `@tailwindcss/vite`)            |
| Icons              | lucide-react                                        |
| Online backend     | Supabase (PostgreSQL, Auth, Realtime)               |
| Database access    | `@supabase/supabase-js` (loaded on demand)          |
| Unit tests         | Vitest 5                                            |
| UI tests           | React Testing Library + user-event                  |
| Database tests     | Vitest + PGlite (a real PostgreSQL engine in WASM)  |
| Linting            | ESLint 10 flat config with typescript-eslint        |

## Quick start

```powershell
cd "TIC-TAC-TOE PRO"
npm install
npm run dev
```

Open <http://localhost:5173>. The two local modes work immediately - the online
mode shows a setup notice until it is configured.

## Environment configuration

Copy the template and fill in the values:

```powershell
copy .env.example .env
```

```dotenv
# Supabase project URL - Dashboard -> Project Settings -> API
VITE_SUPABASE_URL=https://abcdefghijklmnop.supabase.co

# Supabase publishable key (formerly the "anon" key) - same page
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxxxxxxxxxx

# The public URL of this application. Used to build invite links.
# Must be the deployed address - never http://localhost.
VITE_APP_URL=https://tic-tac-toe-pro.vercel.app
```

### Let the script fill it in for you

Instead of copying the values by hand, run:

```powershell
npm run setup:env
```

It asks for a **Supabase personal access token**
(*Account Preferences -> Personal Access Tokens*), looks up your project,
fetches the publishable key through the Supabase Management API and writes
`.env` for you.

The token is read with a hidden prompt, kept in memory only, and is never
written to disk, printed, or passed as a command line argument - so it never
ends up in your shell history or in the repository.

Pass the project ref and app URL explicitly if you want to skip the prompts:

```powershell
npm run setup:env -- -ProjectRef abcdefghijklmnop -AppUrl https://my-app.vercel.app
```

> **Every `VITE_` variable is public.** It is bundled into the JavaScript that
> every visitor downloads. Never put the service role key, a database
> password or any other privileged secret in a `VITE_` variable, and never
> commit a filled-in `.env` file. `.env` is already in `.gitignore`.

If the variables are missing or invalid, the application still starts: the
local modes work normally and the online mode shows a panel listing exactly
which variables are missing.

## Online multiplayer setup

Everything below is done **once** in your Supabase project.

### 1. Create the Supabase project

1. Go to <https://supabase.com/dashboard> and create a project.
2. Wait for the database to be provisioned.
3. Keep the dashboard open - you need the project URL and API keys from
   *Project Settings -> API*.

### 2. Apply the database migration

The migration lives in `supabase/migrations/0001_online_multiplayer.sql` and
creates every table, policy and function the online mode needs.

**Option A - Supabase CLI (recommended)**

```powershell
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

**Option B - SQL editor**

1. Open *SQL Editor -> New query* in the Supabase dashboard.
2. Paste the contents of `supabase/migrations/0001_online_multiplayer.sql`.
3. Click *Run*.

**Option C - psql**

```powershell
psql "<your-database-connection-string>" -v ON_ERROR_STOP=1 -f supabase/migrations/0001_online_multiplayer.sql
```

The migration is idempotent: re-running it is safe.

### 3. Enable anonymous sign-in

1. Go to *Authentication -> Providers -> Email*.
2. Turn **Enable anonymous sign-ins** on.
3. (Optional) Turn *Confirm email* off - casual players never see an email.

Without this, the online mode cannot create a guest session and shows
"A guest session could not be created".

You can also flip the switch from the command line:

```powershell
npm run setup:anonymous
```

It asks for a Supabase personal access token, enables the provider through
the Management API and then verifies the result through the public
`/auth/v1/settings` endpoint. The token is read with a hidden prompt and is
never written to disk, printed or passed as a command line argument. The
project ref and publishable key are read from your `.env` automatically.

### 4. Configure Realtime

1. Go to *Realtime -> Realtime Authorization* (or *Settings -> Realtime*) and
   enable **Private channels** authorization.
2. The migration already adds `public.online_rooms` to the
   `supabase_realtime` publication and installs the authorisation policy for
   the private `online-room:<uuid>` channels on `realtime.messages`.

> If you skip this step the game still works: the client falls back to
> polling the authoritative state every 2.5 seconds, and the connection badge
> shows "Sync limited - retrying" instead of "Live".

### 5. Configure the frontend

Fill in `.env` (see [Environment configuration](#environment-configuration)) and
restart the dev server:

```powershell
npm run dev
```

### 6. Verify the setup

Run the database security script in the Supabase SQL editor
(*SQL Editor -> New query*, paste
`supabase/tests/online_multiplayer.sql`, *Run*). It creates two throwaway
users, checks that unauthenticated callers are rejected, that seats are
allocated correctly, that a third player is turned away, that direct table
writes fail, that illegal moves are rejected and that a rematch only starts
when both players agree - and then deletes everything it created.

You should see `PASS:` lines and a final
`DONE: all online multiplayer security checks passed`.

## How the online mode works

```
   Browser A                    Browser B
       |                            |
       |  create_online_room()      |
       |------------------------------>|  PostgreSQL
       |        (room, code)          |  (authoritative state)
       |                            |
       |  submit_online_move(...)    |
       |------------------------------>|  validates + applies ONE move
       |                             |  bumps the version
       |<---- Realtime event --------|
       |  (or the 2.5 s poll)       |
       |  re-read the state          |
```

1. The client authenticates with **anonymous sign-in** and gets a stable user
   id. The id is the only identity - display names are cosmetic labels.
2. `create_online_room()` creates a room with a cryptographically random
   eight character code, seats the creator as **X** and marks the room
   `waiting`.
3. The creator shares the code or the invite link
   (`https://your-app.example/?room=ABCD1234`).
4. The visitor opens the link. The application shows the invitation but
   **never takes a seat automatically** - the visitor has to press
   *Join this room*. This prevents link previewers from occupying a seat.
5. `join_online_room()` seats the second player as **O** under a row lock, so
   two concurrent joins can never take the same seat, and activates the room.
6. Moves go through `submit_online_move(room_code, cell_index,
   expected_version, move_id)`. The function derives the player from
   `auth.uid()`, locks the room row, re-validates the move against the latest
   stored state, applies exactly one move, detects a win or a draw and bumps
   the version.
7. The client subscribes to the room's realtime channel. A realtime event is
   only a *hint* - the client always re-reads the authoritative state, and
   ignores any snapshot whose version is older than the one it already has.
8. A 2.5 second poll runs as a safety net, so the game still synchronises if
   realtime is unavailable or misconfigured.

## Database schema

### `public.online_rooms`

| Column                 | Type          | Notes                                        |
| ---------------------- | ------------- | -------------------------------------------- |
| `id`                   | `uuid`        | Primary key                                  |
| `join_code`            | `text`        | Unique, 8 characters of a 32 character alphabet (2^40) |
| `status`               | `text`        | `waiting` / `active` / `finished` / `expired` |
| `board`                | `text[]`      | Exactly 9 cells, each `null`, `X` or `O`     |
| `current_turn`         | `text`        | `X` or `O`                                   |
| `winning_combination`  | `integer[]`   | The three winning cell indexes               |
| `winner_symbol`        | `text`        | `X`, `O` or `null`                           |
| `result`               | `text`        | `X`, `O`, `draw` or `null`                   |
| `version`              | `integer`     | Monotonically increasing, used for ordering  |
| `round_number`         | `integer`     | 1 based                                       |
| `last_move_index`      | `integer`     | 0-8                                          |
| `moves_played`         | `integer`     | 0-9                                          |
| `created_at`/`updated_at`/`expires_at` | `timestamptz` |       |

### `public.online_room_players`

| Column             | Type      | Notes                                            |
| ------------------ | --------- | ------------------------------------------------ |
| `room_id`          | `uuid`    | Primary key with `user_id`                       |
| `user_id`          | `uuid`    | The Supabase auth user                           |
| `player_symbol`    | `text`    | `X` or `O`; unique per room (deferrable)         |
| `display_name`     | `text`    | Optional, max 24 characters, no control chars    |
| `is_owner`         | `boolean` | Exactly one owner per room                       |
| `rematch_requested`| `boolean` | Both flags set = the new round starts            |
| `joined_at`/`last_seen_at` | `timestamptz` |                                    |

### `public.online_moves`

An append-only audit log with a unique `(room_id, move_id)` pair. The unique
constraint is what makes a retried move idempotent.

### Functions

| Function                            | Purpose                                                   |
| ----------------------------------- | --------------------------------------------------------- |
| `create_online_room(display_name)`  | Creates a room, seats the caller as X                     |
| `join_online_room(code, name)`      | Seats the caller as O, activates the room                 |
| `get_online_room_state(code)`       | Reads the authoritative state (members only)              |
| `submit_online_move(code, cell, version, move_id)` | Validates and applies exactly one move         |
| `request_online_rematch(code)`      | Requests/accepts a rematch                                |
| `leave_online_room(code)`           | Leaves the room                                            |
| `online_expire_rooms()`             | Marks abandoned rooms as expired (operations only)        |

## Security model

- **The browser never writes game state.** `online_rooms`, `online_room_players`
  and `online_moves` have no `INSERT`/`UPDATE`/`DELETE` policy for the
  `authenticated` role, and their write privileges are revoked. A client can
  only `SELECT` the rows of a room it belongs to.
- **Every mutation is a `SECURITY DEFINER` function** with a fixed
  `search_path` (`public, pg_temp`). The player identity always comes from
  `auth.uid()` - never from a client supplied value. A client cannot choose
  its own symbol, its own seat or declare itself the winner.
- **The public execute grant is revoked** and only `authenticated` may call
  the game functions. The `anon` role (requests without a session) can do
  nothing at all.
- **Row Level Security** limits every read to the caller's own room. The
  `online_is_room_member()` helper is `SECURITY DEFINER` so the policies can
  call it without recursing.
- **Atomic transitions.** The room row is locked (`FOR UPDATE`) while a move is
  applied, and a compare-and-swap version check rejects a move that was based
  on an outdated board.
- **Idempotency.** Each move carries a client generated UUID. A retry with the
  same id is recognised and never applied twice.
- **Private rooms.** A room code is 40 bits of entropy generated by the
  database from the operating system CSPRNG (`gen_random_uuid()`), and rooms
  expire after two hours.
- **Rate limiting.** At most 20 rooms per user per hour. Brute forcing a code
  is additionally bounded by the 2^40 code space and by Supabase's API rate
  limits.
- **No personal data.** Only a user id and an optional display name are stored.
  No emails, no IP addresses, no auth metadata. The opponent never sees
  anything but the name and the symbol.

## Scripts

| Script                   | Description                                                |
| ------------------------ | ---------------------------------------------------------- |
| `npm run dev`            | Start the Vite development server.                          |
| `npm run build`          | Type check and create a production build in `dist/`.        |
| `npm run preview`        | Serve the production build locally on port 4173.            |
| `npm run lint`           | Run ESLint over the whole project.                          |
| `npm run typecheck`      | Run the TypeScript compiler in project reference mode.      |
| `npm test`               | Start Vitest in watch mode.                                 |
| `npm run test:run`       | Run the test suite once and exit (CI friendly).             |
| `npm run test:coverage`  | Run the test suite with a coverage report.                  |
| `npm run test:db`        | Run only the database security tests.                       |
| `npm run test:online`    | Run only the online multiplayer tests.                      |

## Testing

```powershell
npm run test:run
```

The suite has 226 tests in 13 files:

- **Game logic** (`src/game/gameLogic.test.ts`) - all winning lines for both
  symbols, draw detection, win-over-draw precedence, invalid moves,
  immutability.
- **AI** (`src/game/ai.test.ts`) - easy/medium/hard behaviour, and an
  exhaustive proof that the hard AI never loses in any legally reachable game.
- **Reducer** (`src/game/gameReducer.test.ts`) - turn alternation, scoring
  exactly once, per-mode score books, round/match flows, the online snapshot
  path (including the version guard that stops an out-of-order event from
  rolling the board back).
- **Storage** (`src/utils/storage.test.ts`) - schema validation, the v1 to v2
  migration, corrupted JSON, blocked `localStorage`.
- **Sound** (`src/utils/sound.test.ts`) - Web Audio behaviour and failure
  tolerance.
- **Online module** (`src/online/*.test.ts`) - room codes, invite links,
  configuration validation, the API layer, the error mapping and the room
  controller (realtime subscription, polling fallback, reconnect, move
  idempotency).
- **Application** (`src/App.test.tsx`, `src/App.online.test.tsx`) - the local
  modes, the online lobby, room creation, joining, invite links, rematch,
  connection status and the missing-configuration state.
- **Database** (`supabase/tests/online_multiplayer.test.ts`) - the **real
  migration** executed against a real PostgreSQL engine (PGlite) with a small
  Supabase shim. It proves that unauthenticated callers are rejected, that
  seats are allocated correctly, that a third player is turned away, that
  direct table writes fail, that illegal moves are rejected, that a retried
  move is applied only once and that a rematch needs both players.
- **SQL script** (`supabase/tests/online_multiplayer_sql.test.ts`) - executes
  the exact `supabase/tests/online_multiplayer.sql` script you paste into the
  Supabase SQL editor, so the script itself is verified and not just the
  Vitest assertions.

## Production build and deployment

```powershell
npm run build
npm run preview
```

`npm run build` runs `tsc -b && vite build` and writes an optimised static
site to `dist/`. The Supabase client is code-split, so it is only downloaded
when the online mode is actually used.

**Vercel**

```powershell
npm i -g vercel
vercel --prod
```

`vercel.json` is included (framework `vite`, build command `npm run build`,
output directory `dist`), so the Vercel Git integration also works with no
manual configuration.

**Netlify**

```powershell
npm i -g netlify-cli
netlify deploy --build --prod
```

`netlify.toml` is included with the build command and publish directory.

Set the three environment variables in the hosting dashboard (they are baked
into the build at deploy time):

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_APP_URL=https://<your-deployed-domain>
```

## Testing with two devices

1. Deploy the app and make sure `VITE_APP_URL` matches the deployed address.
2. Open the deployed URL on device A, choose **Online**, press
   **Create private room**.
3. Press **Copy invite link** and send the link (or the room code) to device
   B.
4. On device B open the link. The invitation is shown - press
   **Join this room**.
5. Both boards now show the same state. A move on one device appears on the
   other within a fraction of a second (or within 2.5 s if realtime is
   unavailable).

You can also open the same room in two different browser profiles on one
machine - but two devices is the honest test.

## Room lifecycle and expiry

| Event                            | Result                                                            |
| -------------------------------- | ----------------------------------------------------------------- |
| Room created                     | `waiting`, expires after 2 hours                                  |
| Second player joins              | `active`                                                           |
| A player leaves a waiting room   | The room becomes `expired`                                         |
| A player leaves an active match  | The match ends (`finished`). **No forfeit win is awarded.**        |
| The last player leaves           | The room becomes `expired`                                         |
| A round finishes                 | The room stays `finished` until a rematch is agreed                |
| Both players request a rematch   | A new round starts, the board is cleared, the **X symbol alternates** |

Expired rooms are not deleted automatically. Run
`select public.online_expire_rooms();` from the SQL editor, or schedule it
with `pg_cron` in Supabase:

```sql
select cron.schedule(
  'expire-online-rooms',
  '*/10 * * * *',
  'select public.online_expire_rooms();'
);
```

Rooms are never deleted while they are active, so a live match can not be
removed by the cleanup job.

## Error messages

The database raises a controlled `online:<code>` error and the client maps it
to a friendly message. SQL errors, stack traces and secrets are never shown.

| Code | What happened | What the player sees |
| --- | --- | --- |
| `unauthenticated` | No session, or it expired | "Your session expired. Reload the page to start a new anonymous session." |
| `rate_limited` | Too many rooms created in an hour | "Too many attempts. Please wait a minute and try again." |
| `invalid_code` | The code is not eight valid characters | "That room code is not valid. Codes are eight characters, for example ABCD-1234." |
| `room_not_found` | No room with that code | "No room with that code was found. Check the code and try again." |
| `room_expired` | The room is older than two hours | "That room has expired. Create a new one instead." |
| `room_finished` | The match is already over | "That match has already finished." |
| `room_full` | Two players are seated | "That room is already full - two players are seated." |
| `already_in_room` | The visitor already has a seat | "You already have a seat in this room." |
| `not_a_member` | The visitor is not in the room | "You are not a player of this room." |
| `game_not_active` | The room is not active | "The match is not running." |
| `game_finished` | A result already exists | "The match is already over." |
| `game_not_finished` | A rematch was requested too early | "A rematch can only be requested once the match is over." |
| `not_your_turn` | It is the opponent's turn | "It is not your turn." |
| `stale_version` | The board changed on the other device | "The board changed on the other device. The latest position has been loaded." |
| `cell_taken` | The cell was just taken | "That cell was just taken." |
| `invalid_cell` | The index is not 0-8 | "That is not a valid cell." |
| `invalid_move_id` | The idempotency key was missing | "The move could not be identified. Please try again." |
| `code_generation_failed` | Five code collisions in a row | "The room code could not be generated. Please try again." |
| `network` | The request could not be sent | "The connection failed. Check your network and try again." |
| `unknown` | Anything else | "Something went wrong. Please try again." |

## Responsive design

- Mobile first, from a **320 px** viewport upwards - there is no horizontal
  overflow at 320 px in any of the three modes.
- The board is always square: `max-w-[min(92vw,26rem)] md:max-w-[min(92vw,30rem)]`
  with `aspect-square` cells, so all nine cells stay easy to tap.
- Controls wrap instead of scrolling, dialogs are capped at
  `calc(100dvh - 1.5rem)` and scroll internally.
- Safe areas are respected via `env(safe-area-inset-bottom)`.
- Desktop uses a two column layout; the board stays the primary focus and the
  statistics and history move into a sidebar.

## Project structure

```text
.
├── index.html                     # HTML entry point
├── vite.config.ts                 # Vite + Tailwind + Vitest configuration
├── tsconfig.json                  # TypeScript project references
├── tsconfig.app.json              # App TypeScript configuration (strict)
├── tsconfig.node.json             # Build tooling TypeScript configuration
├── eslint.config.js               # ESLint flat configuration
├── vercel.json                    # Vercel deployment configuration
├── netlify.toml                   # Netlify deployment configuration
├── .env.example                   # Public environment variable template
├── public/
│   └── favicon.svg                # Local SVG favicon (no remote assets)
├── supabase/
│   ├── config.toml                # Supabase CLI project configuration
│   ├── migrations/
│   │   └── 0001_online_multiplayer.sql   # Schema, RLS and the game functions
│   └── tests/
│       ├── harness.ts             # Local PostgreSQL harness (PGlite + shim)
│       ├── online_multiplayer.test.ts    # Database security tests
│       ├── online_multiplayer_sql.test.ts# Runs the SQL editor script
│       └── online_multiplayer.sql        # Paste-into-the-SQL-editor script
└── src/
    ├── main.tsx                   # React entry point
    ├── App.tsx                    # Application shell and state wiring
    ├── components/
    │   ├── ConfirmDialog.tsx      # Destructive action confirmation
    │   ├── Dialog.tsx             # Reusable accessible modal dialog
    │   ├── GameBoard.tsx          # 3x3 board, roving tab index, arrow keys
    │   ├── GameCell.tsx           # A single accessible board cell
    │   ├── GameControls.tsx       # Mode, difficulty, restart, new match
    │   ├── GameHeader.tsx         # Brand, mode indicator, sound and settings
    │   ├── GameResult.tsx         # Round outcome banner (live region)
    │   ├── MatchHistory.tsx       # Recent completed rounds
    │   ├── MatchStats.tsx         # Per-mode statistics
    │   ├── ScoreBoard.tsx         # Current match score
    │   ├── SegmentedControl.tsx   # Radio group styled as a segmented control
    │   ├── SettingsDialog.tsx     # Preferences and statistics reset
    │   ├── Toggle.tsx             # Accessible switch
    │   ├── TurnIndicator.tsx      # Whose turn it is (live region)
    │   └── online/
    │       ├── OnlineActions.tsx      # Rematch and leave controls
    │       ├── OnlineLobby.tsx        # Create / join / invitation
    │       ├── OnlinePlayersBar.tsx   # Both players and the connection state
    │       ├── OnlineSetupNotice.tsx  # "Not configured" panel
    │       └── OnlineWaitingRoom.tsx  # Room code, copy, share, leave
    ├── game/
    │   ├── ai.ts                  # Easy / medium / hard computer opponent
    │   ├── gameLogic.ts           # Pure rules engine (no React, no DOM)
    │   ├── gameReducer.ts         # Central state machine and selectors
    │   └── types.ts               # Shared domain types
    ├── hooks/
    │   └── usePersistentState.ts  # De-duplicated localStorage persistence
    ├── online/
    │   ├── config.ts              # Environment validation
    │   ├── onlineApi.ts           # Typed wrappers around the RPC functions
    │   ├── roomCode.ts            # Room codes and invite links
    │   ├── supabase.ts            # Lazily loaded Supabase client
    │   ├── useOnlineRoom.ts       # Room controller (realtime + polling)
    │   └── useOnlineSession.ts    # Anonymous sign-in
    ├── styles/
    │   └── index.css              # Tailwind import, design tokens, motion
    ├── test/
    │   ├── fakeSupabase.ts        # Controllable fake Supabase client
    │   └── setup.ts               # Vitest / Testing Library setup
    └── utils/
        ├── clipboard.ts           # Clipboard and Web Share with fallbacks
        ├── sound.ts               # Web Audio API sound effects
        └── storage.ts             # Versioned, validated persistence layer
```

## Game rules

Standard Tic-Tac-Toe:

- The board has nine cells, each holding `X`, `O` or nothing.
- `X` always moves first in a new round. In the online mode the creator of a
  room is X; in a rematch the symbols alternate.
- Players alternate and may only select empty cells.
- A finished round never accepts another move.
- A player wins by occupying three cells in a row, a column or a diagonal:
  - rows: `0-1-2`, `3-4-5`, `6-7-8`
  - columns: `0-3-6`, `1-4-7`, `2-5-8`
  - diagonals: `0-4-8`, `2-4-6`
- If all nine cells are taken and nobody has a line, the round is a draw.
- A win always takes precedence over a full board.

## AI difficulty levels

- **Easy** - picks a uniformly random legal cell.
- **Medium** - takes an immediate win, otherwise blocks an immediate opponent
  win, otherwise prefers the center, then a corner, then any legal cell.
- **Hard** - minimax with memoisation. It never loses against an optimal
  opponent, prefers faster wins and slower losses, and breaks ties between
  equally optimal moves pseudo-randomly.

## Accessibility

- Semantic HTML with a logical heading structure and labelled sections.
- The board is a single tab stop with a roving tab index. `Arrow` keys move
  the focus, `Enter` and `Space` place a symbol.
- Cells expose their position and content via `aria-label` and their state via
  `aria-disabled`.
- Turn changes, round results and connection changes are announced through
  `role="status"` live regions.
- Dialogs use `role="dialog"` with `aria-modal`, move focus inside, trap
  `Tab`, close on `Escape` and restore focus to the trigger.
- X and O differ by shape (a cross and a circle), not only by colour.
- `prefers-reduced-motion: reduce` disables the animations.

## Known limitations

- **Anonymous sessions are device/browser specific.** The Supabase session is
  stored in the browser. Clearing site data, using a private window or
  switching browser means you get a new identity and can no longer reclaim a
  previous seat. There is no recovery mechanism - a player who loses the
  session cannot be impersonated either, they simply become a new guest and
  the old seat stays empty until the room expires.
- The online mode needs a Supabase project. Without one the online mode is
  disabled with a clear setup message; the local modes are unaffected.
- Realtime presence is best effort. A player whose browser closes may still
  look "online" for a moment. Presence is never used to award a win.
- The client falls back to polling every 2.5 seconds if realtime is
  unavailable. The game still works, just with a slightly higher latency.
- Rooms expire after two hours. There is no automatic deletion - run
  `online_expire_rooms()` (see above).
- Anonymous sign-in is enabled per Supabase project. If it is disabled the
  online mode cannot create a guest session.
- For a public deployment, add a CAPTCHA (for example Cloudflare Turnstile)
  in front of the room creation endpoint - anonymous sign-in alone does not
  prevent scripted abuse.
- The room history is capped at 20 entries; the statistics live in the browser
  profile of each player.
- Online statistics are stored **locally per browser**. They are not
  synchronised between devices and are not global.
- The hard AI search is specific to the 3x3 board.
- Sound effects use the Web Audio API. Some browsers block audio until the
  first interaction; the game is unaffected and simply stays silent.
