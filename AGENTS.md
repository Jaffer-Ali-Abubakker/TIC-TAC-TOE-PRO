# AGENTS.md — Tic-Tac-Toe Pro

> **Read this file first if you are an agent (or a new developer) picking this repository up.**
> It is the complete, verified state of the project: what exists, why it was built that way,
> which invariants must not be broken, how to verify your changes, and which traps will bite you.
>
> The user-facing documentation lives in [`README.md`](./README.md). This file is the *engineering*
> handoff: it is more verbose, more opinionated and more focused on "how do I safely change this".

---

## 1. What this project is

A complete, production-quality Tic-Tac-Toe web game with **three** modes:

- **Player vs Computer** — a local AI (easy / medium / unbeatable hard).
- **Two Players** — share one device.
- **Online Multiplayer** — two people on two devices, synchronised in real time
  against a **server-authoritative** PostgreSQL database (Supabase).

Everything is client-side except the online mode, which uses Supabase
(PostgreSQL + Auth + Realtime) so that the *database* decides whether a move is
legal. There is no other backend, no Redis, no external WebSocket server, no
paid API.

**The project is feature complete and verified.** Every acceptance criterion of
the original brief — and of the online-multiplayer upgrade — has been met; see
§3.

---

## 2. Current state: DONE and verified

Everything below was actually executed in this workspace, not merely planned.

| Check | Command | Result |
| --- | --- | --- |
| Types | `npm run typecheck` | ✅ passes, 0 errors |
| Lint | `npm run lint` | ✅ passes, 0 problems |
| Tests | `npm run test:run` | ✅ **226 tests / 13 files, all passing** |
| Database tests | `npm run test:db` | ✅ **37 tests** — the real migration on a real PostgreSQL engine |
| Coverage | `npm run test:coverage` | ✅ ~88 % stmts · ~93 % lines · ~97 % funcs |
| Build | `npm run build` | ✅ succeeds → `dist/` (304 kB JS / 93 kB gzip + a 214 kB lazy Supabase chunk) |
| Dev server | `npm run dev` | ✅ verified serving HTTP 200 on `http://localhost:5173/` |
| Preview server | `npm run preview` | ✅ verified serving the production build |
| Visual QA | headless Chrome (§15) | ✅ desktop 1400 px, mobile 320 px, local modes, online lobby, waiting room, active match, all dialogs |
| Horizontal overflow @ 320 px | headless Chrome harness | ✅ `clientWidth 320 / scrollWidth 320` — none, in every mode |
| Online end-to-end | mock PostgREST/Auth server + headless Chrome | ✅ create → invite → join → move → turn change, all via the real RPC surface |
| Dependency audit | `npm install` | ✅ 0 vulnerabilities |

**Environment used for verification:** Windows 11, PowerShell, Node `v22.23.2`, npm `10.9.8`.

**Not verified (needs your Supabase account):** a real hosted Supabase project,
Realtime delivery between two physical devices, and a production deployment.
See §20.

---

## 3. Acceptance criteria → where it lives

| Requirement | Implementation | Verified by |
| --- | --- | --- |
| Player vs computer | `src/App.tsx` (AI scheduling), `src/game/ai.ts` | `src/App.test.tsx`, `src/game/ai.test.ts` |
| Two player mode | `src/game/gameReducer.ts` (`mode: 'pvp'`) | `src/App.test.tsx` "two player mode" |
| Online multiplayer | `src/online/*`, `src/components/online/*` | `src/online/*.test.ts`, `src/App.online.test.tsx` |
| AI difficulty choice | `src/components/GameControls.tsx`, `SettingsDialog.tsx` | `src/App.test.tsx` |
| Score + statistics | `src/components/ScoreBoard.tsx`, `MatchStats.tsx` | `src/App.test.tsx`, `src/game/gameReducer.test.ts` |
| Restart round / new match | `src/components/GameControls.tsx` + `ConfirmDialog.tsx` | `src/App.test.tsx` "round and match management" |
| Local persistence | `src/utils/storage.ts`, `src/hooks/usePersistentState.ts` | `src/utils/storage.test.ts`, `src/App.test.tsx` |
| Versioned storage schema | `src/utils/storage.ts` (v1 → v2 migration) | `src/utils/storage.test.ts` |
| Polished animations / a11y | `src/styles/index.css`, `src/components/*` | `src/App.test.tsx` "accessibility" |
| All 8 win lines + draws | `src/game/gameLogic.ts` | `src/game/gameLogic.test.ts` |
| Easy / Medium / Hard AI | `src/game/ai.ts` | `src/game/ai.test.ts` |
| Hard never loses | minimax + exhaustive DFS | `src/game/ai.test.ts` "never loses in any legal reachable game" |
| Score exactly once per round | single reducer transition | `src/game/gameReducer.test.ts` "scoring" |
| Authoritative server moves | `public.submit_online_move` | `supabase/tests/online_multiplayer.test.ts` |
| Atomic / concurrency safe | `FOR UPDATE` + version CAS | `supabase/tests/online_multiplayer.test.ts` |
| RLS + restricted grants | migration sections 5 & 6 | `supabase/tests/online_multiplayer.test.ts` "direct table writes" |
| Idempotent retries | `online_moves(room_id, move_id)` unique | `supabase/tests/online_multiplayer.test.ts` |
| Rematch requires both players | `public.request_online_rematch` | `supabase/tests/online_multiplayer.test.ts` "rematch" |
| Reconnect recovery | `src/online/useOnlineRoom.ts` | `src/online/useOnlineRoom.test.tsx` |
| Missing config does not break offline play | `src/online/config.ts` | `src/App.online.test.tsx` "missing configuration" |
| Sound toggle (Web Audio) | `src/utils/sound.ts` | `src/utils/sound.test.ts` |
| Settings + confirmation dialogs | `src/components/SettingsDialog.tsx`, `ConfirmDialog.tsx` | `src/App.test.tsx` "settings and statistics" |

