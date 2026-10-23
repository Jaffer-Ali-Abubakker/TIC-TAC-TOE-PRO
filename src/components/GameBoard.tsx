import { useCallback, useRef, useState, type KeyboardEvent } from 'react'
import { GameCell } from './GameCell'
import type { Board, Player } from '../game/types'

export interface GameBoardProps {
  board: Board
  winningCombination: number[] | null
  lastMoveIndex: number | null
  currentPlayer: Player
  /** `true` when the cell cannot be played (occupied, finished round, AI turn). */
  isInteractive: boolean
  onSelect: (index: number) => void
}

const ARROW_DELTAS: Record<string, { row: number; column: number }> = {
  ArrowUp: { row: -1, column: 0 },
  ArrowDown: { row: 1, column: 0 },
  ArrowLeft: { row: 0, column: -1 },
  ArrowRight: { row: 0, column: 1 },
}

/**
 * The 3x3 board.
 *
 * Uses a roving tab index so the whole board is a single tab stop and the
 * arrow keys move the focus between cells.
 */
export function GameBoard({
  board,
  winningCombination,
  lastMoveIndex,
  currentPlayer,
  isInteractive,
  onSelect,
}: GameBoardProps) {
  const [focusIndex, setFocusIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const focusCell = useCallback((index: number) => {
    setFocusIndex(index)
    containerRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.focus()
  }, [])

  const handleKeyDown = useCallback(
    (index: number, event: KeyboardEvent<HTMLButtonElement>) => {
      const delta = ARROW_DELTAS[event.key]
      if (!delta) return
      event.preventDefault()

      const row = Math.floor(index / 3) + delta.row
      const column = (index % 3) + delta.column
      if (row < 0 || row > 2 || column < 0 || column > 2) return

      focusCell(row * 3 + column)
    },
    [focusCell],
  )

  const winning = winningCombination ?? []

  return (
    <div
      ref={containerRef}
      role="group"
      aria-label="Game board"
      className="board-grid"
    >
      <div className="grid gap-2 sm:gap-3">
        {board.map((value, index) => (
          <GameCell
            key={index}
            index={index}
            value={value}
            row={Math.floor(index / 3)}
            column={index % 3}
            isWinning={winning.includes(index)}
            isLastMove={lastMoveIndex === index}
            isDisabled={!isInteractive || value !== null}
            tabIndex={index === focusIndex ? 0 : -1}
            onSelect={onSelect}
            onKeyDown={handleKeyDown}
          />
        ))}
      </div>
      <p className="sr-only">
        {`Current turn: ${currentPlayer}. Use the arrow keys to move between cells.`}
      </p>
    </div>
  )
}
