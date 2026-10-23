import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { GameHeader } from './components/GameHeader'
import { ScoreBoard } from './components/ScoreBoard'
import { GameBoard } from './components/GameBoard'
import { GameControls } from './components/GameControls'
import { GameResult } from './components/GameResult'
import { TurnIndicator } from './components/TurnIndicator'
import { MatchStats } from './components/MatchStats'
import { MatchHistory } from './components/MatchHistory'
import { SettingsDialog } from './components/SettingsDialog'
import { ConfirmDialog } from './components/ConfirmDialog'
import { OnlineLobby } from './components/online/OnlineLobby'
import { OnlineWaitingRoom } from './components/online/OnlineWaitingRoom'
import { OnlinePlayersBar } from './components/online/OnlinePlayersBar'
import { OnlineActions } from './components/online/OnlineActions'
import { OnlineSetupNotice } from './components/online/OnlineSetupNotice'
import { usePersistentState } from './hooks/usePersistentState'
import {
  createInitialGameState,
  gameReducer,
  getComputerSymbol,
  hasActiveRound,
  isComputerTurn,
  type GameState,
} from './game/gameReducer'
import { chooseMove } from './game/ai'
import type { Difficulty, GameMode, Player } from './game/types'
import { playSound } from './utils/sound'
import {
  STORAGE_VERSION,
  createDefaultPersistedState,
  isStorageAvailable,
  loadPersistedState,
  savePersistedState,
  type PersistedState,
} from './utils/storage'
import { readOnlineConfig } from './online/config'
import { parseRoomCodeFromUrl } from './online/roomCode'
import { useOnlineRoom } from './online/useOnlineRoom'

/** Delay before the computer answers, to feel natural. */
const AI_THINK_DELAY_MS = 420

interface PendingConfirm {
  title: string
  description: string
  confirmLabel: string
  destructive?: boolean
  action: () => void
}

function initGameState(persisted: PersistedState): GameState {
  const base = createInitialGameState()
  return {
    ...base,
    mode: persisted.mode,
    difficulty: persisted.difficulty,
    humanSymbol: persisted.humanSymbol,
    soundEnabled: persisted.soundEnabled,
    stats: persisted.stats,
    history: persisted.history,
  }
}