---

## 4. Running it

```powershell
cd "E:\TIC-TAC-TOE PRO"
npm install          # once
npm run dev          # http://localhost:5173
```

```powershell
npm run build        # tsc -b && vite build  →  dist/
npm run preview      # serve dist/  (add: -- --port 5200)
npm run typecheck    # tsc -b --pretty
npm run lint         # eslint .
npm test             # vitest, watch mode
npm run test:run     # vitest run  (CI)
npm run test:coverage
npm run test:db      # only the database security tests
npm run test:online  # only the online multiplayer tests
```

> PowerShell note: to pass extra flags through npm use `npm run dev -- --host`
> or `npm run preview -- --port 5200`.

---

## 5. Stack (exact installed versions — do not casually upgrade)

```
react 19.3.1            react-dom 19.3.1
typescript 6.0.3        vite 8.3.4            @vitejs/plugin-react 6.1.2
tailwindcss 4.3.3       @tailwindcss/vite 4.3.3
lucide-react 1.60.0
@supabase/supabase-js 2.118.0
vitest 5.0.5            jsdom 30.1.3          @vitest/coverage-v8 5.0.5
@electric-sql/pglite 0.5.10                 # local PostgreSQL for the db tests
@testing-library/react 16.3.3   @testing-library/jest-dom 7.0.1
@testing-library/user-event 14.6.8
eslint 10.13.0          typescript-eslint 8.72.0
eslint-plugin-react-hooks 7.1.1  eslint-plugin-react-refresh 0.5.7
@eslint/js 10.0.1       globals 17.13.0
```

Runtime dependencies: `react`, `react-dom`, `lucide-react`,
`@supabase/supabase-js`. **Keep it that way.**

Engine floors: Node `^20.19.0 || >=22.12.0` (Vite), `^22.12.0 || ^24 || >=26` (Vitest 5).
Node **22.13+** is the practical requirement.

---

## 6. Architecture at a glance

```
              LOCAL MODES                         ONLINE MODE
        ┌────────────────────┐           ┌──────────────────────────────┐
        │ useReducer         │           │ useOnlineRoom()              │
        │  (gameReducer.ts)  │           │  · anonymous session         │
        │  · authoritative   │           │  · create / join / leave     │
        │    board state     │           │  · realtime + polling        │
        │  · score books     │           │  · submit move (RPC)         │
        └─────────┬──────────┘           └───────────┬──────────────────┘
                  │                                  │
        ┌─────────▼──────────┐           ┌───────────▼──────────────────┐
        │ src/game/          │           │ src/online/onlineApi.ts       │
        │  gameLogic.ts      │           │  → rpc('submit_online_move')  │
        │  ai.ts             │           │  → rpc('join_online_room')   │
        │  gameReducer.ts    │           └───────────┬──────────────────┘
        └─────────┬──────────┘                       │
                  │                    ┌─────────────▼──────────────────┐
                  │                    │ PostgreSQL (Supabase)          │
                  │                    │  online_rooms                  │
                  │                    │  online_room_players           │
                  │                    │  online_moves (idempotency)    │
                  │                    │  SECURITY DEFINER functions    │
                  │                    │  Row Level Security            │
                  │                    └────────────────────────────────┘
                  ▼
        src/components/*  —  14 local + 5 online components
        (props only, no game logic)
```

**The single most important architectural rule:**

> **All game logic lives in `src/game/`. Components receive state via props and never compute
> game state themselves.** If you find yourself writing `if (board[0] === board[1] ...)` inside a
> component, you are doing it wrong — put it in `gameLogic.ts` and export it.
>
> The online mode adds a second rule: **the client never decides what is legal.**
> A move is a request; the database is the judge. The client may pre-emptively
> grey out a cell, but the *only* thing that changes the board is a successful
> `submit_online_move` RPC.

---

## 7. File-by-file map

### `src/game/` — the engine (React-free, DOM-free, unit-testable)

