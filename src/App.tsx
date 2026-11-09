import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { GameHeader } from './components/GameHeader'
import { ScoreBoard } from './components/ScoreBoard'
import { GameBoard } from './components/GameBoard'
import { RoundControls, SettingsCards } from './components/GameControls'
import { GameResult } from './components/GameResult'
import { TurnIndicator } from './components/TurnIndicator'
import { MatchStats } from './components/MatchStats'
import { MatchHistory } from './components/MatchHistory'
import { RailSection } from './components/RailSection'
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
import { createInitialBoard, normaliseBoardSize } from './game/gameLogic'
import type { BoardSize, Difficulty, GameMode, Player } from './game/types'
import { playSound, setSoundMuted } from './utils/sound'
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
    boardSize: persisted.boardSize,
    board: createInitialBoard(persisted.boardSize),
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
  const { roundId, board, difficulty, boardSize } = state

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
      boardSize: state.boardSize,
      stats: state.stats,
      history: state.history,
    }),
    [
      state.mode,
      state.difficulty,
      state.humanSymbol,
      state.soundEnabled,
      state.boardSize,
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
      const index = chooseMove(board, player, difficulty, Math.random, boardSize)
      if (index === null) return
      // The round id guard makes sure a stale reply can never touch a newer
      // round (for example after a restart or a mode change).
      dispatch({ type: 'playMove', index, player, roundId })
    }, AI_THINK_DELAY_MS)

    return () => window.clearTimeout(timer)
  }, [thinking, board, difficulty, computerSymbol, roundId, boardSize])

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
        boardSize: {
          rows: onlineRoom.room.rows,
          cols: onlineRoom.room.cols,
          winLength: onlineRoom.room.winLength,
        },
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

  // One shared mute flag, so any component can play without prop plumbing.
  useEffect(() => {
    setSoundMuted(!state.soundEnabled)
  }, [state.soundEnabled])

  // Buttons click, cells do not (they have their own place sound).
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const button = target.closest('button, .segmented-option')
      if (!button || button.classList.contains('cell-button')) return
      playSound('click')
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [])

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

    const placed = state.lastMoveIndex === null ? null : state.board[state.lastMoveIndex]
    playSound(placed === 'O' ? 'placeO' : 'placeX')
  }, [
    state.soundEnabled,
    state.movesPlayed,
    state.status,
    state.winner,
    state.mode,
    state.humanSymbol,
    state.onlineSymbol,
    state.board,
    state.lastMoveIndex,
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
      if (state.board[index] !== null) {
        playSound('invalid')
        return
      }

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

  const handleBoardSizeChange = useCallback(
    (rows: number, cols: number) => {
      const size: BoardSize | null = normaliseBoardSize(rows, cols)
      if (!size) return
      if (size.rows === state.boardSize.rows && size.cols === state.boardSize.cols) return

      const apply = () => dispatch({ type: 'setBoardSize', rows: size.rows, cols: size.cols })
      // The online lobby picks the size of a room that does not exist yet, so
      // there is no round on screen to discard.
      if (state.mode !== 'online' && hasActiveRound(state)) {
        requestConfirm({
          title: 'Change board size?',
          description: `The round in progress will be discarded and a new ${size.rows}×${size.cols} round will start. The scores are kept.`,
          confirmLabel: 'Change board size',
          action: apply,
        })
        return
      }
      apply()
    },
    [state, requestConfirm],
  )

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

  // Spotlight follows the pointer. Only on devices with a fine pointer.
  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches) return
    const track = (event: PointerEvent) => {
      document.body.style.setProperty('--mouse-x', `${event.clientX}px`)
      document.body.style.setProperty('--mouse-y', `${event.clientY}px`)
    }
    window.addEventListener('pointermove', track, { passive: true })
    return () => window.removeEventListener('pointermove', track)
  }, [])

  /* ---------------------------------------------------------------- *
   * Render
   * ---------------------------------------------------------------- */
  const isOnline = state.mode === 'online'
  const onlineRoomState = online.room
  const onlineStatus = onlineRoomState?.room.status ?? null
  const waitingForOpponent = isOnline && onlineStatus === 'waiting'
  const endedWithoutWinner = isOnline && onlineStatus === 'finished' && !onlineRoomState?.room.result
  // The board (and its status row) is hidden while the online lobby asks for a room.
  const showBoard =
    !isOnline || (onlineConfig.ok && onlineRoomState !== null && !waitingForOpponent)

  const boardInteractive = isOnline
    ? state.status === 'playing' &&
      online.mySymbol !== null &&
      state.currentPlayer === online.mySymbol &&
      !online.busy
    : state.status === 'playing' &&
      (state.mode === 'pvp' || state.currentPlayer === state.humanSymbol)

  const boardPanel = (
    <section className="panel stage-board p-3 sm:p-4" aria-label="Game">
      <GameBoard
        key={`${boardSize.rows}x${boardSize.cols}`}
        board={state.board}
        rows={boardSize.rows}
        cols={boardSize.cols}
        winningCombination={state.winningCombination}
        lastMoveIndex={state.lastMoveIndex}
        currentPlayer={state.currentPlayer}
        isInteractive={boardInteractive}
        onSelect={handleCellSelect}
      />
    </section>
  )

  return (
    <div className="app-shell">
      <div className="scene" aria-hidden="true">
        <span className="scene-grid" />
        <span className="scene-blob scene-blob--lime" />
        <span className="scene-blob scene-blob--cyan" />
      </div>

      <GameHeader
        mode={state.mode}
        soundEnabled={state.soundEnabled}
        onToggleSound={() => handleSoundChange(!state.soundEnabled)}
        onOpenSettings={() => setSettingsOpen(true)}
        onModeChange={handleModeChange}
      />

      <div className="main-container">
        <aside className="side-rail side-rail--left">
          <RailSection title="Match statistics">
            <MatchStats mode={state.mode} stats={state.stats} />
          </RailSection>
          <RailSection title="Recent rounds">
            <MatchHistory history={state.history} mode={state.mode} />
          </RailSection>
        </aside>

        <main className="board-stage">
          {showBoard ? (
            <div className="stage-status">
              <GameResult
                status={state.status}
                winner={state.winner}
                mode={state.mode}
                humanSymbol={state.humanSymbol}
                roundNumber={state.roundNumber}
                mySymbol={state.onlineSymbol}
                endedWithoutWinner={endedWithoutWinner}
              />
              <TurnIndicator
                mode={state.mode}
                currentPlayer={state.currentPlayer}
                humanSymbol={state.humanSymbol}
                isThinking={thinking}
                mySymbol={state.onlineSymbol}
                waitingForOpponent={waitingForOpponent}
              />
            </div>
          ) : null}

          {isOnline && !onlineConfig.ok ? (
            <OnlineSetupNotice message={onlineConfig.error} missing={onlineConfig.missing} />
          ) : isOnline && !onlineRoomState ? (
            <OnlineLobby
              displayName={online.displayName}
              onDisplayNameChange={online.setDisplayName}
              boardSize={state.boardSize}
              onBoardSizeChange={handleBoardSizeChange}
              busy={online.busy}
              error={online.error}
              inviteCode={inviteCode}
              onCreate={() => void online.createRoom(state.boardSize)}
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
                boardSize={state.boardSize}
              />
              <OnlineWaitingRoom
                roomCode={onlineRoomState?.room.joinCode ?? ''}
                inviteLink={online.inviteLink}
                boardSize={state.boardSize}
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
                boardSize={state.boardSize}
              />
              {boardPanel}
            </>
          ) : (
            boardPanel
          )}

          {!isOnline ? (
            <ScoreBoard
              mode={state.mode}
              stats={state.stats}
              humanSymbol={state.humanSymbol}
              currentPlayer={state.currentPlayer}
              status={state.status}
            />
          ) : null}

          <RoundControls
            mode={state.mode}
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
                className="mt-3 rounded-xl border border-rose/40 bg-rose/10 px-3 py-2 text-sm text-rose"
              >
                {online.error}
              </p>
            ) : null}
          </RoundControls>
        </main>

        <aside className="side-rail side-rail--right">
          <SettingsCards
            mode={state.mode}
            difficulty={state.difficulty}
            boardSize={boardSize}
            onDifficultyChange={handleDifficultyChange}
            onBoardSizeChange={handleBoardSizeChange}
          />
        </aside>
      </div>

      <footer className="shrink-0 border-t border-white/5 px-4 py-3 text-center text-[12px] leading-relaxed text-muted">
        Tic-Tac-Toe Pro - local data stays in this browser. Tip: use the arrow keys to move across
        the board.
      </footer>

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
