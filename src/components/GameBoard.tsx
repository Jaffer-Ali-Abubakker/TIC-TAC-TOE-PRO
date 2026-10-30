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
 * The winning line is positioned inside its own grid area, so the browser does
 * the geometry: no measurement, no resize listener.
 */
const WINNING_LINES: Record<string, { area: string; kind: 'h' | 'v' | 'diag' | 'diag-inv' }> = {
  '0,1,2': { area: '1 / 1 / 2 / 4', kind: 'h' },
  '3,4,5': { area: '2 / 1 / 3 / 4', kind: 'h' },
  '6,7,8': { area: '3 / 1 / 4 / 4', kind: 'h' },
  '0,3,6': { area: '1 / 1 / 4 / 2', kind: 'v' },
  '1,4,7': { area: '1 / 2 / 4 / 3', kind: 'v' },
  '2,5,8': { area: '1 / 3 / 4 / 4', kind: 'v' },
  '0,4,8': { area: '1 / 1 / 4 / 4', kind: 'diag' },
  '2,4,6': { area: '1 / 1 / 4 / 4', kind: 'diag-inv' },
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
  const line = winning.length === 3 ? WINNING_LINES[[...winning].sort().join(',')] : undefined

  return (
    <div className="board-container">
      <div ref={containerRef} role="group" aria-label="Game board" className="board-grid">
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
        {line ? (
          <span
            aria-hidden="true"
            className={`winning-line winning-line--${line.kind}`}
            style={{ gridArea: line.area }}
          />
        ) : null}
      </div>
      <p className="sr-only">
        {`Current turn: ${currentPlayer}. Use the arrow keys to move between cells.`}
      </p>
    </div>
  )
}