| File | Responsibility |
| --- | --- |
| `types.ts` | `Player`, `Cell`, `Board`, `GameMode` (`pvc`/`pvp`/`online`), `Difficulty`, `GameStatus`, `RoundResult`, `Stats` (`PvcStats`/`PvpStats`/`OnlineStats`), `HistoryEntry`, `opponentOf()`. |
| `gameLogic.ts` | The rules engine. `BOARD_SIZE=9`, `WINNING_COMBINATIONS` (8 lines), `createInitialBoard`, `getWinner`, `getWinningCombination`, `isBoardFull`, `getGameStatus`, `getAvailableMoves`, `isValidIndex`, `makeMove` (throws `InvalidMoveError` with a `code`), `canPlayAt`, `boardKey`, `CENTER_INDEX`, `CORNER_INDICES`. Pure, never mutates. |
| `ai.ts` | `chooseMove(board, player, difficulty, random?)` → index or `null`. `chooseEasyMove`, `chooseMediumMove`, `chooseHardMove`, `minimax`, `findImmediateWin`, `evaluatePosition`. Randomness is **injected**. Memoisation cache keyed `boardKey|aiPlayer|playerToMove|depth`. |
| `gameReducer.ts` | `GameState`, `GameAction`, `gameReducer`, `createInitialGameState`, the `applyOnlineState` action, and the selectors `getPlayerLabel`, `getComputerSymbol`, `isComputerTurn`, `hasActiveRound`. Contains the **only** place where scores/history are mutated. |

### `src/online/` — the online module

| File | Responsibility |
| --- | --- |
| `config.ts` | Reads and validates `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_APP_URL`. Returns `{ ok: true, config }` or `{ ok: false, error, missing }` with a human readable message. |
| `supabase.ts` | Creates the Supabase client **lazily and dynamically** (`import('@supabase/supabase-js')`), so the library is only downloaded when the online mode is used. `getOnlineConfig`, `isOnlineConfigured`, `getSupabaseClient`, `resetSupabaseClient` (tests). |
| `roomCode.ts` | `normalizeRoomCode`, `isValidRoomCode`, `formatRoomCode`, `buildInviteLink`, `parseRoomCodeFromUrl`, `sanitizeDisplayName`, `stripControlCharacters`, `isValidDisplayName`, `createMoveId`. Pure, no Supabase import. |
| `onlineApi.ts` | Typed wrappers around the RPC functions (`createOnlineRoom`, `joinOnlineRoom`, `fetchOnlineRoomState`, `submitOnlineMove`, `requestOnlineRematch`, `leaveOnlineRoom`), the `online:<code>` → friendly message mapping, `parseOnlineErrorCode`, `toOnlineError` and `parseOnlineRoomState` (validates the payload before it reaches the UI). |
| `useOnlineSession.ts` | Anonymous sign-in. `getSession()` → `signInAnonymously()` fallback, `onAuthStateChange` for token refresh, `ensureSession()`. |
| `useOnlineRoom.ts` | The room controller: create/join/leave, the realtime subscription, the 2.5 s polling safety net, move submission with a reusable move id, rematch, reconnection, the version guard, the connection status and the display name. |

### `src/components/online/`

`OnlineLobby.tsx` (create / join / invitation) · `OnlineWaitingRoom.tsx` (code, copy,
share, leave) · `OnlinePlayersBar.tsx` (both players + connection status) ·
`OnlineActions.tsx` (rematch + leave) · `OnlineSetupNotice.tsx` ("not configured").

### `src/components/` — the local UI (14 components, all presentational)

`Dialog.tsx` · `ConfirmDialog.tsx` · `SettingsDialog.tsx` · `GameHeader.tsx` ·
`GameBoard.tsx` · `GameCell.tsx` · `GameControls.tsx` · `SegmentedControl.tsx` ·
`Toggle.tsx` · `ScoreBoard.tsx` · `MatchStats.tsx` · `MatchHistory.tsx` ·
`GameResult.tsx` · `TurnIndicator.tsx`.

### `src/utils/`, `src/hooks/`, `src/test/`

| File | Responsibility |
| --- | --- |
| `utils/storage.ts` | Versioned persistence. `STORAGE_KEY`, `STORAGE_VERSION = 2`, `MAX_HISTORY_ENTRIES = 20`, `validatePersistedState`, `migratePersistedState` (v1 → v2), `loadPersistedState` / `savePersistedState` / `clearPersistedState` (never throw), `isStorageAvailable()`. |
| `utils/sound.ts` | Web Audio effects (`move`, `win`, `lose`, `draw`), lazy `AudioContext`, `resume()`, every failure swallowed. |
| `utils/clipboard.ts` | `copyToClipboard` (Clipboard API → `execCommand` fallback), `shareOrCopy` (Web Share API → clipboard fallback). |
| `hooks/usePersistentState.ts` | Reads synchronously on mount, de-duplicates writes by serialised signature, probes storage availability once. |
| `test/setup.ts` | jest-dom, cleanup, `matchMedia` / `scrollTo` polyfills. |
| `test/fakeSupabase.ts` | A controllable fake Supabase client: per-RPC handlers, a fake auth layer and fake realtime channels with `emitChange` / `emitPresence`. |

### `supabase/`

| File | Responsibility |
| --- | --- |
| `migrations/0001_online_multiplayer.sql` | The whole backend: tables, constraints, helper functions, the six client-facing RPCs, RLS policies, grants, the realtime publication and the private channel policy. |
| `config.toml` | Supabase CLI project configuration (anonymous sign-in and realtime authorization are enabled). |
| `tests/harness.ts` | Runs the real migration on PGlite with a small Supabase shim (`auth.users`, `auth.uid()`, the `authenticated`/`anon`/`service_role` roles). |
| `tests/online_multiplayer.test.ts` | 35 database security and behaviour tests. |
| `tests/online_multiplayer_sql.test.ts` | Executes the SQL editor script end to end. |
| `tests/online_multiplayer.sql` | The script you paste into the Supabase SQL editor. |