export default function App() {
  const { value: persisted, persist, available } = usePersistentState<PersistedState>({
    load: loadPersistedState,
    save: savePersistedState,
    initialValue: createDefaultPersistedState(),
    isAvailable: isStorageAvailable,
  })

  const [state, dispatch] = useReducer(gameReducer, persisted, initGameState)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null)

  const online = useOnlineRoom()
  const onlineConfig = useMemo(() => readOnlineConfig(), [])

  /** The room code from an invite link, if the page was opened with one. */
  const inviteCode = useMemo(() => {
    if (typeof window === 'undefined') return null
    return parseRoomCodeFromUrl(window.location.href)
  }, [])

  const computerSymbol = getComputerSymbol(state)
  const thinking = isComputerTurn(state)
  const { roundId, board, difficulty } = state

  /* ---------------------------------------------------------------- *
   * Persistence
   * ---------------------------------------------------------------- */
  const persistedPayload = useMemo<PersistedState>(
    () => ({
      version: STORAGE_VERSION,
      mode: state.mode,
      difficulty: state.difficulty,
      humanSymbol: state.humanSymbol,
      soundEnabled: state.soundEnabled,
      stats: state.stats,
      history: state.history,
    }),
    [
      state.mode,
      state.difficulty,
      state.humanSymbol,
      state.soundEnabled,
      state.stats,
      state.history,
    ],
  )

  useEffect(() => {
    persist(persistedPayload)
  }, [persistedPayload, persist])

  /* ---------------------------------------------------------------- *
   * Computer move (local modes only)
   * ---------------------------------------------------------------- */
  useEffect(() => {
    if (!thinking) return

    const player = computerSymbol

    const timer = window.setTimeout(() => {
      const index = chooseMove(board, player, difficulty)
      if (index === null) return
      // The round id guard makes sure a stale reply can never touch a newer
      // round (for example after a restart or a mode change).
      dispatch({ type: 'playMove', index, player, roundId })
    }, AI_THINK_DELAY_MS)

    return () => window.clearTimeout(timer)
  }, [thinking, board, difficulty, computerSymbol, roundId])

  /* ---------------------------------------------------------------- *
   * Online mode
   * ---------------------------------------------------------------- */

  // An invitation opens the online mode, but the seat is never taken
  // automatically - the visitor has to confirm it.
  useEffect(() => {
    if (inviteCode) dispatch({ type: 'setMode', mode: 'online' })
  }, [inviteCode])

  // The database is the authority: apply the authoritative snapshot.
  const onlineRoom = online.room
  useEffect(() => {
    if (!onlineRoom) return

    const result = onlineRoom.room.result
    const status =
      result === 'draw' ? 'draw' : onlineRoom.room.winnerSymbol ? 'won' : 'playing'

    dispatch({
      type: 'applyOnlineState',
      snapshot: {
        board: onlineRoom.room.board,
        currentTurn: onlineRoom.room.currentTurn,
        status,
        winnerSymbol: onlineRoom.room.winnerSymbol,
        winningCombination: onlineRoom.room.winningCombination,
        roundNumber: onlineRoom.room.roundNumber,
        movesPlayed: onlineRoom.room.movesPlayed,
        lastMoveIndex: onlineRoom.room.lastMoveIndex,
        version: onlineRoom.room.version,
        result,
      },
      mySymbol: onlineRoom.mySymbol,
    })
  }, [onlineRoom])

  /* ---------------------------------------------------------------- *
   * Sound
   * ---------------------------------------------------------------- */
  const lastSoundMoveRef = useRef(-1)

  useEffect(() => {
    if (!state.soundEnabled) return
    if (state.movesPlayed === 0) return
    if (state.movesPlayed === lastSoundMoveRef.current) return
    lastSoundMoveRef.current = state.movesPlayed

    if (state.status === 'won' && state.winner !== null) {
      const computerWon = state.mode === 'pvc' && state.winner !== state.humanSymbol
      const opponentWon = state.mode === 'online' && state.winner !== state.onlineSymbol
      playSound(computerWon || opponentWon ? 'lose' : 'win')
      return
    }
    if (state.status === 'draw') {
      playSound('draw')
      return
    }
    playSound('move')
  }, [
    state.soundEnabled,
    state.movesPlayed,
    state.status,
    state.winner,
    state.mode,
    state.humanSymbol,
    state.onlineSymbol,
  ])

  /* ---------------------------------------------------------------- *
   * Actions
   * ---------------------------------------------------------------- */
  const requestConfirm = useCallback((pending: PendingConfirm) => {
    setPendingConfirm(pending)
  }, [])

  const handleCellSelect = useCallback(
    (index: number) => {
      if (state.mode === 'online') {
        void online.submitMove(index)
        return
      }
      if (state.status !== 'playing') return
      if (state.board[index] !== null) return

      const player: Player = state.mode === 'pvp' ? state.currentPlayer : state.humanSymbol
      if (state.currentPlayer !== player) return

      dispatch({ type: 'playMove', index, player })
    },
    [state.status, state.board, state.mode, state.currentPlayer, state.humanSymbol, online],
  )

  const handleModeChange = useCallback(
    (mode: GameMode) => {
      if (mode === state.mode) return

      const leavingOnline = state.mode === 'online' && mode !== 'online'
      const enteringOnline = mode === 'online' && state.mode !== 'online'

      if (leavingOnline && online.room) {
        requestConfirm({
          title: 'Leave the online room?',
          description:
            'The online match will be ended for both players. The local modes are not affected.',
          confirmLabel: 'Leave room',
          destructive: true,
          action: () => {
            void online.leaveRoom()
            dispatch({ type: 'setMode', mode })
          },
        })
        return
      }

      if (enteringOnline) {
        dispatch({ type: 'setMode', mode })
        return
      }

      if (hasActiveRound(state)) {
        requestConfirm({
          title: 'Switch game mode?',
          description:
            'The round in progress will be discarded and a new round will start in the selected mode.',
          confirmLabel: 'Switch mode',
          action: () => dispatch({ type: 'setMode', mode }),
        })
        return
      }
      dispatch({ type: 'setMode', mode })
    },
    [state, online, requestConfirm],
  )

  const handleDifficultyChange = useCallback((difficulty: Difficulty) => {
    dispatch({ type: 'setDifficulty', difficulty })
  }, [])

  const handleHumanSymbolChange = useCallback((symbol: Player) => {
    dispatch({ type: 'setHumanSymbol', symbol })
  }, [])

  const handleSoundChange = useCallback((enabled: boolean) => {
    dispatch({ type: 'setSoundEnabled', enabled })
  }, [])

  const handleRestart = useCallback(() => {
    if (hasActiveRound(state)) {
      requestConfirm({
        title: 'Restart the round?',
        description: 'The moves played in this round will be discarded and the board reset.',
        confirmLabel: 'Restart round',
        action: () => dispatch({ type: 'newRound' }),
      })
      return
    }
    dispatch({ type: 'newRound' })
  }, [state, requestConfirm])

  const handleNewMatch = useCallback(() => {
    if (hasActiveRound(state)) {
      requestConfirm({
        title: 'Start a new match?',
        description: 'The current round will be discarded and all scores and history will reset.',
        confirmLabel: 'New match',
        destructive: true,
        action: () => dispatch({ type: 'newMatch' }),
      })
      return
    }
    dispatch({ type: 'newMatch' })
  }, [state, requestConfirm])

  const handleResetStats = useCallback(() => {
    setSettingsOpen(false)
    requestConfirm({
      title: 'Reset all statistics?',
      description:
        'All wins, draws, completed rounds and the round history for every mode will be permanently deleted.',
      confirmLabel: 'Reset statistics',
      destructive: true,
      action: () => dispatch({ type: 'resetStats' }),
    })
  }, [requestConfirm])

  const handleConfirm = useCallback(() => {
    const pending = pendingConfirm
    setPendingConfirm(null)
    pending?.action()
  }, [pendingConfirm])

  const handleCancelConfirm = useCallback(() => {
    setPendingConfirm(null)
  }, [])

  /* ---------------------------------------------------------------- *
   * Render
   * ---------------------------------------------------------------- */
  const isOnline = state.mode === 'online'
  const onlineRoomState = online.room
  const onlineStatus = onlineRoomState?.room.status ?? null
  const waitingForOpponent = isOnline && onlineStatus === 'waiting'
  const endedWithoutWinner = isOnline && onlineStatus === 'finished' && !onlineRoomState?.room.result

  const boardInteractive = isOnline
    ? state.status === 'playing' &&
      online.mySymbol !== null &&
      state.currentPlayer === online.mySymbol &&
      !online.busy
    : state.status === 'playing' &&
      (state.mode === 'pvp' || state.currentPlayer === state.humanSymbol)

  const boardPanel = (
    <section className="panel panel-raised p-4 sm:p-6" aria-label="Game">
      <TurnIndicator
        mode={state.mode}
        currentPlayer={state.currentPlayer}
        humanSymbol={state.humanSymbol}
        isThinking={thinking}
        mySymbol={state.onlineSymbol}
        waitingForOpponent={waitingForOpponent}
      />

      <div className="my-6 sm:my-8">
        <GameBoard
          board={state.board}
          winningCombination={state.winningCombination}
          lastMoveIndex={state.lastMoveIndex}
          currentPlayer={state.currentPlayer}
          isInteractive={boardInteractive}
          onSelect={handleCellSelect}
        />
      </div>

      <GameResult
        status={state.status}
        winner={state.winner}
        mode={state.mode}
        humanSymbol={state.humanSymbol}
        roundNumber={state.roundNumber}
        mySymbol={state.onlineSymbol}
        endedWithoutWinner={endedWithoutWinner}
      />
    </section>
  )

  return (
    <div className="app-shell">
      <div className="grid-texture pointer-events-none fixed inset-0 -z-10" aria-hidden="true" />

      <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-4 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:gap-5 sm:px-5 sm:pt-6">
        <GameHeader
          mode={state.mode}
          soundEnabled={state.soundEnabled}
          onToggleSound={() => handleSoundChange(!state.soundEnabled)}
          onOpenSettings={() => setSettingsOpen(true)}
          onModeChange={handleModeChange}
        />

        <div className="main-container">
          <main className="board-stage">
            {!isOnline ? (
              <ScoreBoard
                mode={state.mode}
                stats={state.stats}
                humanSymbol={state.humanSymbol}
                currentPlayer={state.currentPlayer}
                status={state.status}
                roundNumber={state.roundNumber}
                completedRounds={state.stats[state.mode].rounds}
              />
            ) : null}

            {isOnline && !onlineConfig.ok ? (
              <OnlineSetupNotice message={onlineConfig.error} missing={onlineConfig.missing} />
            ) : isOnline && !onlineRoomState ? (
              <OnlineLobby
                displayName={online.displayName}
                onDisplayNameChange={online.setDisplayName}
                busy={online.busy}
                error={online.error}
                inviteCode={inviteCode}
                onCreate={() => void online.createRoom()}
                onJoin={(code) => void online.joinRoom(code)}
              />
            ) : isOnline && waitingForOpponent ? (
              <>
                <OnlinePlayersBar
                  players={onlineRoomState?.players ?? []}
                  myUserId={online.userId}
                  mySymbol={online.mySymbol}
                  connection={online.connection}
                  opponentPresent={online.opponentPresent}
                  roundNumber={onlineRoomState?.room.roundNumber ?? 1}
                />
                <OnlineWaitingRoom
                  roomCode={onlineRoomState?.room.joinCode ?? ''}
                  inviteLink={online.inviteLink}
                  busy={online.busy}
                  onLeave={() => void online.leaveRoom()}
                />
              </>
            ) : isOnline ? (
              <>
                <OnlinePlayersBar
                  players={onlineRoomState?.players ?? []}
                  myUserId={online.userId}
                  mySymbol={online.mySymbol}
                  connection={online.connection}
                  opponentPresent={online.opponentPresent}
                  roundNumber={onlineRoomState?.room.roundNumber ?? 1}
                />
                {boardPanel}
              </>
            ) : (
              boardPanel
            )}

            <GameControls
              mode={state.mode}
              difficulty={state.difficulty}
              onDifficultyChange={handleDifficultyChange}
              onRestart={handleRestart}
              onNewMatch={handleNewMatch}
            >
              {isOnline &&
              onlineConfig.ok &&
              onlineRoomState &&
              onlineStatus !== 'waiting' ? (
                <OnlineActions
                  busy={online.busy}
                  canRematch={onlineStatus === 'finished'}
                  iRequestedRematch={online.iRequestedRematch}
                  opponentRequestedRematch={online.opponentRequestedRematch}
                  onRequestRematch={() => void online.requestRematch()}
                  onLeave={() => void online.leaveRoom()}
                />
              ) : null}
              {isOnline && onlineConfig.ok && onlineRoomState && online.error ? (
                <p
                  role="alert"
                  className="mt-3 rounded-xl border-2 border-glow-rose bg-glow-rose/10 px-3 py-2 text-sm text-glow-rose"
                >
                  {online.error}
                </p>
              ) : null}
            </GameControls>
          </main>

          <aside className="side-rail">
            <MatchStats mode={state.mode} stats={state.stats} />
            <MatchHistory history={state.history} mode={state.mode} />
          </aside>
        </div>

        <footer className="mt-4 text-center text-[13px] leading-relaxed text-mist-500">
          Tic-Tac-Toe Pro - local data stays in this browser. Tip: use the arrow keys to move
          across the board.
        </footer>
      </div>

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        mode={state.mode}
        difficulty={state.difficulty}
        humanSymbol={state.humanSymbol}
        soundEnabled={state.soundEnabled}
        storageAvailable={available}
        onSoundChange={handleSoundChange}
        onDifficultyChange={handleDifficultyChange}
        onHumanSymbolChange={handleHumanSymbolChange}
        onResetStats={handleResetStats}
      />

      <ConfirmDialog
        open={pendingConfirm !== null}
        title={pendingConfirm?.title ?? ''}
        description={pendingConfirm?.description ?? ''}
        confirmLabel={pendingConfirm?.confirmLabel ?? 'Confirm'}
        destructive={pendingConfirm?.destructive ?? false}
        onConfirm={handleConfirm}
        onCancel={handleCancelConfirm}
      />
    </div>
  )
}
