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

**Live demo:** <https://tic-tac-toe-pro-eosin.vercel.app/>

---

## Table of contents

- [Features](#features)
- [Technology stack](#technology-stack)
- [Quick start](#quick-start)
- [Environment configuration](#environment-configuration)
- [Development tooling](#development-tooling)
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
- [Error messages](#error-messages)
- [Scripts](#scripts)
- [Testing](#testing)
- [Production build and deployment](#production-build-and-deployment)
- [Testing with two devices](#testing-with-two-devices)
- [Room lifecycle and expiry](#room-lifecycle-and-expiry)
- [Responsive design](#responsive-design)
- [Project structure](#project-structure)
- [Game rules](#game-rules)
- [AI difficulty levels](#ai-difficulty-levels)
- [Sound and motion](#sound-and-motion)
- [Accessibility](#accessibility)
- [Known limitations](#known-limitations)

---

## Features

**Local modes (always available, no configuration needed)**

- Player vs Computer with an easy, medium and unbeatable hard AI.
- Two players on the same device.
- Board sizes from 3×3 up to 10×10 (100 cells), chosen from presets or with
  custom rows and columns. The win length adapts (3 on 3×3, 4 up to 7×7, 5 above
  that) and so does the AI: full minimax on 3×3, four plies up to 16 cells and a
  line heuristic above that, so even a 10×10 reply arrives in a few milliseconds.
- Scoreboard, per-mode statistics and a 20-entry match history.
- Restart round, new match, settings dialog and optional sound effects.
- Everything persists in `localStorage`.
- **Arcade feel:** an elastic pop with a shockwave ring and a 2px screen kick on
  every mark, a hand-drawn X, a lime→cyan laser line with glow on the winning
  row and eighteen confetti pieces, a breathing border on the empty cells of a
  small grid, a bouncing score with a floating `+1`, and a full Web Audio sound
  engine (see [Sound and motion](#sound-and-motion)).

**Online mode (needs a Supabase project)**

- Create a private room, join one with an eight character code, or open an
  invite link.
- **Roles and permissions:** the creator is the **host** (X) and owns the room,
  its code and the invite link; the joiner is the **guest** (O) and can only
  play and leave (plus accept a rematch the host requested). The host leaving
  closes the room and invalidates the link; the guest is returned to the lobby
  with a "Host left" message and is never promoted. A guest leaving frees the
  seat so the host can invite someone else with the same code. A third visitor
  of a full room is told "Room is full".
- Choose the board size first: 3x3 up to 10x10 (100 cells), from presets or with
  custom rows and columns. The room stores the geometry, so both players always
  play the same board and the same win length (3 on 3x3, 4 up to 7x7, 5 above).
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
| Sound              | Web Audio API - custom engine, no audio assets      |

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
# OPTIONAL - leave it empty and the app uses the address the player is
# currently on, which is always correct. Set it to pin the domain.
# Never use http://localhost here.
VITE_APP_URL=
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

### The database connection (CLI only)

The Supabase CLI needs the **direct** database credentials. They are not needed
by the app and must never reach the browser, so they live in a separate,
git-ignored `.env.local`:

```dotenv
# Transaction mode pooler (IPv4 friendly) - the app / short queries
DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true"

# Session mode pooler - use THIS one for `supabase db push`
DIRECT_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"

SUPABASE_DB_PASSWORD=<password>
```

> The direct host `db.<ref>.supabase.co` is IPv6-only on many projects and often
> unreachable. Use the pooler. If the wrong region is used the server answers
> *"tenant/user ... not found"*.

`.env.local` is git-ignored, and `src/test/secrets.test.ts` fails the build if
any commit-able file ever contains a secret key or a password-bearing
connection string.

## Development tooling

| Tool | What it is for |
| --- | --- |
| **Supabase CLI** | Migrations (`db push`), type generation (`gen types`), SQL queries. |
| **Supabase MCP server** | Lets an AI agent query the database, apply migrations and read advisors. Add it to `~/.config/opencode/opencode.json`, then run `opencode mcp auth supabase`. |
| **Playwright MCP** | Gives an AI agent a real browser: navigate, click by accessible name, snapshot, screenshot. Far better than a screenshot-only workflow. `npm i -g @playwright/mcp@latest`, then add it to the same config file. |
| **Supabase Agent Skills** | Guidance for agents working with Supabase. Installed in `.agents/skills/` and pinned in `skills-lock.json`. |
| **PGlite** | A real PostgreSQL engine in WASM. The database security tests run the **actual migration** against it, so no Docker and no hosted project are needed. |

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

The migrations live in `supabase/migrations/` and create every table, policy
and function the online mode needs:

| File | What it adds |
| --- | --- |
| `0001_online_multiplayer.sql` | The whole backend: tables, RPCs, RLS, grants, realtime |
| `0002_online_moves_user_index.sql` | Index for the `online_moves.user_id` foreign key |
| `0003_online_board_size.sql` | `rows` / `cols` / `win_length` on rooms, geometry-aware win detection |
| `0004_online_room_permissions.sql` | `closed` room status, role-aware leave (host closes, guest frees the seat), closed rooms refuse joins |

**Option A - Supabase CLI (recommended)**

```powershell
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

> The **direct** database host (`db.<ref>.supabase.co`) is often unreachable from
> residential networks, because it is IPv6-only on many projects. The
> **pooler** host works everywhere:
>
> ```powershell
> supabase db push --db-url "postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres"
> ```
>
> `<region>` is the project's region (Supabase -> Project Settings -> Database).
> You can find it by trying the pooler hosts until one does not answer
> *"tenant/user not found"*.

**Option B - SQL editor**

1. Open *SQL Editor -> New query* in the Supabase dashboard.
2. Paste the contents of `supabase/migrations/0001_online_multiplayer.sql`.
3. Click *Run*.
4. Repeat for `0002_online_moves_user_index.sql`,
   `0003_online_board_size.sql` and `0004_online_room_permissions.sql`, in that order.

**Option C - psql**

```powershell
psql "<your-database-connection-string>" -v ON_ERROR_STOP=1 -f supabase/migrations/0001_online_multiplayer.sql
psql "<your-database-connection-string>" -v ON_ERROR_STOP=1 -f supabase/migrations/0002_online_moves_user_index.sql
psql "<your-database-connection-string>" -v ON_ERROR_STOP=1 -f supabase/migrations/0003_online_board_size.sql
psql "<your-database-connection-string>" -v ON_ERROR_STOP=1 -f supabase/migrations/0004_online_room_permissions.sql
```

Every migration is idempotent: re-running it is safe.

### Verifying the hosted database

After any change to the migration, re-apply it and check the result:

```powershell
# apply (session-mode pooler, from .env.local)
supabase db push --db-url "<session mode pooler url>"

# verify every object, policy, grant and privilege
npm run verify:db
```

`verify:db` runs `supabase/tests/verify_hosted.sql` against the project and
compares every value with what the migration produces - the table count, the
function count, the RLS policies, the realtime publication, the function
grants, the `search_path` pinning and the `online_room_payload` lock. It exits
non-zero on any mismatch, so it can be used in CI.

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
   `waiting`. The board size the creator picked in the lobby is stored on the
   room (`rows`, `cols`, `win_length`); the win length is derived by the
   database, never taken from the browser.
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

### Room permissions (TIC-006)

A room has exactly **two roles**, and the role is decided by the database, never
by the browser:

| Role | Who | Can |
| --- | --- | --- |
| **Host** | the creator - seated as X, `is_owner = true` | Create the room, copy the code, copy the invite link, share it, play, leave (= close the room), start a rematch, accept a rematch |
| **Guest** | the joiner - seated as O through the code or the `?room=` link | **Play and leave only**, and accept a rematch the host asked for |
| **Spectator** | a third visitor of a full link (no seat) | Leave |
| **Lobby** | not in a room | Create a room, join a room, choose the board size |

The guest can **not** create a room while inside one, copy the code or the
invite link, share it, change the board size, delete the room or kick anyone.
Those controls are hidden in the UI, `useOnlineRoom.createRoom` refuses the
call when a room is already open, and the database refuses the write paths
anyway (all table write privileges are revoked - every mutation goes through a
`SECURITY DEFINER` function).

How leaving works:

- **The host leaves** - the room becomes `closed` immediately. The invite link
  is dead (re-opening it says "This room is closed or the host left"), the guest
  sees *"Host left the room"* for three seconds and is returned to the lobby.
  The guest is **never** promoted to host.
- **The guest leaves** - the guest seat is freed, the board is reset and the
  room goes back to `waiting`. The host stays in the waiting room with the same
  code and can invite somebody else.
- **Both leave** - the room is closed and the code can never be used again.
- **Refresh** - the role is re-derived from `online_room_players.is_owner`, so a
  guest who reloads the page is still a guest.
- **Third visitor** - a full room answers `online:room_full`
  ("That room is already full - two players are seated").

Room status is one of `waiting`, `active`, `finished`, `expired`, `closed`.

### Playing with a friend

1. The **host** switches to *Online*, picks a board size in the lobby (3×3 up to
   10×10, with the live `6×6 • 4 to win` badge) and presses *Create private
   room*.
2. The host copies the invite link (or the code) from the waiting room and sends
   it over any chat app.
3. The **guest** opens the link and sees the guest banner - *"You are joining as
   Guest (O) - you can only play and leave"* - then presses *Join this room*.
   Nothing is taken automatically, so link previewers cannot steal the seat.
4. They play. Only the player whose turn it is can move, and the database
   decides whether the move is legal.
5. If the **host leaves**, the room closes and the link stops working; the guest
   is told *"Host left the room"* and returns to the lobby.
6. If the **guest leaves**, the host stays in the waiting room with the same
   code and can invite a new opponent.
7. A third person opening a full link is told *"That room is already full - two
   players are seated"*.

## Database schema

### `public.online_rooms`

| Column                 | Type          | Notes                                        |
| ---------------------- | ------------- | -------------------------------------------- |
| `id`                   | `uuid`        | Primary key                                  |
| `join_code`            | `text`        | Unique, 8 characters of a 32 character alphabet (2^40) |
| `status`               | `text`        | `waiting` / `active` / `finished` / `expired` / `closed` |
| `rows`                 | `integer`     | 3-10, chosen by the creator, never changed   |
| `cols`                 | `integer`     | 3-10, `rows * cols` at most 100              |
| `win_length`           | `integer`     | 3, 4 or 5, derived from the shape            |
| `board`                | `text[]`      | Exactly `rows * cols` cells, each `null`, `X` or `O` |
| `current_turn`         | `text`        | `X` or `O`                                   |
| `winning_combination`  | `integer[]`   | The `win_length` winning cell indexes        |
| `winner_symbol`        | `text`        | `X`, `O` or `null`                           |
| `result`               | `text`        | `X`, `O`, `draw` or `null`                   |
| `version`              | `integer`     | Monotonically increasing, used for ordering  |
| `round_number`         | `integer`     | 1 based                                       |
| `last_move_index`      | `integer`     | 0 to `rows * cols - 1`                       |
| `moves_played`         | `integer`     | 0 to `rows * cols`                           |
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
| `create_online_room(display_name, rows, cols)` | Creates a room of that size, seats the caller as X |
| `join_online_room(code, name)`      | Seats the caller as O, activates the room                 |
| `get_online_room_state(code)`       | Reads the authoritative state (members only)              |
| `submit_online_move(code, cell, version, move_id)` | Validates and applies exactly one move         |
| `request_online_rematch(code)`      | Requests/accepts a rematch                                |
| `leave_online_room(code)`           | Leaves the room                                            |
| `online_expire_rooms()`             | Marks abandoned rooms as expired (operations only)        |
| `online_purge_expired_rooms(interval)` | Deletes long-expired rooms and their move log (operations only) |

## Security model

### A note on `supabase db advisors`

Supabase's own linter reports one warning on this project:

> **Signed-In Users Can Execute SECURITY DEFINER Function** (7 findings)

**This is expected and intentional.** The six game functions
(`create_online_room`, `join_online_room`, `get_online_room_state`,
`submit_online_move`, `request_online_rematch`, `leave_online_room`) plus the
`online_is_room_member` helper are `SECURITY DEFINER` **on purpose**:

- They are the *only* way a client can touch the game state. The tables have
  no write policies, so without `SECURITY DEFINER` the functions could not
  write the board.
- They must derive the player from `auth.uid()` and enforce every rule
  server-side, which is exactly what `SECURITY DEFINER` enables.
- They are guarded by strict authorisation inside the function body
  (membership, turn, version, cell) and by the RLS policies on the tables.

The linter's own remediation text says *"Revoke `EXECUTE` … **if that is not
intentional**."* Here it is intentional — the `anon` role can call none of
them, and the one `SECURITY DEFINER` function that must not be client-callable
(`online_room_payload`, which takes an arbitrary user id) is revoked from every
client role. `npm run verify:db` asserts exactly that.

The linter also reports two `unused_index` INFO notices. Both indexes are
needed (`online_rooms_expires_at_idx` for the expiry sweep,
`online_moves_user_id_idx` for the foreign key); they are only "unused"
because the tables are still empty.

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
  nothing at all. The internal `online_room_payload()` builder is `SECURITY
  DEFINER` and takes an arbitrary user id, so its execute grant is revoked
  from every client role - otherwise a caller could read any room directly
  and bypass RLS entirely.
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
| `npm run verify:db`      | Check the hosted database against the migration.            |
| `npm run gen:types`      | Regenerate `src/online/database.types.ts` from the schema.  |
| `npm run setup:env`      | Generate `.env` from the Supabase Management API.           |
| `npm run setup:anonymous`| Enable anonymous sign-ins on your Supabase project.         |

## Testing

```powershell
npm run test:run
```

The suite has 314 tests in 15 files:

- **Game logic** (`src/game/gameLogic.test.ts`) - all winning lines for both
  symbols, draw detection, win-over-draw precedence, invalid moves,
  immutability, and the dynamic board sizes (the win length table, the 3-10 / 100
  cell limits, generated lines, row/column/diagonal wins on 4×4 and 10×10, and
  that four in a row is not enough on a 10×10 board).
- **AI** (`src/game/ai.test.ts`) - easy/medium/hard behaviour, an exhaustive
  proof that the hard AI never loses on 3×3 in any legally reachable game, and
  the big-board behaviour (a 10×10 answer in under half a second, completing and
  blocking five in a row).
- **Reducer** (`src/game/gameReducer.test.ts`) - turn alternation, scoring
  exactly once, per-mode score books, round/match flows, the online snapshot
  path (including the version guard that stops an out-of-order event from
  rolling the board back) and the board size changes.
- **Storage** (`src/utils/storage.test.ts`) - schema validation, the v1 to v2 to
  v3 migrations, a persisted board size, corrupted JSON, blocked `localStorage`.
- **Sound** (`src/utils/sound.test.ts`) - the X sweep, the O low-pass, the win
  arpeggio with its convolver, the draw tremolo, every sound name, the mute flag,
  the hover throttle and the degraded paths (no API, no filter, throwing node).
- **Online module** (`src/online/*.test.ts`) - room codes, invite links,
  configuration validation, the API layer, the error mapping, the host/guest
  permission matrix and the room controller (realtime subscription, polling
  fallback, reconnect, move idempotency, role derivation, host-left return).
- **Application** (`src/App.test.tsx`, `src/App.online.test.tsx`) - the local
  modes, the online lobby, room creation on a chosen board size, joining a room
  of any size, invite links, rematch, connection status, the guest invite card,
  the host-only copy controls and the host-left banner, and the
  missing-configuration state.
- **Database** (`supabase/tests/online_multiplayer.test.ts`) - every migration
  executed in order against a real PostgreSQL engine (PGlite) with a small
  Supabase shim. It proves that unauthenticated callers are rejected, that
  seats are allocated correctly, that a third player is turned away, that
  direct table writes fail, that illegal moves are rejected, that a retried
  move is applied only once, that a rematch needs both players, that the host
  leaving closes the room (and the code can never be joined again) while the
  guest leaving frees the seat and returns the room to `waiting`, and that a room
  keeps the board size it was created with (four in a row on a 6×6, five on a
  10×10, 3×3 when the size is omitted).
- **SQL script** (`supabase/tests/online_multiplayer_sql.test.ts`) - executes
  the exact `supabase/tests/online_multiplayer.sql` script you paste into the
  Supabase SQL editor, so the script itself is verified and not just the
  Vitest assertions.
- **Secret hygiene** (`src/test/secrets.test.ts`) - fails the build if a
  `sb_secret_...` key or a password-bearing connection string ever appears in
  a commit-able file, and checks that `.env` / `.env.local` stay ignored.

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

Set the environment variables in the hosting dashboard (they are baked into
the build at deploy time):

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_APP_URL=                     # optional - leave empty to use the current origin
```

> **`VITE_APP_URL` is optional and safer left empty.** When it is empty the app
> uses `window.location.origin`, i.e. the address the player is actually on.
> That is always right - including on preview deployments - and a stale or
> guessed value can never break the invite links. Set it only if you want to
> pin the domain, and remember that changing it requires a **redeploy**.

> **Do not connect the "Optional Integrations -> Supabase" integration** when
> creating the project. It injects `SUPABASE_URL` / `SUPABASE_ANON_KEY`, which
> Vite does not expose to the browser (only `VITE_`-prefixed variables are),
> and it may create a second, empty Supabase project. Add the three variables
> by hand or press **Import .env**.

## Testing with two devices

1. Deploy the app.
2. Open the deployed URL on device A, choose **Online**, press
   **Create private room**.
3. Press **Copy invite link** and send the link (or the room code) to device
   B.
4. On device B open the link. The invitation is shown - press
   **Join this room**. The seat is never taken automatically, so a link
   preview cannot occupy it.
5. Both boards now show the same state. A move on one device appears on the
   other within a fraction of a second (or within 2.5 s if realtime is
   unavailable).

You can also open the same room in two different browser profiles on one
machine - a normal window and an incognito window are two different anonymous
players, which is enough to exercise the whole flow.

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

To actually reclaim the disk space, purge rooms that have been expired for
more than a day. This removes the room together with its seat rows and its
move log (both cascade):

```sql
select public.online_purge_expired_rooms();          -- default: older than 24 hours
select public.online_purge_expired_rooms('7 days');  -- keep a week of history
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
- The cells are always square. On a phone the board is capped at
  `min(30rem, 100%, 50dvh)` on the classic grid and grows a little (`32rem`,
  then `34rem`) as the grid gets bigger, so a 10×10 board still fits: no
  horizontal overflow, and the page keeps scrolling vertically.
- One column on a phone, in game order: **board → round/turn → score →
  restart/new match → difficulty and board size → match statistics → recent
  rounds**. The two records panels are collapsed behind their own toggle there.
- Three columns from 1024 px (records · board · difficulty and board size), each
  scrolling on its own so the board never drifts off screen.
- The difficulty and board-size pills scroll sideways on a phone instead of
  stacking, so both groups stay in one card.
- Dialogs are capped at `calc(100dvh - 1.5rem)` and scroll internally.
- Safe areas are respected via `env(safe-area-inset-bottom)`.

### Laptop viewport fit

The board used to be sized by width alone, which was fine on a tall 1920×1032
display but pushed the score and the restart buttons below the fold on a
1920×1008 laptop (about 800 px of usable height).

Now, on a desktop (`min-width: 1024px` and `min-height: 600px`), the board is the
only block allowed to give up height:

- `height: 100dvh; overflow: hidden` on `.app-shell` - the page itself never
  scrolls; the three columns scroll internally with the themed thin scrollbar.
- The header is 56 px on a desktop instead of 64 px.
- The board width is
  `min(var(--board-max), 100%, max(12rem, (100dvh - 464px) × cols / rows))`.
  The 464 px is the header, paddings, round/turn row, score and actions that
  must stay visible, so the board shrinks to the leftover height - 480 px on a
  1032 px tall display, 436 px at 900 px, 304 px at 768 px and 256 px at 720 px
  - and the score pills and the restart/new match buttons never leave the first
  fold.
- `cols / rows` keeps non-square grids honest: a 3×10 board gets a wide, short
  frame and a 10×3 board a narrow, tall one. Extremely tall grids stop at 12 rem
  so the cells stay tappable and scroll inside the stage instead.

Verified at 1920×1032, 1920×1008, 1512×982, 1440×900, 1366×768 and 1280×720:
`scrollHeight === clientHeight` for the page and for the centre column, and the
actions row is always the last thing inside the viewport.

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
├── .agents/skills/                # Supabase Agent Skills (dev tooling)
├── skills-lock.json               # Pinned versions of the installed skills
├── public/
│   └── favicon.svg                # Local SVG favicon (no remote assets)
├── scripts/
│   ├── setup-env.ps1              # Generate .env from the Management API
│   ├── setup-anonymous-signin.ps1 # Enable the anonymous sign-in provider
│   ├── verify-database.ps1        # Compare the hosted DB with the migration
│   └── generate-types.ps1         # Regenerate database.types.ts
├── supabase/
│   ├── config.toml                # Supabase CLI project configuration
│   ├── tsconfig.json              # TypeScript config for the SQL tests
│   ├── migrations/
│   │   ├── 0001_online_multiplayer.sql   # Schema, RLS and the game functions
│   │   ├── 0002_online_moves_user_index.sql # Index for the move log FK
│   │   ├── 0003_online_board_size.sql    # Room board size + geometry-aware wins
│   │   └── 0004_online_room_permissions.sql # Host/guest leave rules + closed rooms
│   └── tests/
│       ├── harness.ts             # Local PostgreSQL harness (PGlite + shim)
│       ├── online_multiplayer.test.ts    # Database security tests
│       ├── online_multiplayer_sql.test.ts# Runs the SQL editor script
│       ├── online_multiplayer.sql        # Paste-into-the-SQL-editor script
│       └── verify_hosted.sql            # Hosted database verification query
└── src/
    ├── main.tsx                   # React entry point
    ├── App.tsx                    # Application shell and state wiring
    ├── components/
    │   ├── BoardSizePicker.tsx     # Size pills + steppers (settings rail and lobby)
    │   ├── ConfirmDialog.tsx      # Destructive action confirmation
    │   ├── Dialog.tsx             # Reusable accessible modal dialog
    │   ├── GameBoard.tsx          # Any rows x cols board, roving tab index, arrow keys
    │   ├── GameCell.tsx           # A single accessible board cell
    │   ├── GameControls.tsx       # Settings cards (difficulty, board size) + round actions
    │   ├── GameHeader.tsx         # Brand, mode indicator, sound and settings
    │   ├── GameResult.tsx         # Round outcome banner (live region)
    │   ├── MatchHistory.tsx       # Recent completed rounds
    │   ├── MatchStats.tsx         # Per-mode statistics
    │   ├── RailSection.tsx        # Records panel (collapsible on a phone)
    │   ├── ScoreBoard.tsx         # Current match score
    │   ├── SegmentedControl.tsx   # Radio group styled as a segmented control
    │   ├── SettingsDialog.tsx     # Preferences and statistics reset
    │   ├── Toggle.tsx             # Accessible switch
    │   ├── TurnIndicator.tsx      # Whose turn it is (live region)
    │   └── online/
    │       ├── OnlineActions.tsx      # Rematch and leave (guest accepts only)
    │       ├── OnlineLobby.tsx        # Create / join / invitation
    │       ├── OnlinePlayersBar.tsx   # Both players and the connection state
    │       ├── OnlineSetupNotice.tsx  # "Not configured" panel
    │       └── OnlineWaitingRoom.tsx  # Room code, copy, share, leave
    ├── game/
    │   ├── ai.ts                  # Easy / medium / hard, adaptive to the grid shape
    │   ├── gameLogic.ts           # Pure rules engine; win lines generated per grid
    │   ├── gameReducer.ts         # State machine, scoring, board-size action
    │   └── types.ts               # Shared domain types (incl. BoardSize)
    ├── hooks/
    │   └── usePersistentState.ts  # De-duplicated localStorage persistence
    ├── online/
    │   ├── config.ts              # Environment validation
    │   ├── database.types.ts      # GENERATED from the live schema
    │   ├── onlineApi.ts           # Typed wrappers around the RPC functions
    │   ├── permissions.ts         # Host / guest / lobby permission matrix
    │   ├── roomCode.ts            # Room codes and invite links
    │   ├── supabase.ts            # Lazily loaded Supabase client
    │   ├── useOnlineRoom.ts       # Room controller (realtime + polling)
    │   └── useOnlineSession.ts    # Anonymous sign-in
    ├── styles/
    │   └── index.css              # Tailwind import, design tokens, motion
    ├── test/
    │   ├── fakeSupabase.ts        # Controllable fake Supabase client
    │   ├── secrets.test.ts        # Guard: no key or password ever committed
    │   └── setup.ts               # Vitest / Testing Library setup
    └── utils/
        ├── clipboard.ts           # Clipboard and Web Share with fallbacks
        ├── sound.ts               # Web Audio engine: 10 synthesised arcade sounds
        └── storage.ts             # Versioned persistence (v3 adds the board size)
```

## Game rules

Classic Tic-Tac-Toe on a 3×3 board, extendable to any size from 3×3 to 10×10:

- Every cell holds `X`, `O` or nothing. A board is `rows × cols` cells; the
  limits are 3 to 10 per side and 100 cells in total.
- `X` always moves first in a new round. In the online mode the creator of a
  room is X; in a rematch the symbols alternate.
- Players alternate and may only select empty cells.
- A finished round never accepts another move.
- The number of marks needed to win depends on the board:

  | Board | Marks in a line |
  | --- | --- |
  | 3×3 | 3 |
  | 4×4 up to 7×7 | 4 |
  | 8×8 up to 10×10 | 5 |

  Formally `getWinLength(rows, cols)`: `3` for 3×3, `4` when both sides are at
  most 7, otherwise `5`.
- A win is any straight line (row, column or diagonal) of at least that many
  marks. On the 3×3 board these are exactly the classic eight:
  - rows: `0-1-2`, `3-4-5`, `6-7-8`
  - columns: `0-3-6`, `1-4-7`, `2-5-8`
  - diagonals: `0-4-8`, `2-4-6`
- If every cell is taken and nobody has a line, the round is a draw.
- A win always takes precedence over a full board.
- Changing the board size starts a fresh round (after a confirmation when a
  round is in progress) and keeps the scores and the history.
- In the **online mode** the room carries its own `rows`, `cols` and
  `win_length`, chosen by the creator before the room exists. Both players play
  that geometry and the server validates every move against it.

## AI difficulty levels

- **Easy** - picks a uniformly random legal cell.
- **Medium** - takes an immediate win, otherwise blocks an immediate opponent
  win, otherwise prefers the centre, then a corner, then any legal cell.
- **Hard** - adapts to the board:
  - **3×3** - full minimax with memoisation. It never loses against an optimal
    opponent, prefers faster wins and slower losses, and breaks ties between
    equally optimal moves pseudo-randomly.
  - **4×4** (and other boards of at most 16 cells) - minimax capped at four
    plies, then a line heuristic.
  - **5×5 and up** - the line heuristic only: take an immediate win, block an
    immediate loss, otherwise maximise the value of the lines the move
    improves, with a nudge towards the centre. A 10×10 move is answered in a
    few milliseconds instead of freezing the page.

## Sound and motion

Everything is generated in the browser. There are no audio files, no fonts
beyond the two Google Fonts already used, no canvas and no animation library:
the sounds are oscillators and the animations are CSS transforms.

### Sounds (Web Audio API)

`src/utils/sound.ts` builds every sound from oscillators, gains, a low-pass
filter and one small convolution reverb. X is lime and sharp, O is cyan and
round, so a player can *hear* whose mark just landed:

| Sound | What it is |
| --- | --- |
| `placeX` | 440 → 880 Hz sine sweep plus a 660 Hz triangle: a sharp upward blip |
| `placeO` | 300 → 150 Hz sine sweep through a 900 Hz low-pass: a deep bubble |
| `hover` | 800 Hz, 40 ms tick, throttled to one per 100 ms |
| `win` | C5-E5-G5-C6 arpeggio (523 / 659 / 784 / 1046 Hz) with a 0.2 s reverb |
| `lose` | 320 → 214 Hz drop |
| `draw` | 400 Hz and 350 Hz together, 10 Hz tremolo |
| `click` | 600 Hz square, 50 ms |
| `turn` | 500 Hz, 60 ms - the turn passes in two-player mode |
| `invalid` | 150 Hz sawtooth through a 600 Hz filter - an occupied cell |
| `score` | 900 Hz pop plus a 1200 Hz sparkle |

- One shared mute flag (`setSoundMuted`) is driven by the header speaker
  button, so any component can play a sound without prop plumbing.
- The `AudioContext` is created lazily on the first interaction (a click, a
  hover or a key press) and resumed if the browser suspended it, which is what
  gets around the autoplay policy.
- Every call is wrapped: if the API is missing, blocked or throws mid-note, the
  game simply stays silent.

### Motion

| Where | Effect |
| --- | --- |
| Placing a mark | elastic `mark-pop` (0.2 → 1.22 → 0.96 → 1 with rotation), staggered `mark-bar` sweep for the X, a 14px ring pushed out of the cell (`shockwave-lime` / `shockwave-cyan`), 2px board kick (`shake`) |
| Empty cell, small grids | `cell-breathe` border pulse (2s); hover turns the border lime on X's turn and cyan on O's turn, with a 20px glow |
| Winning line | lime→cyan gradient, `laser-glow` pulse, plus `win-pulse` on the three winning cells |
| Win | 18 confetti pieces, generated from the index (never `Math.random` in render) and thrown from the winning line with gravity |
| Score | the tile glows, the number bounces (`score-bounce`) and a `+1` floats up (`score-plus`) |
| Turn indicator | the dot pulses to 1.6× (`dot-pulse`) |
| Result banner | spring slide-in from below with overshoot |
| Buttons and pills | `scale(0.96)` on press |
| Board size change | the new board fades and scales in (`board-morph`) |

Everything animates `transform`, `opacity`, `box-shadow` or `filter` only, so it
stays on the compositor. Rings use `box-shadow` rather than a child element
because a cell clips its own overflow, and idle breathing is limited to the
small grids: 100 pulsing borders on a 10×10 would cost more than it is worth.

`prefers-reduced-motion: reduce` neutralises every one of these (the durations
collapse to a single frame), while the game and the sounds keep working.

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
- `prefers-reduced-motion: reduce` disables every animation and transition
  (pop, shockwave, magnetic kick, confetti, laser, breathing borders) while
  keeping the instant state change, and sound is only ever played inside the
  same tolerant wrapper.

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
  Presence additionally needs **Realtime → Realtime Authorization → private
  channels** enabled; without it the board still synchronises but the opponent's
  dot reads "Opponent appears to be offline". Cosmetic only.
- The client falls back to polling every 2.5 seconds if realtime is
  unavailable. The game still works, just with a slightly higher latency.
- Rooms expire after two hours. There is no automatic deletion - run
  `online_expire_rooms()` (see above).
- **Room permissions** are enforced in three places: the UI (`getPermissions`
  hides host-only controls from the guest), the controller (`useOnlineRoom`
  refuses to create a second room while one is open) and the database (every
  table write privilege is revoked; `leave_online_room` decides the outcome from
  the `is_owner` seat and a closed room refuses every join). There is no kick,
  transfer or separate delete-room RPC: the host "deletes" a room by leaving,
  which closes it.
- Anonymous sign-in is enabled per Supabase project. If it is disabled the
  online mode cannot create a guest session.
- For a public deployment, add a CAPTCHA (for example Cloudflare Turnstile)
  in front of the room creation endpoint - anonymous sign-in alone does not
  prevent scripted abuse.
- The room history is capped at 20 entries; the statistics live in the browser
  profile of each player.
- Online statistics are stored **locally per browser**. They are not
  synchronised between devices and are not global.
- The hard AI is only *unbeatable* on 3×3. On bigger boards it searches four
  plies (4×4) or plays a line heuristic (5×5 and up), so a strong human can win.
- An online room keeps the board size it was created with. On a 10×10 room the
  cells are small on a phone (38 px at 1400 px wide, ~14 px at 320 px), so the
  large sizes are best played on a desktop. Rooms are always 3 to 10 per side
  and at most 100 cells; the server rejects anything else.
- Sound effects use the Web Audio API. Browsers block audio until the first
  interaction, so the context is created on the first click, hover or key press;
  before that (or if the API is blocked entirely) the game is unaffected and
  simply stays silent.