---

## 8. Domain rules (memorise these — they are the product)

### Board & rules

- 9 cells, values `X` | `O` | `null`. Board is `readonly Cell[]`.
- **X always moves first.** In `pvc` mode, if the human plays **O**, the computer (X) therefore
  opens the round. In the online mode the room creator is X.
- A player may only select an **empty** cell.
- Winning lines: rows `0-1-2, 3-4-5, 6-7-8`; columns `0-3-6, 1-4-7, 2-5-8`;
  diagonals `0-4-8, 2-4-6`.
- `getGameStatus` order is **win first, then full board**. A full board with a line is a *win*,
  never a draw. A round can never be both.
- A finished round rejects every further move — this is what makes double scoring impossible.

### Scoring policy (documented, implemented, tested)

- A round counts **only** when it reaches a terminal state. Restarting / abandoning does not count.
- The score is updated **exactly once**, in the same reducer transition that detects the result.
- Three **separate** score books so switching modes never mislabels history:
  - `stats.pvc` → `playerWins` (you), `computerWins`, `draws`, `rounds`
  - `stats.pvp` → `xWins` (Player 1), `oWins` (Player 2), `draws`, `rounds`
  - `stats.online` → `xWins`, `oWins`, `draws`, `rounds` — **local to each browser**, never global.
- `roundNumber` (1-based) = `stats[mode].rounds + 1`.
- History: newest first, capped at 20 entries.
- **Restart round** = clear the board only. **New match** = board + scores + history.
  **Reset statistics** = scores + history only.

### Online rules

| Situation | Behaviour |
| --- | --- |
| Creator of a room | Seated as **X**, room is `waiting` |
| Second distinct user | Seated as **O**, room becomes `active` |
| The creator tries to join their own room | Rejected (`online:already_in_room`) — a user can never hold both seats |
| A third user | Rejected (`online:room_full`) |
| Move out of turn | Rejected (`online:not_your_turn`) |
| Move on an occupied cell | Rejected (`online:cell_taken`) |
| Move based on an outdated board | Rejected (`online:stale_version`) |
| The same move id sent twice | Applied **once** (idempotent) |
| Rematch | Only starts once **both** players have requested it; the X symbol **alternates** |
| A player leaves an active match | The match ends; **no forfeit win is awarded** |
| The owner leaves a waiting room | The room expires |
| A room is older than 2 hours | Expired (by `online_expire_rooms()`) |

### AI behaviour

| Difficulty | Algorithm |
| --- | --- |
| **Easy** | Uniformly random legal cell. |
| **Medium** | 1) take an immediate win → 2) block an immediate opponent win → 3) centre → 4) a corner → 5) random legal cell. |
| **Hard** | Minimax, memoised. Win `WIN_SCORE - depth` (10−depth), loss `LOSS_SCORE + depth` (−10+depth), draw `0`. Ties broken pseudo-randomly. |

---

## 9. The state machine

`GameState` (all fields):

```ts
mode            'pvc' | 'pvp' | 'online'
difficulty      'easy' | 'medium' | 'hard'
humanSymbol     'X' | 'O'          // which symbol the human controls in pvc
soundEnabled    boolean
board           Board
currentPlayer   Player
status          'playing' | 'won' | 'draw'
winner          Player | null
winningCombination number[] | null
roundNumber     number             // 1-based
roundId         number             // increments on every new round
movesPlayed     number
lastMoveIndex   number | null
stats           Stats
history         HistoryEntry[]
onlineSymbol    Player | null      // the symbol this browser plays online
onlineVersion   number             // version of the last applied snapshot
onlineCountedRound number           // round whose outcome was already counted
```

`GameAction` union: `playMove` · `applyOnlineState` · `newRound` · `newMatch` ·
`setMode` · `setDifficulty` · `setHumanSymbol` · `setSoundEnabled` · `resetStats`.

### Invariants you must not break

1. **`playMove` is a no-op** when: the `roundId` does not match, the status is not `playing`,
   the player is not `currentPlayer`, the index is not an integer in range, or the cell is occupied.
   It is **always** a no-op when `mode === 'online'`.
2. **Scores and history are only written inside `recordOutcome`**, which is only reachable from the
   `playing → terminal` branch of `playMove` or from `applyOnlineState`. Do not add score updates
   anywhere else.
3. **`roundId` increments on every new round** (`newRound`, `newMatch`, `setMode`,
   `setHumanSymbol`). It is the cancellation token for asynchronous computer moves.
4. **`setMode` and `setHumanSymbol` always start a fresh round.**
5. **The computer reply is protected twice**: the effect cleanup clears the `setTimeout` when the
   board/round changes, *and* the dispatched `playMove` carries the `roundId` it was scheduled for.
6. **`applyOnlineState` ignores any snapshot whose `version` is older** than `onlineVersion`.
   That is what makes a duplicated or out-of-order realtime event harmless.
7. **An online round is counted exactly once**: `applyOnlineState` only records the outcome when
   `snapshot.roundNumber > onlineCountedRound`.
8. **The client never decides legality.** `submitOnlineMove` is the only thing that changes an
   online board.

### The online controller (`useOnlineRoom`)

- The Supabase client is loaded **lazily**; the actions use `client ?? await getSupabaseClient()`
  so a click that happens before the client finished loading still works.
- The realtime channel is created **before** `subscribe()` is called (see trap 16).
- `applyState` drops any snapshot with an older version.
- A move keeps its `moveId` in `lastAttemptRef` so a retry of the same cell is idempotent.
- The phase is **derived** from the room, never stored, so a stale phase is impossible.

---

## 10. Traps and gotchas (read before you touch the code)

These are real bugs that were found and fixed during the build. Re-introducing any of them is a
regression.

1. **Minimax loss sign.** The loss value is `LOSS_SCORE + depth` (i.e. `−10 + depth`).
   Writing `depth - LOSS_SCORE` produces a *positive* score, which makes "hard" cheerfully walk
   into losing positions.
2. **Board focus movement.** `GameBoard` moves focus with
   `containerRef.current?.querySelector('[data-index="N"]')?.focus()`. It does **not** use a ref
   array on the cells. If you refactor `GameCell`, **keep the `data-index` attribute**.
3. **Cells use `aria-disabled`, not `disabled`.** A natively `disabled` button is removed from the
   tab order, so the cell you just played would drop focus to `<body>`.
4. **A native `<dialog>` is not used.** jsdom does not implement `showModal()`, and `offsetParent`
   in jsdom always returns `null`. The custom `Dialog` exists for exactly those two reasons.
5. **The Dialog focus trap must not filter on `offsetParent`** — it filters on
   `hidden` / `aria-hidden` instead.
6. **Tailwind v4 has no `tailwind.config.js`.** Design tokens live in the `@theme { … }` block in
   `src/styles/index.css`.
7. **Vitest is configured inside `vite.config.ts`** (the `test` key + `/// <reference
   types="vitest/config" />`). There is deliberately no `vitest.config.ts`.
8. **`erasableSyntaxOnly: true`** ⇒ no `enum`, no `namespace`, no constructor parameter properties.
9. **`verbatimModuleSyntax: true`** ⇒ type-only imports must use `import type { … }`.
10. **`noUnusedLocals` / `noUnusedParameters` are on** ⇒ an unused import or parameter **fails the
    build**. Remove dead exports rather than silencing the rule.
11. **React 19 StrictMode double-invokes effects in dev.** The AI and realtime effects must be
    idempotent; they are.
12. **`usePersistentState` de-duplicates writes by JSON signature.** Do not call `persist()` in a
    render loop.
13. **Test helpers rely on exact labels.** The cell `aria-label` format is
    `Row {r}, column {c}: {empty|X|O|…}` and the `data-testid` values are listed in the
    components.
14. **Never call `Math.random()` directly in the AI.** Use the injected `random` parameter.
15. **`lucide-react` v1 renamed some icons.** Verified to exist in v1.60: `X`, `Circle`, `Grid3x3`,
    `Settings`, `Volume2`, `VolumeX`, `RotateCcw`, `Trophy`, `Bot`, `Users`, `Trash`,
    `TriangleAlert`, `Clock`, `Crown`, `Handshake`, `Medal`, `Sparkles`, `Gauge`, `Zap`, `Shield`,
    `Check`, `ChevronRight`, `ChartColumn`, `Globe`, `User`, `ListOrdered`.
    **Do not exist in v1:** `History`, `Trash2`, `AlertTriangle`, `BarChart3`, `Grid3x3Icon`, `XIcon`.
16. **Create the realtime channel before subscribing.** If the channel is created inside a chain
    (`client.channel(...).on(...).subscribe(cb)`) and the implementation calls `cb` synchronously,
    the callback runs while `channel` is still in its temporal dead zone →
    *"Cannot access 'channel' before initialization"*. Split the chain.
17. **RLS policies are evaluated *in addition to* table privileges.** `REVOKE ALL … FROM
    authenticated` makes the policies unreachable — the query fails with *permission denied* before
    the policy is ever consulted. The migration grants `SELECT` to `authenticated` and revokes
    only the write privileges. (This was a real bug caught by the database tests.)
18. **A rematch must only be allowed when the match is over.** The first implementation raised
    `game_not_finished` only for `status = 'waiting'`, which meant two players could reset the
    board **in the middle of a running game**. The check is now `status <> 'finished'`.
19. **The SQL editor runs as the `postgres` superuser, which bypasses RLS.** The verification script
    therefore switches to the `authenticated` role inside an explicit transaction
    (`begin; set local role authenticated; … commit;`). `SET LOCAL` is reverted by the COMMIT (or by
    the implicit ROLLBACK), so the session role never leaks.
20. **The Supabase client must stay dynamically imported.** A static import pushed the main chunk
    over 500 kB. `getSupabaseClient()` returns a promise and the library is only fetched when the
    online mode is used.

---

## 11. Design system

Tokens are defined once, in `src/styles/index.css`, inside the Tailwind v4 `@theme` block.

```
Surfaces   --color-ink-950 #04060d … --color-ink-600 #29365c
Text       --color-mist-500 … --color-mist-100 #e9eefa
Accents    --color-glow-cyan #22d3ee   (primary / X)
           --color-glow-violet #a78bfa (secondary / O)
           --color-glow-emerald #34d399 (win)  --color-glow-amber #fbbf24 (draw)
           --color-glow-rose #fb7185 (loss)
Radii      --radius-card 1.125rem
Font       --font-sans: system stack (NO web font is downloaded)
```

Reusable CSS classes defined by hand in the same file: `.panel`, `.panel-inset`, `.brand-mark`,
`.cell-button`, `.segmented-option`, `.app-shell`, `.grid-texture`.

Motion keyframes: `symbol-pop` (260 ms), `win-pulse` (1.5 s loop), `result-in` (220 ms),
`think-pulse` (1.1 s loop) — all neutralised by a `prefers-reduced-motion: reduce` block.

Layout rules that must be preserved:

- Mobile-first, board is `max-w-[min(92vw,26rem)] md:max-w-[min(92vw,30rem)]` — always square cells.
- `body` and `.app-shell` both have `overflow-x: hidden`.
- Desktop uses `lg:grid-cols-[minmax(0,1fr)_20rem]` — the board stays the primary focus.
- Bottom padding uses `pb-[max(1rem,env(safe-area-inset-bottom))]`.
- Dialogs: `max-h-[calc(100dvh-1.5rem)] overflow-y-auto`.

---

## 12. Accessibility contract

- The board is a **single tab stop** with a roving tab index; `Arrow` keys move focus, `Enter`
  and `Space` place a symbol.
- Cells expose position and content via `aria-label`, and their state via `aria-disabled`.
- Turn changes, round results and connection changes are announced through `role="status"`
  live regions.
- Dialogs: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, focus moved inside, focus
  trapped, `Escape` closes, focus restored to the trigger.
- X and O differ by **shape** (cross vs. circle) as well as colour.
- Every interactive element has a visible focus ring; hover effects only apply to controls that
  can actually be used.
- Reduced motion is honoured globally.

---

## 13. Testing strategy

226 tests in 13 files. `src/test/setup.ts` imports `@testing-library/jest-dom/vitest`, cleans up
after each test and polyfills `matchMedia` / `scrollTo`.

| Suite | Focus |
| --- | --- |
| `src/game/gameLogic.test.ts` | All winning lines for both symbols, draw detection, win-beats-full-board, invalid indices, occupied cells, moves after win/draw, immutability. |
| `src/game/ai.test.ts` | Easy always legal; medium wins / blocks / centre / corner; hard wins forced wins, avoids forced losses, **is optimal in every reachable position**, **never loses as X and never loses as O**, works with either symbol, returns `null` for finished games. |
| `src/game/gameReducer.test.ts` | Turn alternation, rejections, scoring exactly once, per-mode score books, history capped at 20, round/match/mode/symbol flows, the online snapshot path and its version guard. |
| `src/utils/storage.test.ts` | Validation, field repair, the v1 → v2 migration, corrupted JSON, blocked `localStorage`. |
| `src/utils/sound.test.ts` | Oscillator creation, multi-tone win/draw, no-throw when the API is missing or the context fails. |
| `src/online/roomCode.test.ts` | Code normalisation and validation, formatting, invite link build/parse, display name sanitising, move id format. |
| `src/online/config.test.ts` | Missing variables, malformed URLs, valid configuration, the app URL fallback. |
| `src/online/onlineApi.test.ts` | Payload validation, the `online:<code>` → friendly message mapping, the exact RPC arguments, error conversion. |
| `src/online/useOnlineRoom.test.tsx` | Create / join / leave, invalid codes, friendly errors, move submission with the right version, **move id reuse on retry**, the turn guard, the version guard, the realtime subscription, refresh on a realtime event, subscription cleanup. |
| `src/App.test.tsx` | The local modes end to end. |
| `src/App.online.test.tsx` | The online lobby, room creation, joining by code, invite links, the setup notice, rematch and the connection status. |
| `supabase/tests/online_multiplayer.test.ts` | The **real migration** on a real PostgreSQL engine: unauthenticated rejection, seat allocation, the third player, a non-member, direct writes, illegal moves, idempotency, win/draw detection, rematch, leaving, the expiry sweep. |
| `supabase/tests/online_multiplayer_sql.test.ts` | Runs the SQL editor script from start to finish and checks that it cleans up. |

### Conventions to follow when adding tests

- Prefer `getByRole` with an accessible-name regex; avoid `getByTestId` except for the documented
  ids.
- Cell helper in `App.test.tsx`:
  ```ts
  function cell(row: number, column: number) {
    return screen.getByRole('button', { name: new RegExp(`^Row ${row}, column ${column}:`) })
  }
  ```
  Rows and columns are **1-based**.
- `userEvent.setup({ delay: null })` makes clicks instantaneous — use it when a test must finish
  before a timer fires (the computer delay is 420 ms).
- `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })` + `vi.useFakeTimers()` **hangs** in
  this setup; prefer real timers with `waitFor`.
- The database suites need a long timeout: PGlite starts a WASM PostgreSQL
  (`beforeAll(..., 120_000)`).
- Never weaken a test to make it pass — fix the implementation.

---

## 14. The database layer

Read `supabase/migrations/0001_online_multiplayer.sql` before touching it. The complete
public API is:

| Function | Signature | What it does |
| --- | --- | --- |
| `create_online_room` | `(p_display_name text) → jsonb` | Creates a room with a CSPRNG code, seats the caller as **X** (owner), status `waiting`. |
| `join_online_room` | `(p_join_code text, p_display_name text) → jsonb` | Seats the caller as **O** under a row lock, flips the room to `active`. Rejects a second seat for the same user and a third player. |
| `get_online_room_state` | `(p_join_code text) → jsonb` | Returns the authoritative snapshot **and** refreshes the caller's `last_seen_at`. Members only. |
| `submit_online_move` | `(p_join_code text, p_cell_index int, p_expected_version int, p_move_id uuid) → jsonb` | Validates and applies **exactly one** move. |
| `request_online_rematch` | `(p_join_code text) → jsonb` | Sets the caller's rematch flag; starts a new round once both are set. |
| `leave_online_room` | `(p_join_code text) → jsonb` | Removes the membership and expires / finishes the room. |
| `online_expire_rooms` | `() → int` | Marks abandoned rooms as expired. **Operations only** — not granted to `authenticated`. |

Every client-facing error uses the `online:<code>` vocabulary. The complete list, and what the
UI shows for it:

| Code | Meaning | User-facing message |
| --- | --- | --- |
| `online:unauthenticated` | No session (or it expired) | "Your session expired. Reload the page…" |
| `online:rate_limited` | Too many rooms per hour | "Too many attempts. Please wait a minute…" |
| `online:invalid_code` | The code is not 8 valid characters | "That room code is not valid…" |
| `online:room_not_found` | No such room | "No room with that code was found…" |
| `online:room_expired` | The room is older than 2 hours | "That room has expired…" |
| `online:room_finished` | The match is already over | "That match has already finished." |
| `online:room_full` | Two players are seated | "That room is already full…" |
| `online:already_in_room` | The caller already has a seat | "You already have a seat in this room." |
| `online:not_a_member` | The caller is not in the room | "You are not a player of this room." |
| `online:game_not_active` | The room is not `active` | "The match is not running." |
| `online:game_finished` | A result already exists | "The match is already over." |
| `online:game_not_finished` | A rematch was requested too early | "A rematch can only be requested once the match is over." |
| `online:not_your_turn` | It is the opponent's turn | "It is not your turn." |
| `online:stale_version` | The board changed on the other device | "The board changed on the other device…" |
| `online:cell_taken` | The cell is no longer empty | "That cell was just taken." |
| `online:invalid_cell` | The index is not 0-8 | "That is not a valid cell." |
| `online:invalid_move_id` | The idempotency key is missing | "The move could not be identified…" |
| `online:code_generation_failed` | 5 code collisions in a row | "The room code could not be generated…" |

Two more codes exist only on the client (they are never raised by the database):

| Code | Meaning | User-facing message |
| --- | --- | --- |
| `network` | The request never reached the server | "The connection failed. Check your network and try again." |
| `unknown` | Anything else, including an unmapped database error | "Something went wrong. Please try again." |

Any other error is mapped to a generic "Something went wrong" — **SQL errors, stack traces and
secrets are never shown to the user** (`parseOnlineErrorCode` in `src/online/onlineApi.ts`).

Key properties of the layer:

- `SECURITY DEFINER` functions with `set search_path = public, pg_temp`.
- The player identity always comes from `auth.uid()`.
- `submit_online_move` locks the room row with `FOR UPDATE` **and** compares `expected_version`.
- `online_moves (room_id, move_id)` is unique → retries are idempotent.
- `online_room_players` has a primary key on `(room_id, user_id)` and a **deferrable** unique
  constraint on `(room_id, player_symbol)` — deferrable is what makes the symbol swap during a
  rematch possible in one transaction.
- RLS is enabled on all three tables. `SELECT` is granted to `authenticated`; every write
  privilege is revoked and there are no write policies.
- The functions are executable by `authenticated` only; `anon` and `PUBLIC` are revoked.
- `online_is_room_member()` is `SECURITY DEFINER` so the policies can call it without recursing.
- Room codes are generated from `gen_random_uuid()` (the OS CSPRNG) mapped onto a 32 character
  alphabet, 8 characters = 2^40 possibilities.

### Operational jobs

Rooms expire after two hours. The cleanup is **not** automatic - schedule it with `pg_cron`
in the Supabase SQL editor:

```sql
select cron.schedule(
  'expire-online-rooms',
  '*/10 * * * *',
  'select public.online_expire_rooms();'
);
```

`online_expire_rooms()` never touches a room that is still `active`, so a live match can never
be removed by the job.

---

## 15. Visual QA workflow (headless Chrome)

The machine has Chrome and Edge. A plain `--screenshot` call is limited by a minimum window
width, so **verify narrow viewports through an iframe harness**:

1. Write a harness HTML into `dist/` (same origin as the preview server, so the iframe is
   same-origin and can be scripted). It should report
   `document.documentElement.clientWidth` vs `scrollWidth` and drive the UI.
2. `npm run build`, then `npm run preview -- --port 5200`.
3. Screenshot:
   ```powershell
   & "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --disable-gpu `
     --hide-scrollbars --window-size=400,1500 --screenshot="$env:TEMP\shot.png" `
     --virtual-time-budget=9000 "http://localhost:5200/harness.html?w=320&h=1400"
   ```
4. **Delete the harness from `dist/` afterwards** (it is a build artifact directory) and remember
   that `npm run build` **wipes `dist/`**.

For the online mode you can additionally point the app at a throwaway mock of the Supabase
Auth/PostgREST endpoints (a small Node `http` server) and drive a full create → invite → join →
move session in the browser. That is how the online flow was verified locally. The mock is a
development aid only and is **not** part of the repository.

---

## 16. Known limitations (intentional)

- Local only for the local modes; the online mode needs a Supabase project.
- **Anonymous sessions are device/browser specific.** Clearing site data or losing the session
  means a new identity — the old seat cannot be reclaimed, and the room expires. There is no
  impersonation: a returning player with a new session simply cannot take the old seat.
- Realtime presence is best effort and is never used to award a win.
- The client polls every 2.5 s as a fallback when realtime is unavailable.
- Rooms expire after two hours; `online_expire_rooms()` must be scheduled (see the README).
- Online statistics are stored **locally per browser** — they are not global and not synchronised
  between devices.
- For a public deployment, add a CAPTCHA in front of room creation.

---

## 17. Possible next steps (not implemented — do not describe them as if they exist)

- E2E tests with Playwright against a real Supabase project.
- A signed-in account system on top of the anonymous session.
- Chat or emote between players.
- A server-side match history table (the current history is per browser).
- A "best of N" online match format.

If you add any of these, also update `README.md` **and** this file, and keep the README honest —
never document a command or a feature that does not exist.

---

## 18. Definition of done for any future change

A change is complete when **all** of the following are true and have actually been run:

```powershell
npm run typecheck    # 0 errors
npm run lint         # 0 problems
npm run test:run     # all tests pass (add new tests for new behaviour)
npm run build        # succeeds
```

Plus, for anything user-visible: a headless-Chrome screenshot at desktop **and** 320 px, with
`scrollWidth === clientWidth` confirmed for the narrow viewport.

If you touch the database, also run `npm run test:db` and re-run
`supabase/tests/online_multiplayer.sql` against the hosted project.

---

## 19. Change log of the work completed so far

**Phase 1 — the local game**

- Scaffolded Vite + React + TypeScript; removed all template/demo assets.
- Tailwind CSS 4 design-token system, 14 presentational components.
- Pure rules engine, the AI (easy/medium/hard minimax) and the reducer.
- Versioned, validated `localStorage` persistence with a de-duplicating hook.
- Web Audio sound effects with full failure tolerance.
- 128 automated tests, including an exhaustive proof that the hard AI never loses.

**Phase 2 — online multiplayer**

- Added `@supabase/supabase-js` (lazily imported) and the `src/online/` module.
- Added the `online` game mode, a third score book and the v1 → v2 storage migration.
- Wrote `supabase/migrations/0001_online_multiplayer.sql`: three tables, the six
  client-facing RPCs, RLS policies, restricted grants, the realtime publication and the
  private channel policy.
- Added the five `src/components/online/` components and wired them into `App.tsx`
  without changing the local screens.
- Added 5 new frontend test files (98 tests) and 2 database test files (37 tests) that run
  the **real migration** on a real PostgreSQL engine (PGlite).
- Added `.env.example`, `supabase/config.toml` and a paste-into-the-SQL-editor verification
  script.
- Fixed four real bugs found by the new tests: the RLS/privilege interaction, the mid-game
  rematch, the realtime channel temporal-dead-zone error and the missing `SELECT` grant.

---

## 20. What is still unverified

These need **your** accounts and cannot be checked from this workspace:

1. **A hosted Supabase project.** The migration, the RLS policies and the RPCs were verified
   against a real PostgreSQL engine, but not against Supabase's hosted stack (GoTrue, PostgREST,
   Realtime, the `auth` schema, the `supabase_realtime` publication).
2. **Realtime delivery between two devices.** The client was verified against a mock
   PostgREST/Auth server; the Supabase Realtime websocket was not available locally, so the
   client fell back to polling (which works). Enable *Realtime Authorization* in the dashboard
   before relying on the realtime path.
3. **A production deployment.** `npm run build` succeeds and `vercel.json` / `netlify.toml`
   are correct, but nothing has been deployed.
4. **Anonymous sign-in in a real project.** The dashboard toggle has to be enabled.

The exact steps are in the README under *Online multiplayer setup*.

---

*Last verified: 2026-10-20 — Windows 11, Node v22.23.2, npm 10.9.8.
226/226 tests passing (incl. 37 database tests on a real PostgreSQL engine) · typecheck clean ·
lint clean · production build clean.*
